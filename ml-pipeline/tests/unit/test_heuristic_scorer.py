"""Tests for heuristic fallback scorer."""

import pytest
from ml_pipeline.models.heuristic_scorer import (
    clean_bytecode,
    count_external_calls,
    contains_uniswap_interface,
    contains_aave_interface,
    analyze_reentrancy_indicators,
    analyze_flash_loan_indicators,
    score_bytecode,
    HeuristicScore,
)


def test_clean_bytecode_removes_prefix():
    """Test that clean_bytecode removes 0x prefix."""
    assert clean_bytecode("0xabcdef") == "abcdef"
    assert clean_bytecode("ABCDEF") == "abcdef"


def test_clean_bytecode_handles_empty():
    """Test that clean_bytecode handles empty input."""
    assert clean_bytecode("") == ""
    assert clean_bytecode("0x") == ""


def test_count_external_calls_counts_call_opcodes():
    """Test that count_external_call counts CALL family opcodes."""
    # CALL = f1, CALLCODE = f2, DELEGATECALL = f4, STATICCALL = fa
    bytecode = "60a060f1f2f4fa55"
    assert count_external_calls(bytecode) == 4


def test_count_external_calls_zero_when_none():
    """Test that count_external_calls returns 0 when no CALL opcodes."""
    bytecode = "60a0605556"  # Only PUSH, SLOAD, SSTORE
    assert count_external_calls(bytecode) == 0


def test_contains_uniswap_interface_detects_selector():
    """Test Uniswap interface detection."""
    # swapExactETHForTokens selector
    bytecode = "7ff36a5e60a0"
    assert contains_uniswap_interface(bytecode) is True

    # No Uniswap selector
    bytecode = "60a06055"
    assert contains_uniswap_interface(bytecode) is False


def test_contains_aave_interface_detects_selector():
    """Test Aave interface detection."""
    # flashLoan selector
    bytecode = "602c797960a0"
    assert contains_aave_interface(bytecode) is True


def test_analyze_reentrancy_indicators_returns_score():
    """Test that reentrancy analysis returns valid score."""
    # Bytecode with multiple external calls
    bytecode = "f1f1f1f1f1f1f1f1f1f1f1"  # 11 CALL opcodes
    score = analyze_reentrancy_indicators(bytecode)

    assert 0.0 <= score <= 1.0
    assert score > 0  # Should detect some reentrancy indicators


def test_analyze_flash_loan_indicators_detects_uniswap():
    """Test that flash loan analysis detects Uniswap interface."""
    bytecode = "7ff36a5e60a0"  # swapExactETHForTokens
    score = analyze_flash_loan_indicators(bytecode)

    assert 0.0 <= score <= 1.0
    assert score > 0  # Should detect flash loan indicators


def test_score_bytecode_returns_heuristic_score():
    """Test that score_bytecode returns valid HeuristicScore."""
    # Bytecode with Uniswap selector
    bytecode = "0x7ff36a5e60a0"
    score = score_bytecode(bytecode)

    assert isinstance(score, HeuristicScore)
    assert 0.0 <= score.threat_score <= 1.0
    assert score.vuln_type in ["reentrancy", "flash_loan", "oracle_manipulation", "access_control", "other"]
    assert score.confidence in ["low", "medium", "high"]


def test_score_bytecode_handles_invalid_bytecode():
    """Test that score_bytecode handles invalid/short bytecode."""
    score = score_bytecode("ab")

    assert score.threat_score == 0.0
    assert score.vuln_type == "other"
    assert "invalid_bytecode" in score.patterns_found


def test_score_bytecode_detects_multiple_patterns():
    """Test that score_bytecode can detect multiple vulnerability patterns."""
    # Bytecode with both Uniswap and Aave selectors
    bytecode = "0x7ff36a5e602c797960a0"
    score = score_bytecode(bytecode)

    assert score.threat_score > 0
    assert len(score.patterns_found) > 0
