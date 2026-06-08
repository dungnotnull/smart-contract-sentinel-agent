"""
Bytecode feature extractor for GNN classifier.
Converts raw bytecode into Control Flow Graph (CFG) + opcode sequences
suitable for input into the VulnerabilityGNN model.
"""

from dataclasses import dataclass, field
from typing import Optional

import numpy as np


@dataclass
class BasicBlock:
    """A basic block in the control flow graph."""
    start_offset: int
    end_offset: int
    opcodes: list[str] = field(default_factory=list)


@dataclass
class CFGGraph:
    """Control Flow Graph extracted from bytecode."""
    blocks: list[BasicBlock] = field(default_factory=list)
    edges: list[tuple[int, int]] = field(default_factory=list)  # (src_block_idx, dst_block_idx)
    node_features: Optional[np.ndarray] = None  # [num_blocks, feature_dim]


# Known EVM jump opcodes that create CFG edges
JUMP_OPCODES = {"JUMP", "JUMPI"}
STOP_OPCODES = {"STOP", "RETURN", "REVERT", "INVALID", "SELFDESTRUCT"}


def disassemble_bytecode(bytecode_hex: str) -> list[dict]:
    """
    Disassemble EVM bytecode hex string into opcode list.
    Uses pyevmasm if available, falls back to basic opcode table.

    Args:
        bytecode_hex: Hex string of bytecode (with or without 0x prefix)

    Returns:
        List of dicts with 'offset', 'opcode', 'operand' keys
    """
    try:
        import pyevmasm
        bytecode = bytes.fromhex(bytecode_hex.replace("0x", ""))
        instructions = list(pyevmasm.disassemble_all(bytecode))
        result = []
        for ins in instructions:
            opcode_name = ins.name if hasattr(ins, "name") else f"OP_{ins.opcode:02x}"
            offset = ins.pc if hasattr(ins, "pc") else 0
            operand = ins.operand if hasattr(ins, "operand") else None
            result.append({"offset": offset, "opcode": opcode_name, "operand": operand})
        return result
    except (ImportError, Exception):
        # Fallback: basic opcode length table for common opcodes
        return _basic_disassemble(bytecode_hex.replace("0x", ""))


def _basic_disassemble(bytecode_hex: str) -> list[dict]:
    """Basic fallback disassembler using PUSH operand lengths."""
    result = []
    bytecode = bytes.fromhex(bytecode_hex) if bytecode_hex else b""
    i = 0
    while i < len(bytecode):
        op = bytecode[i]
        result.append({"offset": i, "opcode": f"OP_{op:02x}", "operand": None})
        if 0x60 <= op <= 0x7F:  # PUSH1-PUSH32
            push_len = op - 0x5F
            i += 1 + push_len
        else:
            i += 1
    return result


def build_cfg(opcodes: list[dict]) -> CFGGraph:
    """
    Build a Control Flow Graph from disassembled opcodes.

    Args:
        opcodes: List of opcode dicts from disassemble_bytecode

    Returns:
        CFGGraph with basic blocks and edges
    """
    if not opcodes:
        return CFGGraph()

    # Split opcodes into basic blocks
    blocks: list[BasicBlock] = []
    current_block_opcodes: list[str] = []
    block_start = 0

    for i, op in enumerate(opcodes):
        current_block_opcodes.append(op["opcode"])

        # End block on jump, jump destination, or stop
        is_end = op["opcode"] in JUMP_OPCODES or op["opcode"] in STOP_OPCODES
        is_jumpdest = op["opcode"] == "JUMPDEST" and i > 0

        if is_end or is_jumpdest:
            blocks.append(BasicBlock(
                start_offset=block_start,
                end_offset=op["offset"],
                opcodes=current_block_opcodes[:],
            ))
            current_block_opcodes = []
            block_start = op["offset"] + 1

    # Trailing opcodes
    if current_block_opcodes:
        blocks.append(BasicBlock(
            start_offset=block_start,
            end_offset=opcodes[-1]["offset"] if opcodes else 0,
            opcodes=current_block_opcodes[:],
        ))

    # Build edges (simplified: sequential + jumps)
    edges: list[tuple[int, int]] = []
    for i in range(len(blocks) - 1):
        # Sequential flow
        if blocks[i].opcodes and blocks[i].opcodes[-1] not in STOP_OPCODES:
            edges.append((i, i + 1))

    return CFGGraph(blocks=blocks, edges=edges)


def extract_features(bytecode_hex: str) -> dict:
    """
    Full feature extraction pipeline: bytecode -> CFG + opcode sequences.

    Args:
        bytecode_hex: Hex string of contract bytecode

    Returns:
        Dict with 'cfg' (CFGGraph), 'opcode_seq' (list of opcode strings),
        'num_blocks', 'num_edges'
    """
    opcodes = disassemble_bytecode(bytecode_hex)
    cfg = build_cfg(opcodes)
    opcode_seq = [op["opcode"] for op in opcodes]

    return {
        "cfg": cfg,
        "opcode_seq": opcode_seq,
        "num_blocks": len(cfg.blocks),
        "num_edges": len(cfg.edges),
        "raw_opcode_count": len(opcodes),
    }