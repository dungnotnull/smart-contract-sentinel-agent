"""
Feature extraction from smart contract bytecode.
Extracts graph features and opcode sequences for GNN input.
"""

import logging
import re
from typing import Dict, List, Tuple

logger = logging.getLogger(__name__)

try:
    import torch
    import torch_geometric
    from torch_geometric.data import Data
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("PyTorch not available, feature extraction will fail")


# Opcodes for feature extraction
OPCODES = {
    # Stack operations
    "60": "PUSH1", "61": "PUSH2", "50": "POP", "51": "MLOAD", "52": "MSTORE",
    # Arithmetic
    "01": "ADD", "02": "MUL", "03": "SUB", "04": "DIV", "05": "MOD",
    # Memory operations
    "54": "SLOAD", "55": "SSTORE", "51": "MLOAD", "52": "MSTORE",
    # Flow control
    "56": "JUMP", "57": "JUMPI", "5b": "JUMPDEST", "5c": "JUMP",
    # Block operations
    "f3": "RETURNDATASIZE", "f4": "DELEGATECALL", "f1": "CALL", "f2": "CALLCODE",
    "fa": "STATICCALL", "fd": "REVERT", "fe": "INVALID",
    # Log operations
    "a0": "LOG0", "a1": "LOG1", "a2": "LOG2", "a3": "LOG3", "a4": "LOG4",
    # Contract operations
    "ff": "SELFDESTRUCT", "f0": "CREATE", "f5": "CREATE2", "f1": "CALL",
    # External call patterns
    "a9": "EXTCODECOPY", "3e": "EXTCODESIZE",
    # Token operations
    "a9059cbb": "TRANSFER", "70a08231": "BALANCEOF",
    # Stop
    "00": "STOP", "f3": "RETURN",
}


def clean_bytecode(bytecode: str) -> str:
    """Remove 0x prefix and convert to lowercase."""
    if bytecode.startswith("0x"):
        bytecode = bytecode[2:]
    return bytecode.lower()


def parse_bytecode_to_opcodes(bytecode: str) -> List[str]:
    """
    Parse bytecode into list of opcodes.

    Args:
        bytecode: Hex string of bytecode

    Returns:
        List of opcodes
    """
    clean = clean_bytecode(bytecode)

    if len(clean) < 10:
        return []

    opcodes = []
    i = 0
    while i < len(clean):
        # Check for PUSH instructions (PUSH1-PUSH32)
        if clean[i:i2] in ["60", "61", "62", "63", "64", "65", "66", "67", "68", "69",
                            "6a", "6b", "6c", "6d", "6e", "6f", "70", "71", "72", "73", "74",
                            "75", "76", "77", "78", "79", "7a", "7b", "7c", "7d", "7e", "7f"]:
            # PUSHn: next n bytes are data
            push_size = int(clean[i:i2], 16) - 95  # PUSH1 = 0x60 = 96, so subtract 95
            opcodes.append(clean[i:i2])
            i += 2 + push_size * 2  # Skip opcode and pushed bytes
        else:
            # Regular opcode (2 hex chars = 1 byte)
            opcode = clean[i:i2]
            opcodes.append(opcode)
            i += 2

    return opcodes


def opcode_to_embedding(opcode: str, embedding_dim: int = 128) -> List[float]:
    """
    Convert opcode to embedding vector.

    Args:
        opcode: Hex string of opcode
        embedding_dim: Dimension of embedding

    Returns:
        Embedding vector
    """
    import hashlib

    # Hash opcode to create embedding
    hash_val = int(hashlib.md5(opcode.encode()).hexdigest()[:8], 16)

    # Create normalized embedding
    embedding = []
    for i in range(embedding_dim):
        # Use different bits of hash for each dimension
        bit_val = (hash_val >> (i % 32)) & 0x1
        embedding.append(float(bit_val))

    return embedding


def build_control_flow_graph(opcodes: List[str]) -> Tuple[List[List[int]], List[str]]:
    """
    Build simplified CFG from opcodes.

    Args:
        opcodes: List of opcodes

    Returns:
        Tuple of (edge_list, node_labels)
    """
    if not opcodes:
        return [], []

    edges = []
    node_labels = []

    # Identify basic blocks (simplified)
    # A basic block ends at JUMP, JUMPI, REVERT, STOP
    basic_blocks = []
    current_block = []

    for i, opcode in enumerate(opcodes):
        current_block.append(opcode)

        if opcode in ["56", "57", "5b", "fd", "fe", "00", "f3"]:
            # End of basic block
            if current_block:
                basic_blocks.append(current_block)
                current_block = []

    if current_block:
        basic_blocks.append(current_block)

    # Build edges between consecutive blocks
    for i in range(len(basic_blocks) - 1):
        edges.append([i, i + 1])

    # Add labels to nodes (basic blocks)
    for block in basic_blocks:
        label = "block_" + "_".join(block[:3])  # Use first 3 opcodes as label
        node_labels.append(label)

    return edges, node_labels


def extract_bytecode_features(
    bytecode: str,
    embedding_dim: int = 128,
) -> Data:
    """
    Extract features from bytecode for GNN input.

    Args:
        bytecode: Hex string of contract bytecode
        embedding_dim: Dimension for node embeddings

    Returns:
        PyG Data object with graph features
    """
    if not TORCH_AVAILABLE:
        raise RuntimeError("PyTorch not available for feature extraction")

    # Clean bytecode
    clean = clean_bytecode(bytecode)

    if len(clean) < 10:
        raise ValueError("Bytecode too short for feature extraction")

    # Parse opcodes
    opcodes = parse_bytecode_to_opcodes(bytecode)

    if not opcodes:
        raise ValueError("No opcodes extracted from bytecode")

    # Build CFG
    edges, node_labels = build_control_flow_graph(opcodes)

    # Create node feature matrix
    num_nodes = max(len(opcodes), 100)  # At least 100 nodes or actual opcode count

    # Create embeddings for each opcode
    node_features = []
    for i in range(num_nodes):
        if i < len(opcodes):
            opcode = opcodes[i]
            embedding = opcode_to_embedding(opcode, embedding_dim)
        else:
            # Padding for shorter bytecodes
            embedding = [0.0] * embedding_dim

        node_features.append(embedding)

    # Convert to tensors
    x = torch.tensor(node_features, dtype=torch.float)

    # Create edge index
    if edges:
        edge_index = torch.tensor(edges, dtype=torch.long).t().contiguous()
    else:
        # Self-loop for isolated nodes
        edge_index = torch.tensor([[], []], dtype=torch.long)

    # Create Data object
    data = Data(
        x=x,
        edge_index=edge_index,
        num_nodes=num_nodes,
    )

    return data


def extract_opcode_sequence(bytecode: str, max_length: int = 200) -> torch.Tensor:
    """
    Extract opcode sequence for GRU branch.

    Args:
        bytecode: Hex string of bytecode
        max_length: Maximum sequence length

    Returns:
        Tensor of opcode embeddings [seq_len, embedding_dim]
    """
    if not TORCH_AVAILABLE:
        raise RuntimeError("PyTorch not available")

    opcodes = parse_bytecode_to_opcodes(bytecode)

    # Truncate or pad to max_length
    opcodes = opcodes[:max_length]

    # Create opcode embeddings
    sequence_embeddings = []
    for opcode in opcodes:
        embedding = opcode_to_embedding(opcode, 128)
        sequence_embeddings.append(embedding)

    # Pad to max_length
    while len(sequence_embeddings) < max_length:
        sequence_embeddings.append([0.0] * 128)

    return torch.tensor(sequence_embeddings, dtype=torch.float).unsqueeze(0)
