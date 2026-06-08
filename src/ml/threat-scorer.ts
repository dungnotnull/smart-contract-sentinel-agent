/**
 * ThreatScorer — Normalizes GNN output and combines with simulation data
 * to produce a final threat assessment.
 */

import type { GnnScore } from "./gnn-client.js";
import type { SimulationResult } from "../simulation/tx-simulator.js";
import { GnnClient } from "./gnn-client.js";
import { logger } from "../utils/logger.js";

export interface ThreatAssessment {
  /** Final threat score 0.0–1.0 */
  score: number;
  /** Predicted vulnerability type */
  vulnType: string;
  /** Whether this assessment should trigger action */
  actionable: boolean;
  /** Confidence level (0.0–1.0) based on mode and signal strength */
  confidence: number;
  /** Mode used for GNN scoring */
  mode: "trained" | "heuristic_fallback";
  /** Breakdown of contributing signals */
  signals: {
    gnnScore: number;
    drainPct: number;
    heuristicFlags: string[];
    simulationReverted: boolean;
    flashLoanDetected: boolean;
    reentrancyDetected: boolean;
    oracleManipulation: boolean;
  };
}

/** Compute final threat assessment from GNN score and simulation result */
export function assessThreat(
  gnnScore: GnnScore,
  simulation: SimulationResult,
  heuristicFlags: string[],
  gnnThreshold: number,
  drainThresholdPct: number,
  minHeuristicFlags: number,
): ThreatAssessment {
  const signals: ThreatAssessment["signals"] = {
    gnnScore: gnnScore.threatScore,
    drainPct: simulation.tvlDeltaPct,
    heuristicFlags,
    simulationReverted: simulation.reverted,
    flashLoanDetected: simulation.flashLoanDetected,
    reentrancyDetected: simulation.crossContractReentrant,
    oracleManipulation: simulation.oraclePriceDelta > 50,
  };

  // Decision logic per CLAUDE.md §3:
  // PAUSE if ALL of: gnn_score > threshold AND drain_pct > threshold AND heuristic_flags >= min
  const gnnPassed = gnnScore.threatScore >= gnnThreshold;
  const drainPassed = simulation.tvlDeltaPct > drainThresholdPct;
  const heuristicPassed = heuristicFlags.length >= minHeuristicFlags;

  // Compute composite score (weighted)
  const compositeScore = Math.min(
    1.0,
    (gnnScore.threatScore * 0.35) +
    (Math.min(simulation.tvlDeltaPct / 10, 1.0) * 0.40) +
    (Math.min(heuristicFlags.length / 5, 1.0) * 0.25),
  );

  // If simulation reverted, the attack likely failed — reduce score
  const finalScore = simulation.reverted
    ? compositeScore * 0.3
    : compositeScore;

  const actionable = gnnPassed && drainPassed && heuristicPassed;

  // Compute confidence based on mode and signal strength
  // Trained mode gets higher baseline confidence
  const mode = gnnScore.mode;
  const baselineConfidence = mode === "trained" ? 0.7 : 0.4;
  const signalStrength = (gnnPassed ? 0.15 : 0) +
                        (drainPassed ? 0.15 : 0) +
                        (heuristicPassed ? 0.15 : 0) +
                        (simulation.flashLoanDetected ? 0.1 : 0) +
                        (simulation.crossContractReentrant ? 0.1 : 0);
  const confidence = Math.min(1.0, baselineConfidence + signalStrength);

  return {
    score: finalScore,
    vulnType: gnnScore.vulnType,
    actionable,
    confidence,
    mode,
    signals,
  };
}

/** ThreatScorer class for mode-aware threat scoring */
export class ThreatScorer {
  private gnnClient: GnnClient;

  constructor(gnnClient?: GnnClient) {
    this.gnnClient = gnnClient ?? new GnnClient();
  }

  /** Get the current GNN mode */
  async getMode(): Promise<"trained" | "heuristic_fallback"> {
    return this.gnnClient.getMode();
  }

  /** Check if the trained model is loaded */
  async isTrainedModelLoaded(): Promise<boolean> {
    return this.gnnClient.isTrainedModelLoaded();
  }

  /** Score bytecode with mode awareness */
  async scoreBytecode(bytecode: string, txHash: string): Promise<GnnScore> {
    const startTime = performance.now();

    try {
      const score = await this.gnnClient.scoreBytecode(bytecode, txHash);
      const mode = await this.gnnClient.getMode();

      logger.debug({
        txHash,
        mode,
        threatScore: score.threatScore,
        latencyMs: score.latencyMs,
      }, "GNN scoring completed");

      return {
        ...score,
        mode,
      };
    } catch (error) {
      const latencyMs = performance.now() - startTime;
      logger.error({ txHash, err: error, latencyMs }, "GNN scoring failed - using heuristic fallback");

      return {
        threatScore: 0,
        vulnType: "unknown",
        latencyMs,
        mode: "heuristic_fallback",
      };
    }
  }
}