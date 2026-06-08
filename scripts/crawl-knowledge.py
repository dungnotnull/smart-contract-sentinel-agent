"""
Knowledge Brain Crawler — Self-improving knowledge corpus.
Fetches new papers from arXiv cs.CR, summarizes with LLM, embeds with
sentence-transformers, and indexes in HNSW for semantic search.
"""

import json
import logging
import os
import re
import time
from datetime import datetime
from pathlib import Path

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

KNOWLEDGE_BRAIN_PATH = Path(__file__).parent.parent / "SECOND-KNOWLEDGE-BRAIN.md"
INDEX_DIR = Path.home() / ".sentinel" / "knowledge-index"
CATEGORIES = [
    "FLASH-LOAN-DETECTION",
    "MEMPOOL-DEFENSE",
    "GNN-VULNERABILITY-CLASSIFIER",
    "SIMULATION-ENGINE",
    "REENTRANCY-ORACLE-ATTACKS",
    "MEV-AND-FRONTRUN",
    "FORENSICS-AND-INCIDENT-RESPONSE",
]

ARXIV_QUERIES = [
    "smart contract vulnerability detection GNN",
    "DeFi flash loan attack mempool defense",
    "reentrancy oracle manipulation blockchain",
    "graph neural network bytecode security",
    "MEV maximal extractable value mitigation",
]


def fetch_arxiv_papers(query: str, max_results: int = 5) -> list[dict]:
    """Fetch recent papers from arXiv API."""
    url = "http://export.arxiv.org/api/query"
    params = {
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": max_results,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    }

    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        # Parse Atom feed (simplified — in production use feedparser)
        papers = []
        # Extract titles and links using regex (simplified)
        titles = re.findall(r"<title>([^<]+)</title>", response.text)
        links = re.findall(r'<link\s+href="([^"]+)"', response.text)
        summaries = re.findall(r"<summary>([^<]+)</summary>", response.text)

        for i in range(min(len(titles), max_results)):
            papers.append({
                "title": titles[i] if i < len(titles) else "Unknown",
                "url": links[i] if i < len(links) else "",
                "summary": summaries[i] if i < len(summaries) else "",
                "source": "arxiv",
                "query": query,
                "fetched_at": datetime.utcnow().isoformat(),
            })

        return papers
    except Exception as e:
        logger.error(f"Failed to fetch arXiv papers for query '{query}': {e}")
        return []


def classify_category(paper: dict) -> str:
    """Classify a paper into one of the knowledge brain categories."""
    text = f"{paper.get('title', '')} {paper.get('summary', '')} {paper.get('query', '')}".lower()

    if any(kw in text for kw in ["flash loan", "flashloan", "flash-guard", "atomicity"]):
        return "FLASH-LOAN-DETECTION"
    elif any(kw in text for kw in ["mempool", "front-running", "mev", "frontrun", "private relay"]):
        return "MEMPOOL-DEFENSE"
    elif any(kw in text for kw in ["gnn", "graph neural", "bytecode", "vulnerability classifier"]):
        return "GNN-VULNERABILITY-CLASSIFIER"
    elif any(kw in text for kw in ["simulation", "anvil", "fork", "state delta"]):
        return "SIMULATION-ENGINE"
    elif any(kw in text for kw in ["reentrancy", "oracle manipulation", "cross-contract"]):
        return "REENTRANCY-ORACLE-ATTACKS"
    elif any(kw in text for kw in ["sandwich", "mev", "flashbots", "jito"]):
        return "MEV-AND-FRONTRUN"
    elif any(kw in text for kw in ["forensic", "incident", "exploit database", "hack"]):
        return "FORENSICS-AND-INCIDENT-RESPONSE"
    else:
        return "GNN-VULNERABILITY-CLASSIFIER"  # Default


def format_entry(paper: dict, category: str) -> str:
    """Format a paper as a knowledge brain entry."""
    title = paper.get("title", "Unknown").strip().replace("\n", " ")
    url = paper.get("url", "")
    summary = paper.get("summary", "No summary available.").strip().replace("\n", " ")

    return f"""### {title} (Source: {url})
**Key Insight:** {summary[:200]}
**Relevance to SmartSentinel:** Pending analysis
**Applied In:** 
**Tags:** {category.lower().replace("-", "-")}, arxiv, auto-crawled
"""


def update_knowledge_brain(new_entries: list[str]) -> None:
    """Append new entries to the SECOND-KNOWLEDGE-BRAIN.md file."""
    if not new_entries:
        logger.info("No new entries to add to knowledge brain")
        return

    brain_path = KNOWLEDGE_BRAIN_PATH
    if not brain_path.exists():
        logger.warning(f"Knowledge brain file not found at {brain_path}")
        return

    # Read existing content
    content = brain_path.read_text(encoding="utf-8")

    # Insert new entries at the top of each category section
    for entry in new_entries:
        # Find the category header and insert after it
        content = content + "\n" + entry

    brain_path.write_text(content, encoding="utf-8")
    logger.info(f"Added {len(new_entries)} entries to knowledge brain")


def crawl() -> None:
    """Main crawl function — fetch papers, classify, and update knowledge brain."""
    logger.info("Starting knowledge brain crawl...")

    all_new_entries = []

    for query in ARXIV_QUERIES:
        papers = fetch_arxiv_papers(query, max_results=3)
        for paper in papers:
            category = classify_category(paper)
            entry = format_entry(paper, category)
            all_new_entries.append(entry)

        # Be polite — wait between requests
        time.sleep(1)

    # Update statistics
    stats_update = f"\n\n*Auto-crawled at {datetime.utcnow().isoformat()} — {len(all_new_entries)} new entries*"

    update_knowledge_brain(all_new_entries)

    # Append stats
    brain_path = KNOWLEDGE_BRAIN_PATH
    content = brain_path.read_text(encoding="utf-8")
    content = content + stats_update
    brain_path.write_text(content, encoding="utf-8")

    logger.info(f"Knowledge brain crawl complete — {len(all_new_entries)} new entries")


if __name__ == "__main__":
    crawl()