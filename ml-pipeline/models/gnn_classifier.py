"""
GNN Vulnerability Classifier — SmartSentinel ML Pipeline
DA-GNN inspired dual-attention GNN for smart contract vulnerability detection.
Input: heterogeneous graph of CFG + opcode blocks from bytecode disassembly.
Output: threat_score (0.0-1.0) + vulnerability_type
"""

import torch
import torch.nn.functional as F
from torch_geometric.nn import GATConv, global_mean_pool


class VulnerabilityGNN(torch.nn.Module):
    """
    DA-GNN inspired dual-attention GNN for smart contract vulnerability detection.
    Input: heterogeneous graph of CFG + opcode blocks from bytecode disassembly.
    Output: threat_score (0.0-1.0) + vulnerability_type
    """

    VULN_TYPES = ["reentrancy", "flash_loan", "oracle_manipulation", "access_control", "other"]

    def __init__(self, in_channels: int = 128, hidden: int = 128, num_classes: int = 5):
        super().__init__()
        # CFG-level attention
        self.cfg_conv1 = GATConv(in_channels, hidden, heads=4, concat=False)
        self.cfg_conv2 = GATConv(hidden, hidden, heads=4, concat=False)
        # Opcode block semantic embedding
        self.opcode_gru = torch.nn.GRU(in_channels, hidden, batch_first=True)
        # Dual fusion + classification head
        self.classifier = torch.nn.Linear(hidden * 2, num_classes)
        self.threat_head = torch.nn.Linear(hidden * 2, 1)

    def forward(self, cfg_data, opcode_seq):
        """
        Forward pass through dual-attention GNN.

        Args:
            cfg_data: PyG Data object with x (node features) and edge_index
            opcode_seq: Tensor of opcode sequence embeddings [batch, seq_len, in_channels]

        Returns:
            Dictionary with threat_score and vuln_type logits
        """
        # CFG branch
        cfg_x = F.elu(self.cfg_conv1(cfg_data.x, cfg_data.edge_index))
        cfg_x = self.cfg_conv2(cfg_x, cfg_data.edge_index)
        cfg_pooled = global_mean_pool(cfg_x, cfg_data.batch)

        # Opcode branch
        _, opcode_hidden = self.opcode_gru(opcode_seq)
        opcode_emb = opcode_hidden.squeeze(0)

        # Dual fusion
        fused = torch.cat([cfg_pooled, opcode_emb], dim=-1)

        return {
            "threat_score": torch.sigmoid(self.threat_head(fused)).squeeze(-1),
            "vuln_type": self.classifier(fused),
        }