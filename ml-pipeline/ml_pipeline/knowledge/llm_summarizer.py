"""
LLM Summarizer — Summarize academic papers for knowledge brain.
Uses DeepSeek Lite or OpenAI API for cost-effective summarization.

Extracts:
- Key insight (main contribution)
- Applied module (which SmartSentinel component this relates to)
- Tags (categories for indexing)
"""

import logging
import os
from dataclasses import dataclass
from typing import Optional
import requests

logger = logging.getLogger(__name__)


@dataclass
class PaperSummary:
    """Structured paper summary."""
    title: str
    authors: str
    year: int
    key_insight: str
    applied_module: str
    tags: list[str]
    relevance_score: float  # 0.0 to 1.0


class LLMSummarizer:
    """Summarize academic papers using LLM API."""

    def __init__(self, api_key: Optional[str] = None, model: str = "deepseek-chat"):
        self.api_key = api_key or os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.api_base = self._get_api_base(model)

        if not self.api_key:
            logger.warning("No API key found - summarizer will return placeholders")

    def _get_api_base(self, model: str) -> str:
        """Get API base URL for model."""
        if "deepseek" in model.lower():
            return "https://api.deepseek.com/v1"
        elif "openai" in model.lower():
            return "https://api.openai.com/v1"
        else:
            return "https://api.openai.com/v1"  # Default

    def summarize_paper(self, paper: dict) -> PaperSummary:
        """Summarize a paper using LLM."""
        if not self.api_key:
            return self._placeholder_summary(paper)

        try:
            prompt = self._build_summary_prompt(paper)
            response = self._call_llm(prompt)
            return self._parse_summary_response(response, paper)
        except Exception as e:
            logger.error(f"LLM summarization failed: {e}")
            return self._placeholder_summary(paper)

    def _build_summary_prompt(self, paper: dict) -> str:
        """Build summarization prompt."""
        title = paper.get("title", "")
        abstract = paper.get("abstract", "")
        authors = paper.get("authors", [])
        year = paper.get("year", 2024)

        prompt = f"""Analyze this academic paper and provide a concise summary:

Title: {title}
Authors: {', '.join(authors)}
Year: {year}
Abstract: {abstract}

Provide your response in this exact format:

KEY_INSIGHT: [One sentence describing the main contribution]

APPLIED_MODULE: [Which component of a blockchain security system this applies to: mempool-monitoring, simulation, ml-classifier, alerting, response]

TAGS: [3-5 comma-separated tags like: reentrancy, flash-loans, gnns, mempool]

RELEVANCE_SCORE: [0.0 to 1.0 score for relevance to DeFi security monitoring]

Keep each section on one line. Be concise."""

        return prompt

    def _call_llm(self, prompt: str) -> str:
        """Call LLM API."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        data = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are an expert at analyzing blockchain security research papers."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 500,
        }

        response = requests.post(
            f"{self.api_base}/chat/completions",
            headers=headers,
            json=data,
            timeout=60,
        )
        response.raise_for_status()

        result = response.json()
        return result["choices"][0]["message"]["content"]

    def _parse_summary_response(self, response: str, paper: dict) -> PaperSummary:
        """Parse LLM response into structured summary."""
        lines = response.strip().split("\n")

        key_insight = ""
        applied_module = ""
        tags = []
        relevance_score = 0.5

        for line in lines:
            if line.startswith("KEY_INSIGHT:"):
                key_insight = line.split(":", 1)[1].strip()
            elif line.startswith("APPLIED_MODULE:"):
                applied_module = line.split(":", 1)[1].strip()
            elif line.startswith("TAGS:"):
                tags_str = line.split(":", 1)[1].strip()
                tags = [tag.strip().lower() for tag in tags_str.split(",")]
            elif line.startswith("RELEVANCE_SCORE:"):
                score_str = line.split(":", 1)[1].strip()
                try:
                    relevance_score = float(score_str)
                except ValueError:
                    relevance_score = 0.5

        return PaperSummary(
            title=paper.get("title", ""),
            authors=", ".join(paper.get("authors", [])),
            year=paper.get("year", 2024),
            key_insight=key_insight,
            applied_module=applied_module or "general",
            tags=tags or ["research"],
            relevance_score=relevance_score,
        )

    def _placeholder_summary(self, paper: dict) -> PaperSummary:
        """Generate placeholder summary when API unavailable."""
        return PaperSummary(
            title=paper.get("title", ""),
            authors=", ".join(paper.get("authors", [])),
            year=paper.get("year", 2024),
            key_insight=paper.get("abstract", "")[:200] + "...",
            applied_module="general",
            tags=["auto-crawled"],
            relevance_score=0.3,
        )
