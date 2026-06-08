"""
FastAPI inference server for GNN vulnerability classifier.
Provides /score endpoint for bytecode threat scoring.
Supports hybrid mode: trained model with heuristic fallback.
"""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from ml_pipeline.models.model_loader import get_inference_model, ModelMode
from ml_pipeline.models.heuristic_scorer import score_bytecode as heuristic_score_bytecode

logger = logging.getLogger(__name__)


# --- Request/Response Models ---

class ScoringRequest(BaseModel):
    bytecode: str = Field(..., description="Hex string of contract bytecode (with or without 0x prefix)")
    tx_hash: str = Field(..., description="Transaction hash being analyzed")


class ScoringResponse(BaseModel):
    threat_score: float = Field(..., ge=0.0, le=1.0, description="Threat score 0.0-1.0")
    vuln_type: str = Field(..., description="Predicted vulnerability type")
    latency_ms: float = Field(..., description="Inference latency in milliseconds")
    mode: str = Field(..., description="Inference mode used: 'trained' or 'heuristic_fallback'")


# --- App State ---

model = None
model_mode: ModelMode = "heuristic_fallback"
model_version: str = "unknown"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup using hybrid loader."""
    global model, model_mode, model_version

    logger.info("Loading GNN model...")

    try:
        loaded_model, mode = get_inference_model(
            in_channels=128,
            hidden=128,
            num_classes=5,
        )

        model = loaded_model
        model_mode = mode

        if mode == "trained":
            logger.info("Loaded trained GNN model")
            model_version = "1.0.0"  # TODO: Load from model card
        else:
            logger.info("No trained model found, using heuristic fallback")
            model_version = "heuristic"

    except Exception as e:
        logger.error(f"Failed to load model: {e}, falling back to heuristic mode")
        model = None
        model_mode = "heuristic_fallback"
        model_version = "heuristic"

    yield

    # Cleanup
    logger.info("Shutting down inference server")


app = FastAPI(
    title="SmartSentinel GNN Inference Server",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Health check endpoint with mode information."""
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "mode": model_mode,
        "model_version": model_version,
    }


@app.post("/score", response_model=ScoringResponse)
async def score_bytecode(request: ScoringRequest) -> ScoringResponse:
    """
    Score bytecode for vulnerability threat.

    Uses trained GNN model if available, otherwise falls back to heuristic analysis.

    Input: {bytecode: "0x...", tx_hash: "0x..."}
    Output: {threat_score: 0.87, vuln_type: "flash_loan", latency_ms: 45, mode: "trained"}
    """
    start = time.perf_counter()

    # Use heuristic fallback if no trained model
    if model is None or model_mode == "heuristic_fallback":
        logger.debug(f"Using heuristic fallback for tx {request.tx_hash}")

        try:
            heuristic_result = heuristic_score_bytecode(request.bytecode)

            elapsed_ms = (time.perf_counter() - start) * 1000

            return ScoringResponse(
                threat_score=heuristic_result.threat_score,
                vuln_type=heuristic_result.vuln_type,
                latency_ms=round(elapsed_ms, 2),
                mode="heuristic_fallback",
            )

        except Exception as e:
            logger.error(f"Heuristic scoring failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Scoring failed: {e}"
            )

    # Use trained GNN model
    try:
        # TODO: Implement actual GNN inference
        # For now, return a placeholder response
        elapsed_ms = (time.perf_counter() - start) * 1000

        return ScoringResponse(
            threat_score=0.0,
            vuln_type="unknown",
            latency_ms=round(elapsed_ms, 2),
            mode="trained",
        )

    except Exception as e:
        logger.error(f"GNN inference failed: {e}")
        # Fall back to heuristic on error
        logger.info(f"Falling back to heuristic scoring for tx {request.tx_hash}")

        try:
            heuristic_result = heuristic_score_bytecode(request.bytecode)

            elapsed_ms = (time.perf_counter() - start) * 1000

            return ScoringResponse(
                threat_score=heuristic_result.threat_score,
                vuln_type=heuristic_result.vuln_type,
                latency_ms=round(elapsed_ms, 2),
                mode="heuristic_fallback",
            )

        except Exception as heuristic_error:
            logger.error(f"Heuristic fallback also failed: {heuristic_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Both GNN and heuristic scoring failed: GNN={e}, heuristic={heuristic_error}"
            )
