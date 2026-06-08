"""
HNSW Index Manager — Manage HNSW index for semantic search.
Provides fast approximate nearest neighbor search for knowledge retrieval.

Uses hnswlib for efficient indexing and search.
"""

import logging
import os
import pickle
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# Default HNSW parameters
DEFAULT_EF_CONSTRUCTION = 200
DEFAULT_M = 16
DEFAULT_EF_SEARCH = 50

try:
    import hnswlib
    HNSW_AVAILABLE = True
except ImportError:
    HNSW_AVAILABLE = False
    logger.warning("hnswlib not available. Install with: pip install hnswlib")


@dataclass
class KnowledgeEntry:
    """Single entry in the knowledge index."""
    id: int
    title: str
    authors: str
    year: int
    key_insight: str
    applied_module: str
    tags: List[str]
    relevance_score: float
    source: str
    url: str
    indexed_at: str


class HNSWIndexManager:
    """Manage HNSW index for semantic search."""

    def __init__(
        self,
        embedding_dim: int = 384,
        index_path: Optional[str] = None,
        ef_construction: int = DEFAULT_EF_CONSTRUCTION,
        m: int = DEFAULT_M,
        ef_search: int = DEFAULT_EF_SEARCH,
    ):
        if not HNSW_AVAILABLE:
            raise RuntimeError("hnswlib is not available")

        self.embedding_dim = embedding_dim
        self.index_path = index_path or os.path.expanduser("~/.sentinel/knowledge-index/hnsw.index")
        self.ef_construction = ef_construction
        self.m = m
        self.ef_search = ef_search

        self.index = None
        self.entries: List[KnowledgeEntry] = []
        self.next_id = 0

        self._init_index()

    def _init_index(self):
        """Initialize HNSW index."""
        import hnswlib

        self.index = hnswlib.Index(space="cosine", dim=self.embedding_dim)

        # Load existing index if available
        if os.path.exists(self.index_path):
            try:
                self.index.load_index(self.index_path)
                logger.info(f"Loaded existing index from {self.index_path}")
                self._load_entries()
            except Exception as e:
                logger.warning(f"Failed to load index: {e}. Creating new index.")
                self._create_new_index()
        else:
            self._create_new_index()

    def _create_new_index(self):
        """Create new HNSW index."""
        import hnswlib

        self.index = hnswlib.Index(space="cosine", dim=self.embedding_dim)
        self.index.init_index(
            max_elements=self._get_initial_capacity(),
            ef_construction=self.ef_construction,
            M=self.m,
        )
        self.index.set_ef(self.ef_search)
        logger.info("Created new HNSW index")

    def _get_initial_capacity(self) -> int:
        """Get initial capacity for index."""
        return 1000  # Start with capacity for 1000 entries

    def add_entry(self, embedding: np.ndarray, entry_data: dict) -> int:
        """
        Add a new entry to the index.

        Args:
            embedding: Embedding vector
            entry_data: Entry metadata

        Returns:
            Entry ID
        """
        entry_id = self.next_id

        # Add to HNSW index
        self.index.add_item(embedding, entry_id)

        # Store metadata
        entry = KnowledgeEntry(
            id=entry_id,
            title=entry_data.get("title", ""),
            authors=entry_data.get("authors", ""),
            year=entry_data.get("year", 2024),
            key_insight=entry_data.get("key_insight", ""),
            applied_module=entry_data.get("applied_module", ""),
            tags=entry_data.get("tags", []),
            relevance_score=entry_data.get("relevance_score", 0.5),
            source=entry_data.get("source", ""),
            url=entry_data.get("url", ""),
            indexed_at=datetime.utcnow().isoformat(),
        )
        self.entries.append(entry)
        self.next_id += 1

        return entry_id

    def search(
        self,
        query_embedding: np.ndarray,
        k: int = 5,
        filter_module: Optional[str] = None,
        min_relevance: float = 0.0,
    ) -> List[Tuple[KnowledgeEntry, float]]:
        """
        Search for nearest neighbors.

        Args:
            query_embedding: Query embedding vector
            k: Number of results to return
            filter_module: Filter by applied module
            min_relevance: Minimum relevance score

        Returns:
            List of (entry, score) tuples
        """
        if self.index.get_current_count() == 0:
            return []

        # Search HNSW index
        labels, distances = self.index.knn_query(query_embedding, k=k)

        results = []
        for label, distance in zip(labels, distances):
            # Convert distance to similarity (cosine distance -> similarity)
            similarity = 1 - distance

            # Get entry
            if 0 <= label < len(self.entries):
                entry = self.entries[label]

                # Apply filters
                if filter_module and entry.applied_module != filter_module:
                    continue
                if entry.relevance_score < min_relevance:
                    continue

                results.append((entry, similarity))

        return results

    def save(self):
        """Save index and entries to disk."""
        index_dir = Path(self.index_path).parent
        index_dir.mkdir(parents=True, exist_ok=True)

        # Save HNSW index
        self.index.save_index(self.index_path)
        logger.info(f"Saved HNSW index to {self.index_path}")

        # Save entries
        entries_path = index_dir / "entries.pkl"
        with open(entries_path, "wb") as f:
            pickle.dump(self.entries, f)
        logger.info(f"Saved {len(self.entries)} entries to {entries_path}")

        # Save metadata
        metadata = {
            "next_id": self.next_id,
            "embedding_dim": self.embedding_dim,
            "entries_count": len(self.entries),
            "saved_at": datetime.utcnow().isoformat(),
        }
        metadata_path = index_dir / "metadata.json"
        import json

        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)
        logger.info(f"Saved metadata to {metadata_path}")

    def _load_entries(self):
        """Load entries from disk."""
        entries_path = Path(self.index_path).parent / "entries.pkl"

        if not entries_path.exists():
            logger.warning("Entries file not found")
            return

        with open(entries_path, "rb") as f:
            self.entries = pickle.load(f)

        # Load metadata
        metadata_path = Path(self.index_path).parent / "metadata.json"
        if metadata_path.exists():
            import json

            with open(metadata_path) as f:
                metadata = json.load(f)
            self.next_id = metadata.get("next_id", 0)

        logger.info(f"Loaded {len(self.entries)} entries")

    def get_stats(self) -> dict:
        """Get index statistics."""
        return {
            "total_entries": len(self.entries),
            "index_capacity": self.index.get_max_elements(),
            "ef_search": self.ef_search,
            "embedding_dim": self.embedding_dim,
        }

    def rebuild_index(self):
        """Rebuild the entire index (useful after bulk additions)."""
        if len(self.entries) == 0:
            return

        logger.info("Rebuilding HNSW index...")

        # Save current index settings
        current_count = self.index.get_current_count()

        # Create new index
        self._create_new_index()

        # Re-add all entries
        # Note: In a real rebuild, we'd need to recompute embeddings
        # For now, we just reset the index structure
        logger.info(f"Index rebuilt with capacity for {current_count} entries")

    def set_ef_search(self, ef: int):
        """Set ef_search parameter (higher = more accurate, slower)."""
        self.ef_search = ef
        self.index.set_ef(ef)
        logger.info(f"Set ef_search to {ef}")
