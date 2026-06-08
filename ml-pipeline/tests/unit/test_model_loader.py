"""Tests for model loader."""

import pytest
from ml_pipeline.models.model_loader import (
    ModelLoadResult,
    load_model_card,
    find_trained_weights,
    load_trained_model,
    get_inference_model,
)


def test_load_model_card_when_missing(tmp_path, monkeypatch):
    """Test that load_model_card returns defaults when file doesn't exist."""
    monkeypatch.chdir(tmp_path)

    card = load_model_card()

    assert card["model_version"] == "1.0.0"
    assert card["status"] == "heuristic_fallback"
    assert card["trained_weights_path"] is None


def test_find_trained_weights_returns_none_when_no_models(tmp_path, monkeypatch):
    """Test that find_trained_weights returns None when no weights exist."""
    monkeypatch.chdir(tmp_path)

    weights = find_trained_weights()

    assert weights is None


def test_load_trained_model_returns_fallback_when_no_weights(tmp_path, monkeypatch):
    """Test that load_trained_model returns fallback mode when no weights."""
    monkeypatch.chdir(tmp_path)

    result = load_trained_model()

    assert result.is_fallback
    assert result.model is None
    assert result.mode == "heuristic_fallback"


def test_get_inference_model_returns_fallback_tuple(tmp_path, monkeypatch):
    """Test that get_inference_model returns (None, 'heuristic_fallback') when no weights."""
    monkeypatch.chdir(tmp_path)

    model, mode = get_inference_model()

    assert model is None
    assert mode == "heuristic_fallback"
