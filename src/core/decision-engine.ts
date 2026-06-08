/**
 * DecisionEngine — Multi-signal threat decision using AND logic.
 * PAUSE if ALL of: gnn_score > threshold AND drain_pct > threshold AND heuristic_flags >= min
 * ALERT-ONLY if ANY signal but not all three.
 * IGNORE if none.
 */

import type { ThreatAssessment } from "../ml/threat-scorer.js";
import type { DrainResult } from "../simulation/drain-calculator.js";
import type { PreFilterResult } from "../filters/pre-filter.js";
import type { SimulationResult } from "../simulation/tx-simulator.js";
import { logger } from "../utils/logger.js";
import { randomBytes } from "node:crypto";

export enum DecisionAction {
  PAUSE = "PAUSE",
  ALERT_ONLY = "ALERT_ONLY",
  IGNORE = "IGNORE",
}

export interface DecisionInput {
  gnnScore: number;
  drainPct: number;
  oracleDeltaPct: number;
  heuristicFlags: string[];
  thresholds: {
    gnn: number;
    drain: number;
  };
  simulation: SimulationResult;
  txHash: string;
  contractName: string;
}

export interface DecisionResult {
  action: DecisionAction;
  reason: string;
  incidentId: string;
  allSignalsPresent: boolean;
  signals: {
    gnnPassed: boolean;
    drainPassed: boolean;
    heuristicPassed: boolean;
  };
}

/** Generate a unique incident ID */
export function generateIncidentId(): string {
  const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `INC-${now}-${rand}`;
}

/** Make a decision based on all signals — AND-gate logic per CLAUDE.md §3 */
export function decide(input: DecisionInput): DecisionResult {
  const incidentId = generateIncidentId();

  const gnnPassed = input.gnnScore >= input.thresholds.gnn;
  const drainPassed = input.drainPct > input.thresholds.drain || input.oracleDeltaPct > 50;
  const heuristicPassed = input.heuristicFlags.length >= 1;

  const allPassed = gnnPassed && drainPassed && heuristicPassed;
  const anyPassed = gnnPassed || drainPassed || heuristicPassed;

  if (allPassed) {
    logger.warn(
      {
        incidentId,
        action: DecisionAction.PAUSE,
        gnnScore: input.gnnScore.toFixed(2),
        drainPct: input.drainPct.toFixed(1),
        heuristicFlags: input.heuristicFlags,
        contractName: input.contractName,
        txHash: input.txHash,
      },
      "ALL signals positive — PAUSE triggered",
    );

    return {
      action: DecisionAction.PAUSE,
      reason: `All signals positive: GNN=${input.gnnScore.toFixed(2)} drain=${input.drainPct.toFixed(1)}% flags=${input.heuristicFlags.join(",")}`,
      incidentId,
      allSignalsPresent: true,
      signals: { gnnPassed, drainPassed, heuristicPassed },
    };
  }

  if (anyPassed) {
    logger.warn(
      {
        incidentId,
        action: DecisionAction.ALERT_ONLY,
        gnnScore: input.gnnScore.toFixed(2),
        drainPct: input.drainPct.toFixed(1),
        heuristicFlags: input.heuristicFlags,
        contractName: input.contractName,
        txHash: input.txHash,
      },
      "Partial signals — ALERT_ONLY",
    );

    return {
      action: DecisionAction.ALERT_ONLY,
      reason: `Partial signals: GNN=${input.gnnScore.toFixed(2)} drain=${input.drainPct.toFixed(1)}% flags=${input.heuristicFlags.join(",")}`,
      incidentId,
      allSignalsPresent: false,
      signals: { gnnPassed, drainPassed, heuristicPassed },
    };
  }

  return {
    action: DecisionAction.IGNORE,
    reason: "No signals triggered",
    incidentId,
    allSignalsPresent: false,
    signals: { gnnPassed, drainPassed, heuristicPassed },
  };
}