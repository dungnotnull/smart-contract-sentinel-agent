"""
Knowledge Brain Orchestrator — Main entry point for knowledge brain system.
Orchestrates paper crawling, LLM summarization, embedding, and indexing.

Provides:
- Nightly automated knowledge update
- Manual knowledge update
- Context query interface
- Statistics and health check
"""

import argparse
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from ml_pipeline.knowledge.llm_summarizer import LLMSummarizer, PaperSummary
from ml_pipeline.knowledge.embedder import SentenceEmbedder
from ml_pipeline.knowledge.hnsw_index import HNSWIndexManager, KnowledgeEntry
from ml_pipeline.knowledge.context_injector import ContextInjector

logger = logging.getLogger(__name__)

# Configuration
DEFAULT_INDEX_PATH = os.path.expanduser("~/.sentinel/knowledge-index/hnsw.index")
KNOWLEDGE_PAPERS_PATH = Path("knowledge/papers.json")
SECOND_KNOWLEDGE_BRAIN_PATH = Path("SECOND-KNOWLEDGE-BRAIN.md")


class KnowledgeBrain:
    """Main knowledge brain orchestrator."""

    def __init__(
        self,
        index_path: Optional[str] = None,
        embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2",
        llm_model: str = "deepseek-chat",
    ):
        self.index_path = index_path or DEFAULT_INDEX_PATH
        self.embedding_model = embedding_model
        self.llm_model = llm_model

        # Initialize components
        self.embedder = None
        self.index = None
        self.summarizer = None
        self.context_injector = None

    def initialize(self):
        """Initialize all components."""
        logger.info("Initializing Knowledge Brain...")

        # Initialize embedder
        self.embedder = SentenceEmbedder(self.embedding_model)

        # Initialize index manager
        self.index = HNSWIndexManager(embedding_dim=384, index_path=self.index_path)

        # Initialize LLM summarizer
        self.summarizer = LLMSummarizer(model=self.llm_model)

        # Initialize context injector
        self.context_injector = ContextInjector(
            self.index, self.embedder, max_context_entries=5
        )

        logger.info("Knowledge Brain initialized successfully")

    def update_knowledge(self, papers_path: Optional[str] = None) -> dict:
        """
        Update knowledge base with new papers.

        Args:
            papers_path: Path to papers JSON file (if different from default)

        Returns:
            Statistics about the update
        """
        if papers_path:
            papers_file = Path(papers_path)
        else:
            papers_file = KNOWLEDGE_PAPERS_PATH

        if not papers_file.exists():
            logger.warning(f"Papers file not found: {papers_file}")
            return {"status": "skipped", "reason": "papers_file_not_found"}

        # Load papers
        with open(papers_file) as f:
            papers = json.load(f)

        logger.info(f"Loaded {len(papers)} papers from {papers_file}")

        # Process papers
        added_count = 0
        failed_count = 0

        for paper in papers:
            try:
                # Summarize paper
                summary = self.summarizer.summarize_paper(paper)

                # Generate embedding
                embedding = self.embedder.encode_paper_summary(summary.__dict__)

                # Add to index
                entry_data = {
                    "title": summary.title,
                    "authors": summary.authors,
                    "year": summary.year,
                    "key_insight": summary.key_insight,
                    "applied_module": summary.applied_module,
                    "tags": summary.tags,
                    "relevance_score": summary.relevance_score,
                    "source": paper.get("source", "unknown"),
                    "url": paper.get("url", ""),
                }

                self.index.add_entry(embedding, entry_data)
                added_count += 1

            except Exception as e:
                logger.error(f"Failed to process paper '{paper.get('title', 'unknown')}': {e}")
                failed_count += 1

        # Save index
        self.index.save()

        stats = {
            "status": "success",
            "total_papers": len(papers),
            "added": added_count,
            "failed": failed_count,
            "total_entries": len(self.index.entries),
        }

        logger.info(f"Knowledge update complete: {stats}")
        return stats

    def query_context(
        self,
        query: str,
        k: int = 5,
        filter_module: Optional[str] = None,
    ) -> List[str]:
        """
        Query knowledge base for relevant context.

        Args:
            query: Query text
            k: Number of results
            filter_module: Optional module filter

        Returns:
            List of formatted context entries
        """
        if not self.context_injector:
            raise RuntimeError("Knowledge Brain not initialized")

        return self.context_injector.get_context_for_task(
            task_description=query,
            filter_module=filter_module,
            min_relevance=0.3,
        )

    def get_statistics(self) -> dict:
        """Get knowledge base statistics."""
        if not self.index:
            return {"status": "not_initialized"}

        index_stats = self.index.get_stats()
        module_stats = self.context_injector.get_statistics_by_module()

        return {
            "status": "ready",
            "index": index_stats,
            "by_module": module_stats,
            "last_updated": datetime.utcnow().isoformat(),
        }

    def health_check(self) -> dict:
        """Check if knowledge brain is healthy."""
        try:
            if not self.index or not self.embedder:
                return {"status": "unhealthy", "reason": "not_initialized"}

            entry_count = len(self.index.entries)

            return {
                "status": "healthy" if entry_count > 0 else "empty",
                "entries": entry_count,
                "index_path": self.index_path,
            }
        except Exception as e:
            return {"status": "unhealthy", "reason": str(e)}

    def update_second_knowledge_brain(self):
        """Update SECOND-KNOWLEDGE-BRAIN.md with recent entries."""
        if not SECOND_KNOWLEDGE_BRAIN_PATH.exists():
            logger.warning("SECOND-KNOWLEDGE-BRAIN.md not found")
            return

        # Get recent entries
        recent_entries = self.index.entries[-10:]  # Last 10 entries

        # Format entries
        formatted_entries = []
        for entry in recent_entries:
            formatted = f"""
### {entry.title} ({entry.year})
**Authors:** {entry.authors}
**Key Insight:** {entry.key_insight}
**Applied In:** {entry.applied_module}
**Tags:** {', '.join(entry.tags)}
**Source:** {entry.source}
**URL:** {entry.url}
"""
            formatted_entries.append(formatted)

        # Append to knowledge brain file
        with open(SECOND_KNOWLEDGE_BRAIN_PATH, "a") as f:
            f.write("\n\n## Auto-Generated Entries\n")
            f.write(f"*Generated at {datetime.utcnow().isoformat()}*\n\n")
            for entry in formatted_entries:
                f.write(entry + "\n")

        logger.info(f"Added {len(formatted_entries)} entries to SECOND-KNOWLEDGE-BRAIN.md")


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Knowledge Brain management")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Update command
    update_parser = subparsers.add_parser("update", help="Update knowledge base")
    update_parser.add_argument("--papers", "-p", help="Path to papers JSON file")

    # Query command
    query_parser = subparsers.add_parser("query", help="Query knowledge base")
    query_parser.add_argument("query", help="Query text")
    query_parser.add_argument("--k", type=int, default=5, help="Number of results")
    query_parser.add_argument("--module", "-m", help="Filter by module")

    # Stats command
    subparsers.add_parser("stats", help="Show statistics")

    # Health command
    subparsers.add_parser("health", help="Health check")

    args = parser.parse_args()

    # Initialize knowledge brain
    brain = KnowledgeBrain()
    brain.initialize()

    # Execute command
    if args.command == "update":
        stats = brain.update_knowledge(args.papers)
        print(json.dumps(stats, indent=2))

    elif args.command == "query":
        results = brain.query_context(args.query, k=args.k, filter_module=args.module)
        for result in results:
            print(result)
            print("-" * 80)

    elif args.command == "stats":
        stats = brain.get_statistics()
        print(json.dumps(stats, indent=2))

    elif args.command == "health":
        health = brain.health_check()
        print(json.dumps(health, indent=2))


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    main()
