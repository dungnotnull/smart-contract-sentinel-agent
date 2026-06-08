"""
Knowledge Brain System — Self-improving knowledge corpus.
Provides automated paper crawling, LLM summarization, and semantic search.
"""

from ml_pipeline.knowledge.llm_summarizer import LLMSummarizer, PaperSummary
from ml_pipeline.knowledge.embedder import SentenceEmbedder, CachedEmbedder
from ml_pipeline.knowledge.hnsw_index import HNSWIndexManager, KnowledgeEntry
from ml_pipeline.knowledge.context_injector import ContextInjector, create_context_prompt
from ml_pipeline.knowledge.orchestrator import KnowledgeBrain

__all__ = [
    "LLMSummarizer",
    "PaperSummary",
    "SentenceEmbedder",
    "CachedEmbedder",
    "HNSWIndexManager",
    "KnowledgeEntry",
    "ContextInjector",
    "create_context_prompt",
    "KnowledgeBrain",
]
