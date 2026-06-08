"""
Model loader for GNN vulnerability classifier.
Supports loading trained PyTorch weights or falling back to heuristic mode.
"""

import json
import logging
from pathlib import Path
from typing import Literal, Any

try:
    import torch
    from torch_geometric.data import Data
    from ml_pipeline.models.gnn_classifier import VulnerabilityGNN
    TORCH_AVAILABLE = True
except ImportError:
    torch = None
    Data = None
    VulnerabilityGNN = None
    TORCH_AVAILABLE = False

logger = logging.getLogger(__name__)

ModelMode = Literal["trained", "heuristic_fallback"]


class ModelLoadResult:
    """Result of model loading attempt."""
    def __init__(
        self,
        model: Any,
        mode: ModelMode,
        weights_path: str | None = None,
        error: str | None = None,
    ):
        self.model = model
        self.mode = mode
        self.weights_path = weights_path
        self.error = error

    @property
    def is_trained(self) -> bool:
        return self.mode == "trained" and self.model is not None

    @property
    def is_fallback(self) -> bool:
        return self.mode == "heuristic_fallback"


def load_model_card() -> dict:
    """Load model-card.json from models directory."""
    model_card_path = Path("models/gnn-vuln-classifier/model-card.json")

    if not model_card_path.exists():
        logger.warning("Model card not found, returning defaults")
        return {
            "model_version": "1.0.0",
            "status": "heuristic_fallback",
            "trained_weights_path": None,
        }

    with open(model_card_path) as f:
        return json.load(f)


def find_trained_weights() -> Path | None:
    """Find the latest trained model weights file."""
    models_dir = Path("models/gnn-vuln-classifier")

    if not models_dir.exists():
        return None

    # Look for .pt files
    pt_files = list(models_dir.glob("model-v*.pt"))

    if not pt_files:
        return None

    # Return the most recent by version number
    pt_files.sort(key=lambda p: p.name, reverse=True)
    return pt_files[0]


def load_trained_model(
    in_channels: int = 128,
    hidden: int = 128,
    num_classes: int = 5,
) -> ModelLoadResult:
    """
    Attempt to load trained GNN model weights.

    Returns:
        ModelLoadResult with loaded model or fallback info
    """
    if not TORCH_AVAILABLE:
        logger.info("PyTorch not available, using heuristic fallback")
        return ModelLoadResult(
            model=None,
            mode="heuristic_fallback",
            error="PyTorch not available"
        )

    weights_path = find_trained_weights()

    if weights_path is None:
        logger.info("No trained weights found, will use heuristic fallback")
        return ModelLoadResult(
            model=None,
            mode="heuristic_fallback",
            error="No trained weights file found"
        )

    try:
        logger.info(f"Loading trained weights from {weights_path}")

        # Initialize model architecture
        model = VulnerabilityGNN(
            in_channels=in_channels,
            hidden=hidden,
            num_classes=num_classes
        )

        # Load weights
        state_dict = torch.load(weights_path, map_location="cpu")
        model.load_state_dict(state_dict)
        model.eval()

        logger.info(f"Successfully loaded trained model from {weights_path}")

        # Update model card status
        model_card = load_model_card()
        model_card["status"] = "trained"
        model_card["trained_weights_path"] = str(weights_path)

        return ModelLoadResult(
            model=model,
            mode="trained",
            weights_path=str(weights_path)
        )

    except Exception as e:
        logger.error(f"Failed to load trained weights: {e}")
        return ModelLoadResult(
            model=None,
            mode="heuristic_fallback",
            error=f"Failed to load weights: {e}"
        )


def get_inference_model(
    in_channels: int = 128,
    hidden: int = 128,
    num_classes: int = 5,
) -> tuple[Any, ModelMode]:
    """
    Get the model for inference.
    Returns tuple of (model or None, mode).
    """
    result = load_trained_model(in_channels, hidden, num_classes)

    if result.is_fallback:
        # Return None model - inference server will use heuristic scorer
        return None, "heuristic_fallback"

    return result.model, "trained"
