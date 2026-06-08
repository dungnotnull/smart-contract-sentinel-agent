"""
Context Injection — Inject relevant knowledge into agent startup.
Provides top-k relevant knowledge entries based on current task context.
"""

import logging
from typing import List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class ContextInjector:
    """Inject relevant knowledge context at agent startup."""

    def __init__(self, index_manager, embedder, max_context_entries: int = 5):
        """
        Initialize context injector.

        Args:
            index_manager: HNSWIndexManager instance
            embedder: SentenceEmbedder instance
            max_context_entries: Maximum entries to inject
        """
        self.index = index_manager
        self.embedder = embedder
        self.max_context_entries = max_context_entries

    def get_context_for_task(
        self,
        task_description: str,
        filter_module: Optional[str] = None,
        min_relevance: float = 0.3,
    ) -> List[str]:
        """
        Get relevant knowledge entries for a task.

        Args:
            task_description: Description of the current task
            filter_module: Filter by specific module
            min_relevance: Minimum relevance score

        Returns:
            List of formatted context strings
        """
        try:
            # Generate query embedding
            query_embedding = self.embedder.encode(task_description)

            # Search index
            results = self.index.search(
                query_embedding,
                k=self.max_context_entries,
                filter_module=filter_module,
                min_relevance=min_relevance,
            )

            # Format results
            context_entries = []
            for entry, score in results:
                formatted = self._format_entry(entry, score)
                context_entries.append(formatted)

            logger.info(
                f"Found {len(context_entries)} relevant entries for task"
            )
            return context_entries
        except Exception as e:
            logger.error(f"Failed to get context: {e}")
            return []

    def _format_entry(self, entry, score: float) -> str:
        """Format a knowledge entry as context."""
        return f"""
**{entry.title}** ({entry.year})
*{entry.authors}*

Key Insight: {entry.key_insight}
Applied to: {entry.applied_module}
Tags: {', '.join(entry.tags)}
Relevance: {score:.2%}

Source: {entry.source}
URL: {entry.url}
"""

    def inject_into_prompt(self, base_prompt: str, task_description: str) -> str:
        """
        Inject relevant context into a system prompt.

        Args:
            base_prompt: Original system prompt
            task_description: Current task description

        Returns:
            Enhanced prompt with context
        """
        context_entries = self.get_context_for_task(task_description)

        if not context_entries:
            return base_prompt

        # Build context section
        context_section = "\n\n## Relevant Knowledge Base\n\n"
        context_section += "The following research papers and insights may be relevant:\n\n"

        for i, entry in enumerate(context_entries, 1):
            context_section += f"### Reference {i}\n{entry}\n"

        context_section += "\nUse this knowledge to inform your approach, but don't be limited by it.\n"

        # Inject context after the first paragraph
        lines = base_prompt.split("\n", 1)
        if len(lines) == 2:
            enhanced = lines[0] + context_section + "\n\n" + lines[1]
        else:
            enhanced = base_prompt + context_section

        return enhanced

    def get_relevant_papers_by_tag(
        self,
        tags: List[str],
        max_results: int = 10,
    ) -> List[str]:
        """
        Get papers matching specific tags.

        Args:
            tags: List of tags to search for
            max_results: Maximum results to return

        Returns:
            List of formatted paper entries
        """
        results = []

        for entry in self.index.entries:
            # Check if any tag matches
            if any(tag.lower() in [t.lower() for t in entry.tags] for tag in tags):
                formatted = self._format_entry(entry, entry.relevance_score)
                results.append(formatted)

                if len(results) >= max_results:
                    break

        logger.info(f"Found {len(results)} papers matching tags: {tags}")
        return results

    def get_statistics_by_module(self) -> dict:
        """Get statistics about knowledge entries by module."""
        stats = {}

        for entry in self.index.entries:
            module = entry.applied_module or "general"
            if module not in stats:
                stats[module] = {"count": 0, "avg_relevance": 0.0}

            stats[module]["count"] += 1
            stats[module]["avg_relevance"] += entry.relevance_score

        # Calculate averages
        for module in stats:
            count = stats[module]["count"]
            if count > 0:
                stats[module]["avg_relevance"] /= count

        return stats


def create_context_prompt(
    task_type: str,
    task_description: str,
    context_injector: ContextInjector,
) -> str:
    """
    Create a context-enhanced prompt for a specific task type.

    Args:
        task_type: Type of task (e.g., "detection", "simulation", "response")
        task_description: Description of the specific task
        context_injector: ContextInjector instance

    Returns:
    Enhanced prompt with relevant knowledge
    """
    base_prompts = {
        "detection": "You are a blockchain security expert specializing in real-time threat detection.",
        "simulation": "You are a blockchain security expert specializing in transaction simulation and vulnerability analysis.",
        "response": "You are a blockchain security expert specializing in defensive response and front-running attacks.",
        "general": "You are a blockchain security expert assisting with smart contract security analysis.",
    }

    base_prompt = base_prompts.get(task_type, base_prompts["general"])

    enhanced = context_injector.inject_into_prompt(base_prompt, task_description)

    return enhanced
