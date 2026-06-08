"""Test GNN inference server endpoints."""
import pytest
from fastapi.testclient import TestClient

from ml_pipeline.serve import app


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"


class TestScoreEndpoint:
    def test_score_without_model_returns_503(self, client):
        """When model is not loaded, should return 503."""
        response = client.post(
            "/score",
            json={"bytecode": "0x", "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000001"},
        )
        # Model not trained yet, should return 503
        assert response.status_code == 503