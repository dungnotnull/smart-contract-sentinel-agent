/**
 * PagerDutyAlert — Send alerts via PagerDuty Events API v2.
 * For on-call escalation in production.
 */

import { logger } from "../utils/logger.js";
import type { ForensicReport } from "./forensic-reporter.js";

const PAGERDUTY_API_URL = "https://events.pagerduty.com/v2/enqueue";

export class PagerDutyAlert {
  private routingKey: string;

  constructor() {
    this.routingKey = process.env.PAGERDUTY_SERVICE_KEY ?? "";
  }

  /** Send CRITICAL alert to PagerDuty */
  async sendCritical(report: ForensicReport): Promise<void> {
    if (!this.routingKey) {
      logger.warn("PagerDuty routing key not configured — skipping critical alert");
      return;
    }

    await this.sendEvent(report, "critical", "trigger");
  }

  /** Send WARNING alert to PagerDuty */
  async sendWarning(report: ForensicReport): Promise<void> {
    // PagerDuty typically only used for CRITICAL; WARNING goes to Telegram/Slack
    logger.debug("PagerDuty WARNING alerts are not sent — use Telegram/Slack instead");
  }

  /** Resolve a PagerDuty incident */
  async resolve(incidentId: string): Promise<void> {
    if (!this.routingKey) return;

    await this.sendRaw({
      routing_key: this.routingKey,
      event_action: "resolve",
      dedup_key: incidentId,
    });
  }

  private async sendEvent(report: ForensicReport, severity: string, action: string): Promise<void> {
    const dedupKey = report.incidentId;

    const payload = {
      routing_key: this.routingKey,
      event_action: action,
      dedup_key: dedupKey,
      payload: {
        summary: `SmartSentinel ${severity.toUpperCase()}: ${report.contract.name} - ${report.action}`,
        severity: severity === "critical" ? "critical" : "warning",
        source: "SmartSentinel",
        component: report.contract.name,
        group: report.chain,
        class: report.heuristicFlags.join(", "),
        custom_details: {
          incident_id: report.incidentId,
          tx_hash: report.txHash,
          contract_address: report.contract.address,
          gnn_score: report.gnnScore.toFixed(2),
          drain_pct: report.drainPct.toFixed(1),
          pipeline_latency_ms: report.pipelineLatencyMs.toFixed(0),
          heuristic_flags: report.heuristicFlags,
        },
      },
    };

    await this.sendRaw(payload);
  }

  private async sendRaw(payload: Record<string, unknown>): Promise<void> {
    try {
      const response = await fetch(PAGERDUTY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ statusCode: response.status, error }, "PagerDuty API error");
      } else {
        logger.info("PagerDuty alert sent successfully");
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to send PagerDuty alert");
    }
  }
}