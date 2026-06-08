"""
Synthetic data generation for training pipeline testing.
Creates realistic bytecode samples with vulnerability labels.
"""

import random
from typing import List, Dict


# Vulnerability patterns (simplified bytecode representations)
VULN_PATTERNS = {
    "reentrancy": [
        "f1",  # CALL
        "55",  # SSTORE
        "a9059cbb",  # transfer
    ],
    "flash_loan": [
        "7ff36a5",  # swapExactETHForTokens
        "38ed173",  # swapExactTokensForETH
        "a18bd3bf",  # borrow
    ],
    "oracle_manipulation": [
        "fa",  # STATICCALL
        "54",  # SLOAD
        "55",  # SSTORE
    ],
    "access_control": [
        "f4",  # DELEGATECALL
        "47",  # calldatasize
        "ff",  # SELFDESTRUCT
    ],
    "other": [
        "60",  # PUSH1
        "50",  # POP
        "56",  # JUMP
    ]
}


def generate_synthetic_bytecode(vuln_type: str) -> str:
    """
    Generate synthetic bytecode for a given vulnerability type.

    Args:
        vuln_type: Type of vulnerability to generate

    Returns:
        Hex string representing bytecode
    """
    patterns = VULN_PATTERNS.get(vuln_type, VULN_PATTERNS["other"])

    # Generate random bytecode with vulnerability patterns
    bytecode_parts = []

    # Add vulnerability patterns
    for pattern in patterns:
        bytecode_parts.append(pattern)

    # Add random filler opcodes
    filler_opcodes = ["60", "61", "50", "51", "52", "56", "57", "5b", "5c", "5f"]
    for _ in range(20):
        bytecode_parts.append(random.choice(filler_opcodes))

    # Add more vulnerability patterns
    for pattern in patterns:
        bytecode_parts.append(pattern)

    # Shuffle and join
    random.shuffle(bytecode_parts)
    return "".join(bytecode_parts)


def create_synthetic_training_data(num_samples: int = 100) -> List[Dict]:
    """
    Create synthetic training data for pipeline testing.

    Args:
        num_samples: Number of samples to generate

    Returns:
        List of dicts with 'bytecode' and 'vuln_type' keys
    """
    vuln_types = list(VULN_PATTERNS.keys())

    data = []
    for _ in range(num_samples):
        vuln_type = random.choice(vuln_types)
        bytecode = generate_synthetic_bytecode(vuln_type)

        data.append({
            "bytecode": bytecode,
            "vuln_type": vuln_type,
            "source": "synthetic",
        })

    return data


def create_synthetic_bytecode_with_context(vuln_type: str) -> str:
    """
    Generate more realistic synthetic bytecode with context.

    Args:
        vuln_type: Type of vulnerability

    Returns:
        Realistic bytecode string
    """
    # Common contract bytecode prefixes (creation code, etc.)
    prefix = "608060405236"

    # Vulnerability-specific patterns
    if vuln_type == "reentrancy":
        # Reentrancy pattern: CALL -> state change -> CALL
        core = "f1" + "55" + "a9059cbb" + "f1" + "55"
    elif vuln_type == "flash_loan":
        # Flash loan pattern: DEX calls + large transfers
        core = "7ff36a5" + "38ed173" + "602c7979" + "a9059cbb"
    elif vuln_type == "oracle_manipulation":
        # Oracle manipulation: external call -> state manipulation
        core = "fa" + "54" + "55" + "a9059cbb"
    elif vuln_type == "access_control":
        # Access control: delegatecall to user storage
        core = "f4" + "54" + "55" + "47"
    else:
        # Other: random operations
        core = "60" + "50" + "56" + "57"

    # Suffix (deployment code)
    suffix = "6120" + "33" + "61" + "52" + "60" + "f3"

    return prefix + core + suffix


def generate_balanced_dataset(samples_per_class: int = 50) -> List[Dict]:
    """
    Generate balanced synthetic dataset with equal samples per class.

    Args:
        samples_per_class: Number of samples per vulnerability type

    Returns:
        Balanced dataset
    """
    vuln_types = list(VULN_PATTERNS.keys())
    data = []

    for vuln_type in vuln_types:
        for _ in range(samples_per_class):
            bytecode = create_synthetic_bytecode_with_context(vuln_type)

            data.append({
                "bytecode": bytecode,
                "vuln_type": vuln_type,
                "source": "synthetic_balanced",
            })

    return data
