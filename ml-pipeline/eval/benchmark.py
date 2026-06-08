"""
Benchmark evaluation for GNN vulnerability classifier.
Evaluates on SmartBugs benchmark + custom test set.
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def benchmark(model_path: Path, test_data_dir: Path | None = None) -> dict:
    """
    Evaluate GNN classifier on benchmark datasets.

    Args:
        model_path: Path to trained model weights
        test_data_dir: Path to test dataset (default: SmartBugs test split)

    Returns:
        Dict with accuracy, F1, precision, recall metrics
    """
    logger.info(f"Benchmarking model at {model_path}")
    logger.warning("Benchmark not yet implemented — placeholder only")

    return {
        "accuracy": 0.0,
        "f1": 0.0,
        "precision": 0.0,
        "recall": 0.0,
        "status": "not_implemented",
    }


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Benchmark GNN classifier")
    parser.add_argument("--model-path", type=Path, default=Path("models/gnn-vuln-classifier"))
    parser.add_argument("--test-data-dir", type=Path, default=None)
    args = parser.parse_args()
    benchmark(args.model_path, args.test_data_dir)