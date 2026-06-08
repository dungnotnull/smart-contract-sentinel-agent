"""
Dataset loading utilities for SmartBugs and DeFiHackLabs.
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def load_smartbugs_dataset(data_dir: Path) -> list[dict]:
    """
    Load SmartBugs dataset of labeled smart contracts.

    Returns:
        List of dicts with 'bytecode', 'label', 'vuln_type' keys
    """
    smartbugs_path = data_dir / "smartbugs"
    if not smartbugs_path.exists():
        logger.warning(f"SmartBugs dataset not found at {smartbugs_path}. Run data download first.")
        return []

    # TODO: Implement SmartBugs dataset loading
    logger.info("SmartBugs dataset loading not yet implemented")
    return []


def load_defihacklabs_exploits(data_dir: Path) -> list[dict]:
    """
    Load DeFiHackLabs labeled exploit contracts.

    Returns:
        List of dicts with 'bytecode', 'address', 'attack_type', 'loss_usd' keys
    """
    defihacklabs_path = data_dir / "defihacklabs"
    if not defihacklabs_path.exists():
        logger.warning(f"DeFiHackLabs dataset not found at {defihacklabs_path}. Run data download first.")
        return []

    # TODO: Implement DeFiHackLabs dataset loading
    logger.info("DeFiHackLabs dataset loading not yet implemented")
    return []


def create_train_val_test_split(
    data: list[dict],
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
    test_ratio: float = 0.1,
    seed: int = 42,
) -> tuple[list[dict], list[dict], list[dict]]:
    """Split dataset into train/val/test sets."""
    import random
    rng = random.Random(seed)
    shuffled = data[:]
    rng.shuffle(shuffled)

    n = len(shuffled)
    train_end = int(n * train_ratio)
    val_end = train_end + int(n * val_ratio)

    return shuffled[:train_end], shuffled[train_end:val_end], shuffled[val_end:]