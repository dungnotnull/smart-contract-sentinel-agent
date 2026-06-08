/**
 * AlertDispatcher — Routes alerts by severity to appropriate channels.
 * CRITICAL → PagerDuty + Telegram
 * WARNING → Telegram + Slack
 * INFO → Log only
 */

import { logger } from "../utils/logger.js";
import { DecisionAction } from "../core/decision-engine.js";
import type { MonitoredContract } from "../core/config-loader.js";
import type { SimulationResult } from "../simulation/tx-simulator.js";
import type { DrainResult } from "../simulation/drain-calculator.js";
import type { GnnScore } from "../ml/gnn-client.js";
import type { PreFilterResult } from "../filters/pre-filter.js";
import { TelegramAlert } from "./telegram.js";
import { PagerDutyAlert } from "./pagerduty.js";
import { SlackAlert } from "./slack.js";
import { ForensicReporter } from "./forensic-reporter.js";
import type { DecisionResult } from "../core/decision-engine.js";
import type { RawTransaction } from "../listeners/base.js";

export interface AlertContext {
  tx: RawTransaction;
  simulation: SimulationResult;
  drain: DrainResult;
  gnnScore: GnnScore;
  filterResult: PreFilterResult;
  contract: MonitoredContract;
  pipelineLatencyMs: number;
}

export class AlertDispatcher {
  private telegram: TelegramAlert;
  private pagerduty: PagerDutyAlert;
  private slack: SlackAlert;
  private forensicReporter: ForensicReporter;
  private autoPauseEnabled: boolean;

  constructor(config: { gnn: { threatThreshold: number }; simulation: { drainThresholdPct: number }; preFilter: { gasAnomalyMultiplier: number }; response: { gasPremiumPct: number } }) {
    this.telegram = new TelegramAlert();
    this.pagerduty = new PagerDutyAlert();
    this.slack = new SlackAlert();
    this.forensicReporter = new ForensicReporter();
    this.autoPauseEnabled = process.env.AUTO_PAUSE_ENABLED === "true";
  }

  async dispatch(decision: DecisionResult, context: AlertContext): Promise<void> {
    const report = this.forensicReporter.generateReport(decision, context);

    switch (decision.action) {
      case DecisionAction.PAUSE:
        logger.error(
          { incidentId: decision.incidentId, contract: context.contract.name, txHash: context.tx.hash },
          "CRITICAL — Auto-pause triggered",
        );
        await Promise.all([
          this.pagerduty.sendCritical(report),
          this.telegram.sendCritical(report),
        ]);
        break;

      case DecisionAction.ALERT_ONLY:
        logger.warn(
          { incidentId: decision.incidentId, contract: context.contract.name, txHash: context.tx.hash },
          "WARNING — Partial signals detected",
        );
        await Promise.all([
          this.telegram.sendWarning(report),
          this.slack.sendWarning(report),
        ]);
        break;

      case DecisionAction.IGNORE:
        logger.debug({ txHash: context.tx.hash }, "Transaction ignored");
        break;
    }
  }
}