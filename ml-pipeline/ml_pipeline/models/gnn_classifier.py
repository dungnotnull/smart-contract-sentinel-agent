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
        # Handle both Data objects and raw tensors
        if hasattr(cfg_data, 'x'):
            # PyG Data object
            x = cfg_data.x
            edge_index = cfg_data.edge_index
            batch = cfg_data.batch if hasattr(cfg_data, 'batch') else None
        else:
            # Raw tensors
            x = cfg_data
            edge_index = opcode_seq  # In this case, second param is edge_index
            batch = None

        # CFG branch
        cfg_x = F.elu(self.cfg_conv1(x, edge_index))
        cfg_x = self.cfg_conv2(cfg_x, edge_index)

        if batch is not None:
            cfg_pooled = global_mean_pool(cfg_x, batch)
        else:
            # Single graph case
            cfg_pooled = cfg_x.mean(dim=0, keepdim=True)

        # Opcode branch (use same features for simplicity)
        # In production, would extract actual opcode sequence
        if hasattr(opcode_seq, 'dim') and opcode_seq.dim() >= 2:
            # Sequence data
            _, opcode_hidden = self.opcode_gru(opcode_seq)
            opcode_emb = opcode_hidden[:, -1, :]  # Take last hidden state
        else:
            # Use pooled CFG features as proxy
            opcode_emb = cfg_pooled

        # Dual fusion
        fused = torch.cat([cfg_pooled, opcode_emb], dim=-1)

        return {
            "threat_score": torch.sigmoid(self.threat_head(fused)).squeeze(-1),
            "vuln_type": self.classifier(fused),
        }

    def predict(self, data):
        """
        Prediction method for inference.

        Args:
            data: PyG Data object or tensors

        Returns:
            Dictionary with predictions
        """
        self.eval()
        with torch.no_grad():
            output = self.forward(data, data)

        # Get predicted class and probability
        vuln_logits = output["vuln_type"]
        threat_score = output["threat_score"]

        if threat_score.dim() == 0:
            # Single sample
            probs = F.softmax(vuln_logits.unsqueeze(0), dim=1)
            pred_class = probs.argmax(dim=1).item()
            confidence = probs[0, pred_class].item()
        else:
            # Batch
            probs = F.softmax(vuln_logits, dim=1)
            pred_class = probs.argmax(dim=1)
            confidence = probs.max(dim=1).values.item()

        return {
            "threat_score": threat_score.item() if threat_score.dim() == 0 else threat_score,
            "vuln_type": self.VULN_TYPES[pred_class] if isinstance(pred_class, int) else pred_class,
            "confidence": confidence,
            "probabilities": probs if threat_score.dim() == 0 else None,
        }