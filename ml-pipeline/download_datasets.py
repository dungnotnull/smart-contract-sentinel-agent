#!/usr/bin/env python3
"""
Download and prepare SmartBugs + DeFiHackLabs datasets.
Creates local dataset files for ML training.
"""

import logging
import json
from pathlib import Path
from typing import Dict, List

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# Known SmartBugs samples (simplified for demonstration)
SMARTBUGS_SAMPLES = {
    "reentrancy": [
        {
            "name": "Reentrancy Sample 1",
            "bytecode": "608060405236f1f1a9059cbb55f455f1f1a9059cbb55",
            "vuln_type": "reentrancy",
            "description": "Simple reentrancy pattern",
        },
        {
            "name": "Reentrancy Sample 2",
            "bytecode": "608060405236f1f1f1a9059cbb55f455f1a9059cbb55",
            "vuln_type": "reentrancy",
            "description": "Complex reentrancy pattern",
        },
    ],
    "flash_loan": [
        {
            "name": "Flash Loan Sample 1",
            "bytecode": "6080604052367ff36a538ed173602c7979a9059cbb",
            "vuln_type": "flash_loan",
            "description": "Uniswap flash loan pattern",
        },
    ],
    "oracle_manipulation": [
        {
            "name": "Oracle Manipulation Sample",
            "bytecode": "608060405236fa545570a08231a9059cbb",
            "vuln_type": "oracle_manipulation",
            "description": "Price oracle manipulation",
        },
    ],
    "access_control": [
        {
            "name": "Access Control Sample",
            "bytecode": "608060405236f4545547a9059cbb",
            "vuln_type": "access_control",
            "description": "Delegatecall access control",
        },
    ],
}

# DeFiHackLabs exploit patterns
DEFIHACKLABS_EXPLOITS = {
    "beanstalk": {
        "attack_type": "flash_loan",
        "bytecode": "608060405236ac9650d87ff36a538ed173602c7979",
        "loss_usd": 182000000,
        "description": "Beanstalk Farms $182M exploit",
    },
    "euler": {
        "attack_type": "reentrancy",
        "bytecode": "6080604052361241e8cd15e60196f1",
        "loss_usd": 197000000,
        "description": "Euler Finance $197M exploit",
    },
    "saddle": {
        "attack_type": "oracle_manipulation",
        "bytecode": "6080604052363850c7bd",
        "loss_usd": 5500000,
        "description": "Saddle Finance $5.5M exploit",
    },
}


def create_sample_datasets(output_dir: Path) -> None:
    """
    Create sample datasets for training and testing.

    Args:
        output_dir: Directory to save datasets
    """
    logger.info(f"Creating sample datasets in {output_dir}")

    # Create directories
    smartbugs_dir = output_dir / "smartbugs"
    defihacklabs_dir = output_dir / "defihacklabs"

    smartbugs_dir.mkdir(parents=True, exist_ok=True)
    defihacklabs_dir.mkdir(parents=True, exist_ok=True)

    # Create SmartBugs dataset
    smartbugs_data = []
    for vuln_type, samples in SMARTBUGS_SAMPLES.items():
        for sample in samples:
            smartbugs_data.append({
                "name": sample["name"],
                "bytecode": sample["bytecode"],
                "vuln_type": vuln_type,
                "description": sample["description"],
                "source": "smartbugs_sample",
            })

    # Generate additional synthetic samples
    from ml_pipeline.data.synthetic import generate_balanced_dataset
    synthetic_data = generate_balanced_dataset(samples_per_class=30)
    smartbugs_data.extend(synthetic_data)

    with open(smartbugs_dir / "smartbugs_dataset.json", 'w') as f:
        json.dump(smartbugs_data, f, indent=2)

    logger.info(f"Created SmartBugs dataset: {len(smartbugs_data)} samples")

    # Create DeFiHackLabs dataset
    defihacklabs_data = []
    for exploit_name, details in DEFIHACKLABS_EXPLOITS.items():
        defihacklabs_data.append({
            "name": exploit_name,
            "address": f"0x{exploit_name[:40]:040}",
            "attack_type": details["attack_type"],
            "bytecode": details["bytecode"],
            "loss_usd": details["loss_usd"],
            "description": details["description"],
            "source": "defihacklabs_sample",
        })

    with open(defihacklabs_dir / "defihacklabs_exploits.json", 'w') as f:
        json.dump(defihacklabs_data, f, indent=2)

    logger.info(f"Created DeFiHackLabs dataset: {len(defihacklabs_data)} exploits")

    logger.info("Sample datasets created successfully")


def create_model_card_template(save_dir: Path) -> None:
    """
    Create model card template for trained models.

    Args:
        save_dir: Directory to save model card
    """
    save_dir = save_dir / "gnn-vuln-classifier"
    save_dir.mkdir(parents=True, exist_ok=True)

    model_card = {
        "model_version": "1.0.0",
        "model_name": "SmartSentinel GNN Vulnerability Classifier",
        "architecture": "DA-GNN (Dual Attention Graph Neural Network)",
        "status": "not_trained",
        "trained_weights_path": None,
        "training_date": None,
        "hyperparameters": {
            "in_channels": 128,
            "hidden_dim": 128,
            "num_classes": 5,
            "num_layers": 2,
            "dropout": 0.5,
            "learning_rate": 0.001,
            "batch_size": 32,
            "epochs": 100,
        },
        "vulnerability_types": [
            "reentrancy",
            "flash_loan",
            "oracle_manipulation",
            "access_control",
            "other"
        ],
        "training_datasets": {
            "smartbugs": "SmartBugs Corpus (vulnerable contracts)",
            "defihacklabs": "DeFiHackLabs (real-world exploits)",
        },
        "performance_metrics": {
            "accuracy": None,
            "f1_score": None,
            "precision": None,
            "recall": None,
            "per_class_f1": None,
        },
        "notes": [
            "Model architecture implemented but not yet trained",
            "Inference server uses heuristic fallback mode",
            "Training requires SmartBugs + DeFiHackLabs datasets",
            "Target: F1 > 0.90 on held-out test set",
        ],
    }

    with open(save_dir / "model-card.json", 'w') as f:
        json.dump(model_card, f, indent=2)

    logger.info(f"Model card template created: {save_dir / 'model-card.json'}")


def main():
    """Download and prepare all datasets."""
    data_dir = Path("ml-pipeline/data")
    models_dir = Path("models")

    logger.info("=" * 60)
    logger.info("SmartSentinel Dataset Preparation")
    logger.info("=" * 60 + "\n")

    # Create sample datasets
    create_sample_datasets(data_dir)

    # Create model card template
    create_model_card_template(models_dir)

    logger.info("\n" + "=" * 60)
    logger.info("Dataset preparation complete!")
    logger.info("=" * 60)
    logger.info("\nNext steps:")
    logger.info("1. Run: python ml-pipeline/train.py")
    logger.info("2. Start server: python ml-pipeline/serve.py")
    logger.info("3. Test inference: curl -X POST http://localhost:8765/score ...")


if __name__ == "__main__":
    main()
