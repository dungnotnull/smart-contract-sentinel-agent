"""
Dataset loading utilities for SmartBugs and DeFiHackLabs.
"""

import json
import logging
from pathlib import Path
from typing import List, Dict

logger = logging.getLogger(__name__)


def load_smartbugs_dataset(data_dir: Path) -> List[Dict]:
    """
    Load SmartBugs dataset of labeled smart contracts.

    Returns:
        List of dicts with 'bytecode', 'label', 'vuln_type' keys
    """
    smartbugs_path = data_dir / "smartbugs"
    if not smartbugs_path.exists():
        logger.warning(f"SmartBugs dataset not found at {smartbugs_path}. Using synthetic data.")
        from ml_pipeline.data.synthetic import create_synthetic_training_data
        return create_synthetic_training_data(50)

    # Look for dataset files
    json_files = list(smartbugs_path.glob("*.json"))

    if not json_files:
        logger.warning(f"No JSON files found in {smartbugs_path}. Using synthetic data.")
        from ml_pipeline.data.synthetic import create_synthetic_training_data
        return create_synthetic_training_data(50)

    all_data = []

    for json_file in json_files:
        try:
            with open(json_file, 'r') as f:
                data = json.load(f)

            # Handle different SmartBugs formats
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        bytecode = item.get("bytecode", "")
                        vuln_type = item.get("vuln_type", item.get("label", "other"))

                        if bytecode and len(bytecode) > 10:
                            all_data.append({
                                "bytecode": bytecode,
                                "vuln_type": vuln_type,
                                "source": "smartbugs",
                                "file": str(json_file),
                            })
            elif isinstance(data, dict):
                bytecode = data.get("bytecode", "")
                vuln_type = data.get("vuln_type", data.get("label", "other"))

                if bytecode and len(bytecode) > 10:
                    all_data.append({
                        "bytecode": bytecode,
                        "vuln_type": vuln_type,
                        "source": "smartbugs",
                        "file": str(json_file),
                    })

        except Exception as e:
            logger.warning(f"Failed to load {json_file}: {e}")

    logger.info(f"Loaded {len(all_data)} SmartBugs samples from {len(json_files)} files")

    if len(all_data) == 0:
        logger.warning("No valid SmartBugs data loaded, using synthetic data")
        from ml_pipeline.data.synthetic import create_synthetic_training_data
        return create_synthetic_training_data(50)

    return all_data


def load_defihacklabs_exploits(data_dir: Path) -> List[Dict]:
    """
    Load DeFiHackLabs labeled exploit contracts.

    Returns:
        List of dicts with 'bytecode', 'address', 'attack_type', 'loss_usd' keys
    """
    defihacklabs_path = data_dir / "defihacklabs"
    if not defihacklabs_path.exists():
        logger.warning(f"DeFiHackLabs dataset not found at {defihacklabs_path}. Using synthetic data.")
        from ml_pipeline.data.synthetic import create_synthetic_training_data
        return create_synthetic_training_data(30)

    # Look for exploit files
    json_files = list(defihacklabs_path.glob("*.json"))

    if not json_files:
        logger.warning(f"No JSON files found in {defihacklabs_path}. Using synthetic data.")
        from ml_pipeline.data.synthetic import create_synthetic_training_data
        return create_synthetic_training_data(30)

    all_data = []

    for json_file in json_files:
        try:
            with open(json_file, 'r') as f:
                data = json.load(f)

            # Handle different DeFiHackLabs formats
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        bytecode = item.get("bytecode", item.get("runtime_bytecode", ""))
                        attack_type = item.get("attack_type", item.get("vulnerability", "other"))
                        address = item.get("address", "")
                        loss_usd = item.get("loss_usd", 0)

                        if bytecode and len(bytecode) > 10:
                            all_data.append({
                                "bytecode": bytecode,
                                "attack_type": attack_type,
                                "address": address,
                                "loss_usd": loss_usd,
                                "source": "defihacklabs",
                                "file": str(json_file),
                            })
            elif isinstance(data, dict):
                bytecode = data.get("bytecode", data.get("runtime_bytecode", ""))
                attack_type = data.get("attack_type", data.get("vulnerability", "other"))
                address = data.get("address", "")
                loss_usd = data.get("loss_usd", 0)

                if bytecode and len(bytecode) > 10:
                    all_data.append({
                        "bytecode": bytecode,
                        "attack_type": attack_type,
                        "address": address,
                        "loss_usd": loss_usd,
                        "source": "defihacklabs",
                        "file": str(json_file),
                    })

        except Exception as e:
            logger.warning(f"Failed to load {json_file}: {e}")

    logger.info(f"Loaded {len(all_data)} DeFiHackLabs samples from {len(json_files)} files")

    if len(all_data) == 0:
        logger.warning("No valid DeFiHackLabs data loaded, using synthetic data")
        from ml_pipeline.data.synthetic import create_synthetic_training_data
        return create_synthetic_training_data(30)

    return all_data


def create_train_val_test_split(
    data: List[Dict],
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
    test_ratio: float = 0.1,
    seed: int = 42,
) -> tuple[List[Dict], List[Dict], List[Dict]]:
    """Split dataset into train/val/test sets."""
    import random
    rng = random.Random(seed)
    shuffled = data[:]
    rng.shuffle(shuffled)

    n = len(shuffled)
    train_end = int(n * train_ratio)
    val_end = train_end + int(n * val_ratio)

    return shuffled[:train_end], shuffled[train_end:val_end], shuffled[val_end:]


def download_sample_datasets(data_dir: Path) -> None:
    """
    Download sample datasets for testing and development.

    Args:
        data_dir: Directory to save datasets
    """
    logger.info(f"Creating sample datasets in {data_dir}")

    # Create directories
    smartbugs_dir = data_dir / "smartbugs"
    defihacklabs_dir = data_dir / "defihacklabs"

    smartbugs_dir.mkdir(parents=True, exist_ok=True)
    defihacklabs_dir.mkdir(parents=True, exist_ok=True)

    # Create synthetic sample data
    from ml_pipeline.data.synthetic import generate_balanced_dataset

    # SmartBugs samples
    smartbugs_samples = generate_balanced_dataset(samples_per_class=20)
    with open(smartbugs_dir / "smartbugs_sample.json", 'w') as f:
        json.dump(smartbugs_samples, f, indent=2)

    logger.info(f"Created {len(smartbugs_samples)} SmartBugs samples")

    # DeFiHackLabs samples
    defihacklabs_samples = generate_balanced_dataset(samples_per_class=10)
    with open(defihacklabs_dir / "defihacklabs_sample.json", 'w') as f:
        json.dump(defihacklabs_samples, f, indent=2)

    logger.info(f"Created {len(defihacklabs_samples)} DeFiHackLabs samples")

    logger.info("Sample datasets created successfully")