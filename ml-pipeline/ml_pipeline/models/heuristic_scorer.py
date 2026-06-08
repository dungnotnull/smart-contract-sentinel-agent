"""
Heuristic fallback scorer for bytecode vulnerability analysis.
Used when trained GNN model is not available.
Analyzes bytecode patterns for known vulnerability signatures.
"""

import logging
import re
from typing import Literal

logger = logging.getLogger(__name__)

VulnType = Literal["reentrancy", "flash_loan", "oracle_manipulation", "access_control", "other"]

# Known vulnerability patterns in bytecode
# Format: (pattern_description, score_weight, vuln_type)

REENTRANCY_PATTERNS = [
    # CALL after external call (potential reentrancy)
    (r"(?:6[45def]23[0-9a-f]{6})", 0.15, "reentrancy"),  # CALL/CALLCODE/DELEGATECALL opcodes
]

FLASH_LOAN_PATTERNS = [
    # Known DEX interface selectors (first 4 bytes of calldata)
    (r"7ff36a5[0-9a-f]{2}", 0.12, "flash_loan"),  # swapExactETHForTokens
    (r"38ed1739[0-9a-f]{2}", 0.12, "flash_loan"),  # swapExactTokensForETH
    (r"8803dbee[0-9a-f]{2}", 0.12, "flash_loan"),  # swapTokensForExactTokens
    (r"a18bd3bf[0-9a-f]{2}", 0.12, "flash_loan"),  # borrow (Aave)
    (r"602c7979[0-9a-f]{2}", 0.12, "flash_loan"),  # flashLoan (Balancer)
]

ORACLE_MANIPULATION_PATTERNS = [
    # Large state changes after external calls
    (r"(?:5[456]23[0-9a-f]{6})(?:55|54)[0-9a-f]{4}(?:5[45]23[0-9a-f]{6})", 0.2, "oracle_manipulation"),
]

ACCESS_CONTROL_PATTERNS = [
    # delegatecall to user-controlled storage
    (r"(?:5f345[0-9a-f]{4})(?:5[45]23[0-9a-f]{6})", 0.18, "access_control"),
]


class HeuristicScore:
    """Result of heuristic bytecode analysis."""
    def __init__(
        self,
        threat_score: float,
        vuln_type: VulnType,
        confidence: str,
        patterns_found: list[str],
    ):
        self.threat_score = threat_score
        self.vuln_type = vuln_type
        self.confidence = confidence  # "low", "medium", "high"
        self.patterns_found = patterns_found


def clean_bytecode(bytecode: str) -> str:
    """
    Clean bytecode string for analysis.
    Removes 0x prefix and converts to lowercase.
    """
    if bytecode.startswith("0x"):
        bytecode = bytecode[2:]
    return bytecode.lower()


def count_external_calls(bytecode: str) -> int:
    """Count CALL family opcodes in bytecode."""
    clean = clean_bytecode(bytecode)

    # Opcodes for CALL family
    # CALL = f1, CALLCODE = f2, DELEGATECALL = f4, STATICCALL = fa
    call_opcodes = ["f1", "f2", "f4", "fa"]

    count = 0
    for opcode in call_opcodes:
        count += clean.count(opcode)

    return count


def count_low_level_calls(bytecode: str) -> int:
    """Count low-level call opcodes (CALL, DELEGATECALL)."""
    clean = clean_bytecode(bytecode)

    # CALL = f1, DELEGATECALL = f4
    return clean.count("f1") + clean.count("f4")


def contains_uniswap_interface(bytecode: str) -> bool:
    """Check if bytecode contains Uniswap V2/V3 interface selectors."""
    clean = clean_bytecode(bytecode)

    # Common Uniswap selectors (first 4 bytes of function call)
    uniswap_selectors = [
        "7ff36a5e",  # swapExactETHForTokens
        "38ed1739",  # swapExactTokensForETH
        "8803dbee",  # swapTokensForExactTokens
        "a18bd3bf",  # swapETHForExactTokens
        "fb3bdb41",  # swapExactTokensForTokensSupportingFeeOnTransferTokens
        "5c11d795",  # swapTokensForExactTokens
    ]

    return any(selector in clean for selector in uniswap_selectors)


def contains_aave_interface(bytecode: str) -> bool:
    """Check if bytecode contains Aave lending pool interface."""
    clean = clean_bytecode(bytecode)

    aave_selectors = [
        "a18bd3bf",  # borrow
        "602c7979",  # flashLoan
        "44ea7e38",  # deposit
        "536d1bae",  # withdraw
    ]

    return any(selector in clean for selector in aave_selectors)


def contains_balancer_interface(bytecode: str) -> bool:
    """Check if bytecode contains Balancer vault interface."""
    clean = clean_bytecode(bytecode)

    balancer_selectors = [
        "602c7979",  # flashLoan
        "3b4da71f",  # swap
        "52bbbe9e",  # joinPool
    ]

    return any(selector in clean for selector in balancer_selectors)


def has_delegatecall_to_user_storage(bytecode: str) -> bool:
    """
    Check for DELEGATECALL pattern to user-controlled storage.
    This is a common access control vulnerability pattern.
    """
    clean = clean_bytecode(bytecode)

    # Look for DELEGATECALL (f4) followed by SLOAD (54) or storage operations
    # This is a simplified check - real analysis would need CFG
    return "f4" in clean and ("54" in clean or "55" in clean)


def analyze_reentrancy_indicators(bytecode: str) -> float:
    """
    Analyze bytecode for reentrancy vulnerability indicators.
    Returns score contribution 0.0 to 1.0.
    """
    clean = clean_bytecode(bytecode)

    score = 0.0

    # High number of external calls
    external_calls = count_external_calls(bytecode)
    if external_calls > 10:
        score += 0.15

    # Low-level calls (CALL, DELEGATECALL)
    low_level_calls = count_low_level_calls(bytecode)
    if low_level_calls > 5:
        score += 0.12

    # Pattern: state change after external call (simplified)
    # Look for CALL followed by SSTORE
    if "f1" in clean and "55" in clean:
        score += 0.10

    # Pattern: multiple transfers in one function
    transfer_pattern = clean.count("a9059cbb")  # transfer(address,uint256)
    if transfer_pattern > 2:
        score += 0.08

    return min(score, 1.0)


def analyze_flash_loan_indicators(bytecode: str) -> float:
    """
    Analyze bytecode for flash loan exploit indicators.
    Returns score contribution 0.0 to 1.0.
    """
    clean = clean_bytecode(bytecode)

    score = 0.0

    # Contains DEX interfaces
    if contains_uniswap_interface(bytecode):
        score += 0.15

    if contains_aave_interface(bytecode):
        score += 0.18

    if contains_balancer_interface(bytecode):
        score += 0.15

    # Multiple swap operations
    swap_count = sum([
        clean.count("7ff36a5"),
        clean.count("38ed173"),
        clean.count("8803dbe"),
        clean.count("a18bd3b"),
    ])
    if swap_count > 3:
        score += 0.12

    # Large balance operations
    if clean.count("70a08231") > 1:  # balanceOf(address)
        score += 0.10

    return min(score, 1.0)


def analyze_oracle_manipulation_indicators(bytecode: str) -> float:
    """
    Analyze bytecode for oracle manipulation indicators.
    Returns score contribution 0.0 to 1.0.
    """
    clean = clean_bytecode(bytecode)

    score = 0.0

    # External calls to price oracles (simplified check)
    # Look for staticcall (fa) patterns
    if "fa" in clean:
        score += 0.10

    # State manipulation after external calls
    # Look for STATICCALL followed by SSTORE
    if "fa" in clean and "55" in clean:
        score += 0.15

    # Multiple balance checks (potential price dependency)
    balance_checks = clean.count("70a08231")  # balanceOf
    if balance_checks > 4:
        score += 0.12

    # Token operations
    if clean.count("a9059cbb") > 0:  # transfer
        score += 0.08

    return min(score, 1.0)


def analyze_access_control_indicators(bytecode: str) -> float:
    """
    Analyze bytecode for access control vulnerability indicators.
    Returns score contribution 0.0 to 1.0.
    """
    clean = clean_bytecode(bytecode)

    score = 0.0

    # Delegatecall to user-controlled storage
    if has_delegatecall_to_user_storage(bytecode):
        score += 0.25

    # Pattern: tx.origin usage (simplified)
    # This would need more sophisticated analysis in production
    if clean.count("47") > 0:  # calldatasize
        score += 0.05

    # Selfdestruct patterns
    if clean.count("ff") > 0:  # SELFDESTRUCT
        score += 0.15

    # OnlyOwner bypass patterns (delegatecall to user address)
    if clean.count("f4") > 2:  # DELEGATECALL
        score += 0.10

    return min(score, 1.0)


def score_bytecode(bytecode: str) -> HeuristicScore:
    """
    Analyze bytecode for vulnerability threat using heuristics.

    Args:
        bytecode: Hex string of contract bytecode

    Returns:
        HeuristicScore with threat score, vulnerability type, and confidence
    """
    clean = clean_bytecode(bytecode)

    if len(clean) < 10:
        # Invalid bytecode
        return HeuristicScore(
            threat_score=0.0,
            vuln_type="other",
            confidence="low",
            patterns_found=["invalid_bytecode"],
        )

    # Analyze each vulnerability type
    reentrancy_score = analyze_reentrancy_indicators(bytecode)
    flash_loan_score = analyze_flash_loan_indicators(bytecode)
    oracle_score = analyze_oracle_manipulation_indicators(bytecode)
    access_control_score = analyze_access_control_indicators(bytecode)

    # Find highest scoring vulnerability type
    scores = {
        "reentrancy": reentrancy_score,
        "flash_loan": flash_loan_score,
        "oracle_manipulation": oracle_score,
        "access_control": access_control_score,
    }

    max_score = max(scores.values())
    max_vuln = max(scores, key=scores.get)

    # Determine confidence based on score magnitude
    if max_score >= 0.5:
        confidence = "high"
    elif max_score >= 0.3:
        confidence = "medium"
    else:
        confidence = "low"

    # Collect patterns found for debugging
    patterns_found = []
    for vuln, score in scores.items():
        if score > 0:
            patterns_found.append(f"{vuln}:{score:.2f}")

    logger.debug(
        f"Heuristic analysis: {max_vuln}={max_score:.2f}, patterns={patterns_found}"
    )

    return HeuristicScore(
        threat_score=min(max_score, 1.0),
        vuln_type=max_vuln if max_score > 0 else "other",
        confidence=confidence,
        patterns_found=patterns_found,
    )
