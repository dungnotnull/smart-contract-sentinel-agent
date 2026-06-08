"""
Sentence Embedder — Generate embeddings for knowledge brain entries.
Uses sentence-transformers (all-MiniLM-L6-v2) for fast, local embedding.
No API costs, works offline.
"""

import logging
import os
from pathlib import Path
from typing import List, Union
import numpy as np

logger = logging.getLogger(__name__)

# Default model
DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384  # Dimension for all-MiniLM-L6-v2


class SentenceEmbedder:
    """Generate sentence embeddings using sentence-transformers."""

    def __init__(self, model_name: str = DEFAULT_MODEL):
        self.model_name = model_name
        self.model = None
        self._load_model()

    def _load_model(self):
        """Load sentence-transformers model."""
        try:
            from sentence_transformers import SentenceTransformer
            logger.info(f"Loading sentence-transformers model: {self.model_name}")
            self.model = SentenceTransformer(self.model_name)
            logger.info("Model loaded successfully")
        except ImportError:
            logger.error("sentence-transformers not installed. Run: pip install sentence-transformers")
            raise
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise

    def encode(self, texts: Union[str, List[str]], batch_size: int = 32) -> np.ndarray:
        """
        Encode text(s) into embeddings.

        Args:
            texts: Single text or list of texts
            batch_size: Batch size for encoding (for lists)

        Returns:
            numpy array of shape (n_texts, embedding_dim)
        """
        if self.model is None:
            raise RuntimeError("Model not loaded")

        # Ensure we have a list
        single_input = isinstance(texts, str)
        texts_list = [texts] if single_input else texts

        try:
            embeddings = self.model.encode(
                texts_list,
                batch_size=batch_size,
                show_progress_bar=False,
                convert_to_numpy=True,
            )

            # Normalize embeddings
            embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

            return embeddings[0] if single_input else embeddings
        except Exception as e:
            logger.error(f"Encoding failed: {e}")
            raise

    def encode_paper_summary(self, summary: dict) -> np.ndarray:
        """Encode a paper summary into a single embedding vector."""
        # Combine title, key insight, and tags for embedding
        text_parts = [
            summary.get("title", ""),
            summary.get("key_insight", ""),
            " ".join(summary.get("tags", [])),
        ]

        text = ". ".join(filter(None, text_parts))
        return self.encode(text)

    def encode_multiple(self, summaries: List[dict]) -> np.ndarray:
        """Encode multiple paper summaries efficiently."""
        texts = []
        for summary in summaries:
            text_parts = [
                summary.get("title", ""),
                summary.get("key_insight", ""),
                " ".join(summary.get("tags", [])),
            ]
            text = ". ".join(filter(None, text_parts))
            texts.append(text)

        return self.encode(texts)

    def get_embedding_dim(self) -> int:
        """Get the dimension of embeddings."""
        return EMBEDDING_DIM

    def similarity(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """
        Calculate cosine similarity between two embeddings.

        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector

        Returns:
            Similarity score between -1 and 1
        """
        return np.dot(embedding1, embedding2)

    def batch_similarity(self, query_embedding: np.ndarray, embeddings: np.ndarray) -> np.ndarray:
        """
        Calculate similarity between query and multiple embeddings.

        Args:
            query_embedding: Query embedding vector
            embeddings: Array of embedding vectors

        Returns:
            Array of similarity scores
        """
        return np.dot(embeddings, query_embedding)


class CachedEmbedder(SentenceEmbedder):
    """Embedder with caching to avoid recomputing embeddings."""

    def __init__(self, model_name: str = DEFAULT_MODEL, cache_dir: str = None):
        super().__init__(model_name)
        self.cache_dir = Path(cache_dir or os.path.expanduser("~/.sentinel/embeddings"))
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.cache = {}

    def get_cache_key(self, text: str) -> str:
        """Generate cache key for text."""
        import hashlib
        return hashlib.md5(text.encode()).hexdigest()

    def encode(self, texts: Union[str, List[str]], batch_size: int = 32) -> np.ndarray:
        """Encode with caching."""
        # Ensure we have a list
        single_input = isinstance(texts, str)
        texts_list = [texts] if single_input else texts

        embeddings = []
        cache_misses = []

        # Check cache for each text
        for i, text in enumerate(texts_list):
            cache_key = self.get_cache_key(text)
            if cache_key in self.cache:
                embeddings.append(self.cache[cache_key])
            else:
                embeddings.append(None)  # Placeholder
                cache_misses.append((i, text))

        # Encode cache misses
        if cache_misses:
            miss_texts = [text for _, text in cache_misses]
            miss_embeddings = super().encode(miss_texts, batch_size)

            for (i, _), embedding in zip(cache_misses, miss_embeddings):
                embeddings[i] = embedding
                # Store in cache
                cache_key = self.get_cache_key(miss_texts[cache_misses.index((i, miss_texts[cache_misses.index((i, miss_texts[cache_misses.index((i, ...]))]))])])
                self.cache[cache_key] = embedding

        result = np.array(embeddings)
        return result[0] if single_input else result

    def save_cache(self):
        """Save embeddings cache to disk."""
        import pickle

        cache_file = self.cache_dir / "embeddings_cache.pkl"
        with open(cache_file, "wb") as f:
            pickle.dump(self.cache, f)
        logger.info(f"Saved {len(self.cache)} cached embeddings to {cache_file}")

    def load_cache(self):
        """Load embeddings cache from disk."""
        import pickle

        cache_file = self.cache_dir / "embeddings_cache.pkl"
        if cache_file.exists():
            with open(cache_file, "rb") as f:
                self.cache = pickle.load(f)
            logger.info(f"Loaded {len(self.cache)} cached embeddings from {cache_file}")
        else:
            self.cache = {}
