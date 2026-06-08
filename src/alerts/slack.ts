/**
 * SlackAlert — Send alerts via Slack Webhook.
 */

import { logger } from "../utils/logger.js";
import type { ForensicReport } from "./forensic-reporter.js";

export class SlackAlert {
  private webhookUrl: string;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl ?? process.env.SLACK_WEBHOOK_URL ?? "";
  }

  /** Send WARNING alert to Slack */
  async sendWarning(report: ForensicReport): Promise<void> {
    if (!this.webhookUrl) {
      logger.debug("Slack webhook URL not configured — skipping alert");
      return;
    }

    const message = {
      text: `⚠️ *SmartSentinel WARNING*`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Contract:* ${report.contract.name}\n*Chain:* ${report.chain}\n*TX:* \`${report.txHash}\`\n*GNN Score:* ${report.gnnScore.toFixed(2)}\n*Drain:* ${report.drainPct.toFixed(1)}%\n*Flags:* ${report.heuristicFlags.join(", ")}`,
          },
        },
      ],
    };

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.error({ statusCode: response.status }, "Slack webhook error");
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to send Slack alert");
    }
  }
}