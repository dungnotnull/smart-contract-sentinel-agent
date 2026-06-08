/**
 * DrainCalculator — Compute % TVL drain from simulation state changes.
 * Tracks ERC20 + ETH balances of monitored contract before/after simulation.
 */

import { logger } from "../utils/logger.js";
import type { MonitoredContract } from "../core/config-loader.js";
import type { SimulationResult, TokenFlow } from "./tx-simulator.js";

export interface DrainResult {
  /** % of TVL drained */
  drainPct: number;
  /** Whether drain exceeds the contract's threshold */
  exceedsThreshold: boolean;
  /** Total ETH value drained */
  totalEthDrained: string;
  /** Individual token flows */
  tokenFlows: TokenFlow[];
  /** Oracle price manipulation detected */
  oracleManipulationDetected: boolean;
  /** Oracle price delta % */
  oraclePriceDelta: number;
}

const ORACLE_DELTA_THRESHOLD_PCT = 50; // 50% price swing in single tx = suspicious

/** Calculate drain from simulation result */
export function computeDrain(
  simulation: SimulationResult,
  contract: MonitoredContract,
): DrainResult {
  const drainPct = simulation.tvlDeltaPct;
  const exceedsThreshold = drainPct > contract.drainThresholdPct;

  // Oracle manipulation detection
  const oracleManipulationDetected = simulation.oraclePriceDelta > ORACLE_DELTA_THRESHOLD_PCT;

  // Compute total ETH value of all token flows
  let totalEthDrained = 0n;
  for (const flow of simulation.tokenFlows) {
    // ETH flows directly
    if (flow.token === "0x0000000000000000000000000000000000000000" || flow.token === "") {
      totalEthDrained += BigInt(flow.amount || "0");
    }
  }

  if (exceedsThreshold || oracleManipulationDetected) {
    logger.warn(
      {
        contract: contract.name,
        drainPct: drainPct.toFixed(2),
        threshold: contract.drainThresholdPct,
        oracleDelta: simulation.oraclePriceDelta.toFixed(2),
        flashLoan: simulation.flashLoanDetected,
        reentrancy: simulation.crossContractReentrant,
      },
      "Drain exceeds threshold or oracle manipulation detected",
    );
  }

  return {
    drainPct,
    exceedsThreshold,
    totalEthDrained: totalEthDrained.toString(),
    tokenFlows: simulation.tokenFlows,
    oracleManipulationDetected,
    oraclePriceDelta: simulation.oraclePriceDelta,
  };
}

/** Check if drain exceeds the given threshold */
export function isDrainAboveThreshold(drain: DrainResult, thresholdPct: number): boolean {
  return drain.drainPct > thresholdPct;
}