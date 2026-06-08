/**
 * ForensicReporter — Generate full incident Markdown reports.
 * Per format specified in PROJECT-DETAIL.md section 8.
 */

import type { MonitoredContract } from "../core/config-loader.js";
import type { SimulationResult } from "../simulation/tx-simulator.js";
import type { DrainResult } from "../simulation/drain-calculator.js";
import type { GnnScore } from "../ml/gnn-client.js";
import type { PreFilterResult } from "../filters/pre-filter.js";
import type { DecisionResult } from "../core/decision-engine.js";

export interface ForensicReport {
  incidentId: string;
  action: string;
  contract: MonitoredContract;
  chain: string;
  txHash: string;
  gnnScore: number;
  drainPct: number;
  oraclePriceDelta: number;
  heuristicFlags: string[];
  reason: string;
  pipelineLatencyMs: number;
  timestamp: string;
  flashLoanDetected: boolean;
  reentrancyDetected: boolean;
  simulationReverted: boolean;
}

export class ForensicReporter {
  generateReport(
    decision: DecisionResult,
    context: {
      tx: { hash: string; from: string; to: string | null; value: string; input: string; gas: string; chain: string };
      simulation: SimulationResult;
      drain: DrainResult;
      gnnScore: GnnScore;
      filterResult: PreFilterResult;
      contract: MonitoredContract;
      pipelineLatencyMs: number;
    },
  ): ForensicReport {
    return {
      incidentId: decision.incidentId,
      action: decision.action,
      contract: context.contract,
      chain: context.tx.chain,
      txHash: context.tx.hash,
      gnnScore: context.gnnScore.threatScore,
      drainPct: context.drain.drainPct,
      oraclePriceDelta: context.simulation.oraclePriceDelta,
      heuristicFlags: context.filterResult.flags,
      reason: decision.reason,
      pipelineLatencyMs: context.pipelineLatencyMs,
      timestamp: new Date().toISOString(),
      flashLoanDetected: context.simulation.flashLoanDetected,
      reentrancyDetected: context.simulation.crossContractReentrant,
      simulationReverted: context.simulation.reverted,
    };
  }

  formatMarkdown(report: ForensicReport): string {
    const tvlBillions = (report.contract.tvlUsd / 1_000_000_000).toFixed(1);
    const severity = report.action === "PAUSE" ? "CRITICAL -- AUTO-PAUSE FIRED" : "WARNING -- ALERT ONLY";

    const lines = [
      "🚨 **SmartSentinel Incident Report**",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
      "**ID:** " + report.incidentId,
      "**Time:** " + report.timestamp,
      "**Chain:** " + report.chain,
      "**Severity:** " + severity,
      "",
      "**TARGET CONTRACT**",
      "  Name:    " + report.contract.name,
      "  Address: `" + report.contract.address + "`",
      "  TVL:     $" + tvlBillions + "B at detection time",
      "",
      "**ATTACK TRANSACTION**",
      "  Hash:    `" + report.txHash + "`",
      "",
      "**SIMULATION RESULT**",
      "  TVL Drain:         " + report.drainPct.toFixed(1) + "%",
      "  Flash Loan:        " + (report.flashLoanDetected ? "YES" : "NO"),
      "  Reentrancy Depth:  " + (report.reentrancyDetected ? "YES" : "NO"),
      "  Oracle Delta:      " + report.oraclePriceDelta.toFixed(1) + "%",
      "",
      "**ML CLASSIFICATION**",
      "  GNN Threat Score:  " + report.gnnScore.toFixed(2) + " / 1.00",
      "",
      "**DECISION**",
      "  Heuristic flags: " + (report.heuristicFlags.length > 0 ? report.heuristicFlags.join(", ") : "none"),
      "  Reason: " + report.reason,
      "",
      "**TIMELINE**",
      "  Pipeline latency: " + report.pipelineLatencyMs.toFixed(0) + "ms",
      "",
      "**NEXT STEPS FOR HUMAN REVIEW**",
      "  1. Verify protocol state on Etherscan",
      "  2. Decide whether to unpause",
      "  3. Add attacker address to known-attacker registry",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ];

    return lines.join("\n");
  }
}