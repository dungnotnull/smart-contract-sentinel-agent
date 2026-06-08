/**
 * TelegramAlert â€” Send alerts via Telegram Bot API.
 * Supports CRITICAL (urgent) and WARNING (info) severity levels.
 */

import { logger } from "../utils/logger.js";
import type { ForensicReport } from "./forensic-reporter.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

export class TelegramAlert {
  private botToken: string;

  constructor(botToken?: string) {
    this.botToken = botToken ?? TELEGRAM_BOT_TOKEN;
  }

  /** Send CRITICAL alert (with sound) */
  async sendCritical(report: ForensicReport): Promise<void> {
    if (!this.botToken) {
      logger.warn("Telegram bot token not configured â€” skipping CRITICAL alert");
      return;
    }

    const message = this.formatCriticalMessage(report);
    await this.sendToAllChats(message, report.contract.notify?.telegramChatId);
  }

  /** Send WARNING alert */
  async sendWarning(report: ForensicReport): Promise<void> {
    if (!this.botToken) {
      logger.warn("Telegram bot token not configured â€” skipping WARNING alert");
      return;
    }

    const message = this.formatWarningMessage(report);
    await this.sendToAllChats(message, report.contract.notify?.telegramChatId);
  }

  private async sendToAllChats(message: string, chatId?: string): Promise<void> {
    if (!chatId) {
      logger.warn("No Telegram chat ID configured â€” skipping alert");
      return;
    }

    try {
      const url = `${TELEGRAM_API_BASE}${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown",
          disable_notification: false,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ statusCode: response.status, error }, "Telegram API error");
      } else {
        logger.info({ chatId }, "Telegram alert sent successfully");
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to send Telegram alert");
    }
  }

  private formatCriticalMessage(report: ForensicReport): string {
    return `đŸ¨ *CRITICAL â€” AUTO-PAUSE TRIGGERED*

*Incident:* ${report.incidentId}
*Contract:* ${report.contract.name}
*Chain:* ${report.chain}
*TX Hash:* \`${report.txHash}\`
*GNN Score:* ${report.gnnScore.toFixed(2)}
*Drain:* ${report.drainPct.toFixed(1)}%
*Flags:* ${report.heuristicFlags.join(", ")}

_Pipeline latency: ${report.pipelineLatencyMs.toFixed(0)}ms_`;
  }

  private formatWarningMessage(report: ForensicReport): string {
    return `â ï¸ *WARNING â€” Partial Signals*

*Incident:* ${report.incidentId}
*Contract:* ${report.contract.name}
*Chain:* ${report.chain}
*TX Hash:* \`${report.txHash}\`
*GNN Score:* ${report.gnnScore.toFixed(2)}
*Drain:* ${report.drainPct.toFixed(1)}%
*Flags:* ${report.heuristicFlags.join(", ")}

_Pipeline latency: ${report.pipelineLatencyMs.toFixed(0)}ms_`;
  }
}