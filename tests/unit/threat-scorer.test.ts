/**
 * SmartSentinel — Unit tests for threat scorer
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { assessThreat, ThreatScorer } from "../../src/ml/threat-scorer.js";
import { GnnClient } from "../../src/ml/gnn-client.js";
import type { GnnScore } from "../../src/ml/gnn-client.js";
import type { SimulationResult } from "../../src/simulation/tx-simulator.js";

describe("ThreatScorer", () => {
  describe("assessThreat", () => {
    const createSimulationResult = (overrides?: Partial<SimulationResult>): SimulationResult => ({
      tvlDeltaPct: 5.0,
      reverted: false,
      flashLoanDetected: false,
      crossContractReentrant: false,
      oraclePriceDelta: 0,
      ...overrides,
    });

    const createGnnScore = (overrides?: Partial<GnnScore>): GnnScore => ({
      threatScore: 0.8,
      vulnType: "reentrancy",
      latencyMs: 50,
      mode: "trained",
      ...overrides,
    });

    it("should return actionable assessment when all thresholds passed", () => {
      const gnnScore = createGnnScore({ threatScore: 0.8 });
      const simulation = createSimulationResult({ tvlDeltaPct: 6.0 });
      const heuristicFlags = ["suspicious_selector", "high_gas"];

      const result = assessThreat(
        gnnScore,
        simulation,
        heuristicFlags,
        0.75, // gnnThreshold
        5.0, // drainThresholdPct
        2, // minHeuristicFlags
      );

      expect(result.actionable).toBe(true);
      expect(result.mode).toBe("trained");
      expect(result.confidence).toBeGreaterThan(0.7); // High confidence in trained mode
      expect(result.signals.gnnScore).toBe(0.8);
      expect(result.signals.drainPct).toBe(6.0);
    });

    it("should return non-actionable when GNN score below threshold", () => {
      const gnnScore = createGnnScore({ threatScore: 0.6 });
      const simulation = createSimulationResult({ tvlDeltaPct: 6.0 });
      const heuristicFlags = ["suspicious_selector", "high_gas"];

      const result = assessThreat(
        gnnScore,
        simulation,
        heuristicFlags,
        0.75,
        5.0,
        2,
      );

      expect(result.actionable).toBe(false);
      expect(result.score).toBeLessThan(1.0);
    });

    it("should return non-actionable when drain below threshold", () => {
      const gnnScore = createGnnScore({ threatScore: 0.8 });
      const simulation = createSimulationResult({ tvlDeltaPct: 3.0 });
      const heuristicFlags = ["suspicious_selector", "high_gas"];

      const result = assessThreat(
        gnnScore,
        simulation,
        heuristicFlags,
        0.75,
        5.0,
        2,
      );

      expect(result.actionable).toBe(false);
    });

    it("should return non-actionable when insufficient heuristic flags", () => {
      const gnnScore = createGnnScore({ threatScore: 0.8 });
      const simulation = createSimulationResult({ tvlDeltaPct: 6.0 });
      const heuristicFlags = ["suspicious_selector"];

      const result = assessThreat(
        gnnScore,
        simulation,
        heuristicFlags,
        0.75,
        5.0,
        2,
      );

      expect(result.actionable).toBe(false);
    });

    it("should reduce score when simulation reverted", () => {
      const gnnScore = createGnnScore({ threatScore: 0.8 });
      const simulation = createSimulationResult({ tvlDeltaPct: 6.0, reverted: true });
      const heuristicFlags = ["suspicious_selector", "high_gas"];

      const result = assessThreat(
        gnnScore,
        simulation,
        heuristicFlags,
        0.75,
        5.0,
        2,
      );

      expect(result.score).toBeLessThan(0.5); // Should be reduced by 70%
      expect(result.signals.simulationReverted).toBe(true);
    });

    it("should use heuristic_fallback mode when GNN indicates it", () => {
      const gnnScore = createGnnScore({ threatScore: 0.8, mode: "heuristic_fallback" });
      const simulation = createSimulationResult({ tvlDeltaPct: 6.0 });
      const heuristicFlags = ["suspicious_selector", "high_gas"];

      const result = assessThreat(
        gnnScore,
        simulation,
        heuristicFlags,
        0.75,
        5.0,
        2,
      );

      expect(result.mode).toBe("heuristic_fallback");
      expect(result.confidence).toBeLessThanOrEqual(0.85); // Lower baseline confidence than trained mode
    });

    it("should give higher confidence for trained mode with strong signals", () => {
      const gnnScore = createGnnScore({ threatScore: 0.9, mode: "trained" });
      const simulation = createSimulationResult({
        tvlDeltaPct: 8.0,
        flashLoanDetected: true,
        crossContractReentrant: true,
      });
      const heuristicFlags = ["suspicious_selector", "high_gas", "flash_loan"];

      const result = assessThreat(
        gnnScore,
        simulation,
        heuristicFlags,
        0.75,
        5.0,
        2,
      );

      expect(result.confidence).toBeGreaterThan(0.85); // Very high confidence
    });

    it("should detect oracle manipulation from price delta", () => {
      const gnnScore = createGnnScore();
      const simulation = createSimulationResult({ oraclePriceDelta: 60 });
      const heuristicFlags = ["suspicious_selector"];

      const result = assessThreat(
        gnnScore,
        simulation,
        heuristicFlags,
        0.75,
        5.0,
        2,
      );

      expect(result.signals.oracleManipulation).toBe(true);
    });

    it("should cap final score at 1.0", () => {
      const gnnScore = createGnnScore({ threatScore: 1.0 });
      const simulation = createSimulationResult({ tvlDeltaPct: 15.0 });
      const heuristicFlags = ["flag1", "flag2", "flag3", "flag4", "flag5"];

      const result = assessThreat(
        gnnScore,
        simulation,
        heuristicFlags,
        0.75,
        5.0,
        2,
      );

      expect(result.score).toBeLessThanOrEqual(1.0);
    });
  });

  describe("ThreatScorer class", () => {
    let scorer: ThreatScorer;
    let mockGnnClient: GnnClient;

    beforeEach(() => {
      mockGnnClient = new GnnClient();
      scorer = new ThreatScorer(mockGnnClient);
    });

    it("should delegate getMode to GnnClient", async () => {
      vi.spyOn(mockGnnClient, "getMode").mockResolvedValue("trained");

      const mode = await scorer.getMode();

      expect(mode).toBe("trained");
      expect(mockGnnClient.getMode).toHaveBeenCalled();
    });

    it("should delegate isTrainedModelLoaded to GnnClient", async () => {
      vi.spyOn(mockGnnClient, "isTrainedModelLoaded").mockResolvedValue(true);

      const isLoaded = await scorer.isTrainedModelLoaded();

      expect(isLoaded).toBe(true);
      expect(mockGnnClient.isTrainedModelLoaded).toHaveBeenCalled();
    });

    it("should score bytecode with mode information", async () => {
      vi.spyOn(mockGnnClient, "scoreBytecode").mockResolvedValue({
        threatScore: 0.85,
        vulnType: "reentrancy",
        latencyMs: 45,
        mode: "trained",
      });
      vi.spyOn(mockGnnClient, "getMode").mockResolvedValue("trained");

      const result = await scorer.scoreBytecode("0x1234", "0xabcd");

      expect(result.threatScore).toBe(0.85);
      expect(result.vulnType).toBe("reentrancy");
      expect(result.mode).toBe("trained");
      expect(result.latencyMs).toBe(45);
    });

    it("should return heuristic_fallback mode on scoring error", async () => {
      vi.spyOn(mockGnnClient, "scoreBytecode").mockRejectedValue(
        new Error("Network error")
      );

      const result = await scorer.scoreBytecode("0x1234", "0xabcd");

      expect(result.threatScore).toBe(0);
      expect(result.vulnType).toBe("unknown");
      expect(result.mode).toBe("heuristic_fallback");
    });

    it("should return heuristic_fallback mode when getMode fails", async () => {
      vi.spyOn(mockGnnClient, "scoreBytecode").mockResolvedValue({
        threatScore: 0.85,
        vulnType: "reentrancy",
        latencyMs: 45,
        mode: "trained", // This should be overridden
      });
      vi.spyOn(mockGnnClient, "getMode").mockRejectedValue(new Error("Health check failed"));

      const result = await scorer.scoreBytecode("0x1234", "0xabcd");

      // Should still return a result with heuristic_fallback mode
      expect(result.mode).toBe("heuristic_fallback");
    });
  });

  describe("confidence calculation", () => {
    const createSimulationResult = (overrides?: Partial<SimulationResult>): SimulationResult => ({
      tvlDeltaPct: 5.0,
      reverted: false,
      flashLoanDetected: false,
      crossContractReentrant: false,
      oraclePriceDelta: 0,
      ...overrides,
    });

    it("should give higher baseline confidence for trained mode", () => {
      const trainedResult = assessThreat(
        { threatScore: 0.8, vulnType: "reentrancy", latencyMs: 50, mode: "trained" },
        createSimulationResult(),
        ["flag1", "flag2"],
        0.75,
        5.0,
        2,
      );

      const heuristicResult = assessThreat(
        { threatScore: 0.8, vulnType: "reentrancy", latencyMs: 50, mode: "heuristic_fallback" },
        createSimulationResult(),
        ["flag1", "flag2"],
        0.75,
        5.0,
        2,
      );

      expect(trainedResult.confidence).toBeGreaterThan(heuristicResult.confidence);
    });

    it("should increase confidence with additional signals", () => {
      const weakSignals = assessThreat(
        { threatScore: 0.76, vulnType: "reentrancy", latencyMs: 50, mode: "trained" },
        createSimulationResult({ tvlDeltaPct: 5.1 }),
        ["flag1"],
        0.75,
        5.0,
        2,
      );

      const strongSignals = assessThreat(
        { threatScore: 0.9, vulnType: "reentrancy", latencyMs: 50, mode: "trained" },
        createSimulationResult({
          tvlDeltaPct: 8.0,
          flashLoanDetected: true,
          crossContractReentrant: true,
        }),
        ["flag1", "flag2", "flag3"],
        0.75,
        5.0,
        2,
      );

      // Strong signals should have equal or higher confidence (may cap at 1.0)
      expect(strongSignals.confidence).toBeGreaterThanOrEqual(weakSignals.confidence);
    });

    it("should cap confidence at 1.0", () => {
      const result = assessThreat(
        { threatScore: 1.0, vulnType: "reentrancy", latencyMs: 50, mode: "trained" },
        createSimulationResult({
          tvlDeltaPct: 15.0,
          flashLoanDetected: true,
          crossContractReentrant: true,
        }),
        ["flag1", "flag2", "flag3", "flag4", "flag5"],
        0.75,
        5.0,
        2,
      );

      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });
});
