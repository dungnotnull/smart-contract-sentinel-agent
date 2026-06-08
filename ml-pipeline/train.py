"""
GNN Vulnerability Classifier — Training entrypoint.
Trains on SmartBugs + DeFiHackLabs datasets.
"""

import argparse
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def train(
    data_dir: Path = Path("ml-pipeline/data"),
    epochs: int = 100,
    batch_size: int = 32,
    learning_rate: float = 0.001,
    hidden_dim: int = 128,
    save_dir: Path = Path("models/gnn-vuln-classifier"),
):
    """
    Train the GNN vulnerability classifier.

    Args:
        data_dir: Directory containing training datasets
        epochs: Number of training epochs
        batch_size: Training batch size
        learning_rate: Learning rate
        hidden_dim: Hidden dimension size
        save_dir: Directory to save model weights
    """
    logger.info("Starting GNN training...")
    logger.info(f"Data dir: {data_dir}")
    logger.info(f"Epochs: {epochs}, Batch size: {batch_size}, LR: {learning_rate}")
    logger.info(f"Hidden dim: {hidden_dim}")

    # TODO: Implement full training pipeline
    # 1. Load SmartBugs dataset
    # 2. Load DeFiHackLabs exploit contracts
    # 3. Extract features (bytecode -> CFG + opcode)
    # 4. Build PyG Data objects
    # 5. Train DA-GNN model
    # 6. Evaluate on held-out test set
    # 7. Save model weights + model-card.json

    logger.warning("Training pipeline not yet implemented — placeholder only")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train GNN vulnerability classifier")
    parser.add_argument("--data-dir", type=Path, default=Path("ml-pipeline/data"))
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=0.001)
    parser.add_argument("--hidden-dim", type=int, default=128)
    args = parser.parse_args()

    train(
        data_dir=args.data_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        hidden_dim=args.hidden_dim,
    )