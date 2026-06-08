"""Test feature extractor module."""
import pytest
from ml_pipeline.models.feature_extractor import (
    extract_features,
    build_cfg,
    _basic_disassemble,
)


class TestBasicDisassembler:
    """Test the fallback disassembler."""

    def test_empty_bytecode(self):
        result = _basic_disassemble("")
        assert result == []

    def test_single_push1(self):
        # PUSH1 0x42 = 0x60 0x42
        result = _basic_disassemble("6042")
        assert len(result) == 1
        assert result[0]["offset"] == 0

    def test_stop_opcode(self):
        # STOP = 0x00
        result = _basic_disassemble("00")
        assert len(result) == 1


class TestBuildCFG:
    """Test Control Flow Graph construction."""

    def test_empty_opcodes(self):
        cfg = build_cfg([])
        assert len(cfg.blocks) == 0
        assert len(cfg.edges) == 0

    def test_sequential_blocks(self):
        opcodes = [
            {"offset": 0, "opcode": "PUSH1", "operand": 1},
            {"offset": 2, "opcode": "PUSH1", "operand": 2},
            {"offset": 4, "opcode": "STOP", "operand": None},
        ]
        cfg = build_cfg(opcodes)
        assert len(cfg.blocks) >= 1


class TestExtractFeatures:
    """Test full feature extraction pipeline."""

    def test_empty_bytecode(self):
        result = extract_features("0x")
        assert result["raw_opcode_count"] == 0
        assert result["num_blocks"] == 0

    def test_with_prefix(self):
        result = extract_features("0x6042")
        assert "opcode_seq" in result
        assert "num_blocks" in result

    def test_without_prefix(self):
        result = extract_features("6042")
        assert "opcode_seq" in result