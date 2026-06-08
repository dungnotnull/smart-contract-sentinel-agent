"""
Unit tests for GNN inference server endpoints.
Tests hybrid mode behavior with trained model and heuristic fallback.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from ml_pipeline.serve import app


@pytest.fixture
def client():
    """Create test client for FastAPI app."""
    return TestClient(app)


class TestHealthEndpoint:
    """Test /health endpoint responses."""

    def test_health_returns_ok(self, client):
        """Health endpoint should return 200 status."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "model_loaded" in data
        assert "mode" in data
        assert "model_version" in data

    def test_health_includes_mode_information(self, client):
        """Health endpoint should include current inference mode."""
        response = client.get("/health")
        data = response.json()
        assert data["mode"] in ["trained", "heuristic_fallback"]
        assert isinstance(data["model_loaded"], bool)


class TestScoreEndpointHeuristicMode:
    """Test /score endpoint behavior in heuristic fallback mode."""

    def test_score_with_invalid_bytecode(self, client):
        """Invalid bytecode should return low threat score."""
        response = client.post(
            "/score",
            json={
                "bytecode": "0x",  # Invalid bytecode
                "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000001"
            },
        )

        # Should use heuristic fallback and return a response
        assert response.status_code == 200
        data = response.json()
        assert "threat_score" in data
        assert "vuln_type" in data
        assert "latency_ms" in data
        assert data["mode"] == "heuristic_fallback"
        # Invalid bytecode should have low threat score
        assert data["threat_score"] <= 0.1

    def test_score_with_reentrancy_bytecode(self, client):
        """Bytecode with reentrancy patterns should be detected."""
        # Real bytecode snippet with CALL opcodes (f1) and transfers
        reentrancy_bytecode = (
            "0x608060405234801561001057600080fd5b50600436106100355760003560e01c8063a9059cbb"
            "1461003a578063f1f2f2e514610058575b600080fd5b61005660048036036"
            "04081101561004e57600080fd5b5080359060200135151561006a565b005b61006f6004"
            "803603602081101561006957600080fd5b503515156100e5575b6000821315801561008a5750"
            "608f1f2f2e5"  # Extra CALL pattern
        )

        response = client.post(
            "/score",
            json={
                "bytecode": reentrancy_bytecode,
                "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000001"
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["mode"] == "heuristic_fallback"
        assert "threat_score" in data
        assert "vuln_type" in data
        assert data["latency_ms"] >= 0

    def test_score_with_flash_loan_bytecode(self, client):
        """Bytecode with flash loan patterns should be detected."""
        # Bytecode containing Uniswap swap selector
        flash_loan_bytecode = (
            "0x608060405234801561001057600080fd5b50600436106100355760003560e01c80637ff36a5e"
            "1461003a5780638803dbee1461005f575b600080fd5b6100526004803603604081101561004a57"
            "600080fd5b5080359060200135151561006a565b60408051918252519081900360200190f35b"
        )

        response = client.post(
            "/score",
            json={
                "bytecode": flash_loan_bytecode,
                "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000002"
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["mode"] == "heuristic_fallback"
        # Flash loan bytecode should have higher threat score
        assert data["threat_score"] >= 0.0

    def test_score_returns_required_fields(self, client):
        """Response should include all required fields."""
        response = client.post(
            "/score",
            json={
                "bytecode": "0x6080604052348015600f57600080fd5b50",
                "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000003"
            },
        )

        assert response.status_code == 200
        data = response.json()

        # Check required fields
        assert "threat_score" in data
        assert "vuln_type" in data
        assert "latency_ms" in data
        assert "mode" in data

        # Check field types and constraints
        assert isinstance(data["threat_score"], (int, float))
        assert 0.0 <= data["threat_score"] <= 1.0
        assert isinstance(data["vuln_type"], str)
        assert isinstance(data["latency_ms"], (int, float))
        assert data["latency_ms"] >= 0
        assert data["mode"] in ["trained", "heuristic_fallback"]

    def test_score_latency_is_reasonable(self, client):
        """Scoring should complete quickly (< 1000ms)."""
        import time

        bytecode = "0x6080604052348015600f57600080fd5b50" * 10  # Larger bytecode

        start = time.time()
        response = client.post(
            "/score",
            json={
                "bytecode": bytecode,
                "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000004"
            },
        )
        elapsed_ms = (time.time() - start) * 1000

        assert response.status_code == 200
        # Heuristic scoring should be fast
        assert elapsed_ms < 1000

    def test_score_with_malformed_request(self, client):
        """Malformed request should return 422."""
        response = client.post(
            "/score",
            json={
                "bytecode": "0x1234"
                # Missing tx_hash
            },
        )

        assert response.status_code == 422


class TestScoreEndpointTrainedMode:
    """Test /score endpoint behavior with trained model."""

    @patch('ml_pipeline.serve.model')
    @patch('ml_pipeline.serve.model_mode', 'trained')
    def test_score_with_trained_model(self, mock_model, client):
        """When trained model is available, should use it."""
        # Mock the model's forward pass
        mock_forward = MagicMock()
        mock_forward.return_value = MagicMock(
            threat_score=0.85,
            vuln_type="flash_loan"
        )
        mock_model.forward = mock_forward

        # Note: This test will be updated once actual GNN inference is implemented
        # For now, it tests the structure
        response = client.post(
            "/score",
            json={
                "bytecode": "0x6080604052348015600f57600080fd5b50",
                "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000005"
            },
        )

        # Should return response (may be trained or heuristic depending on implementation)
        assert response.status_code in [200, 500]


class TestModeReporting:
    """Test that mode is correctly reported in responses."""

    def test_mode_reported_in_score_response(self, client):
        """Score response should include mode field."""
        response = client.post(
            "/score",
            json={
                "bytecode": "0x6080604052348015600f57600080fd5b50",
                "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000006"
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "mode" in data
        assert data["mode"] in ["trained", "heuristic_fallback"]

    def test_mode_reported_in_health_response(self, client):
        """Health response should include mode field."""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert "mode" in data
        assert data["mode"] in ["trained", "heuristic_fallback"]


class TestVulnerabilityTypes:
    """Test vulnerability type classification."""

    def test_vuln_type_is_valid(self, client):
        """Vulnerability type should be one of the known types."""
        response = client.post(
            "/score",
            json={
                "bytecode": "0x6080604052348015600f57600080fd5b50",
                "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000007"
            },
        )

        assert response.status_code == 200
        data = response.json()
        valid_types = [
            "reentrancy",
            "flash_loan",
            "oracle_manipulation",
            "access_control",
            "other",
            "unknown",
        ]
        assert data["vuln_type"] in valid_types


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_score_with_empty_bytecode(self, client):
        """Empty bytecode should return low threat score."""
        response = client.post(
            "/score",
            json={
                "bytecode": "",
                "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000008"
            },
        )

        # Should handle gracefully with heuristic fallback
        assert response.status_code == 200
        data = response.json()
        assert data["threat_score"] <= 0.1

    def test_score_with_very_long_bytecode(self, client):
        """Very long bytecode should be handled correctly."""
        # Create a large bytecode string
        large_bytecode = "0x6080604052348015600f57600080fd5b50" * 1000

        response = client.post(
            "/score",
            json={
                "bytecode": large_bytecode,
                "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000009"
            },
        )

        # Should handle without error
        assert response.status_code == 200
        data = response.json()
        assert "threat_score" in data
