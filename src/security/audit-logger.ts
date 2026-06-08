/**
 * Audit Logger — Comprehensive security audit logging.
 * Logs all security-relevant events with full context for forensics.
 * Writes to append-only log file and structured JSON.
 *
 * Log categories:
 * - Key access and usage
 * - Authentication attempts
 * - Authorization decisions
 * - Guardian key operations
 * - Critical configuration changes
 * - Alert dispatches
 * - Flashbots bundle submissions
 */

import { createWriteStream, existsSync, appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { performance } from "perf_hooks";
import { logger } from "../utils/logger.js";

export type AuditCategory =
  | "key_access"
  | "key_usage"
  | "authentication"
  | "authorization"
  | "configuration"
  | "alert_dispatch"
  | "bundle_submission"
  | "simulation"
  | "detection";

export interface AuditEvent {
  timestamp: string;
  category: AuditCategory;
  level: "info" | "warn" | "error" | "critical";
  event: string;
  details: Record<string, unknown>;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  durationMs?: number;
  outcome: "success" | "failure";
}

export class AuditLogger {
  private logDir: string;
  private jsonLogFile: string;
  private writeStream: NodeJS.WritableStream | null = null;

  constructor(logDir: string = "./data/audit") {
    this.logDir = logDir;
    this.jsonLogFile = join(logDir, "audit.log");
    this.initializeLogDirectory();
    this.initializeWriteStream();
  }

  /**
   * Initialize audit log directory.
   */
  private initializeLogDirectory(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { mode: 0o700, recursive: true });
      logger.info({ logDir: this.logDir }, "Created audit log directory");
    }
  }

  /**
   * Initialize write stream for append-only logging.
   */
  private initializeWriteStream(): void {
    this.writeStream = createWriteStream(this.jsonLogFile, {
      flags: "a", // Append-only
      mode: 0o600, // Only owner can read/write
    });

    this.writeStream.on("error", (error) => {
      logger.error({ err: error }, "Audit log write stream error");
    });
  }

  /**
   * Log an audit event.
   */
  log(event: AuditEvent): void {
    const timestamp = new Date().toISOString();
    const logEntry = { ...event, timestamp };

    try {
      // Write to JSON log file (append-only)
      const logLine = JSON.stringify(logEntry) + "\n";
      this.writeStream?.write(logLine);

      // Also log to structured logger for immediate visibility
      logger.audit(logEntry);
    } catch (error) {
      logger.error({ err: error, event }, "Failed to write audit log");
    }
  }

  /**
   * Log key access event.
   */
  logKeyAccess(keyId: string, success: boolean, details: Record<string, unknown> = {}): void {
    this.log({
      timestamp: new Date().toISOString(),
      category: "key_access",
      level: success ? "info" : "warn",
      event: "guardian_key_access",
      details: { keyId, ...details },
      outcome: success ? "success" : "failure",
    });
  }

  /**
   * Log key usage (for signing or bundle submission).
   */
  logKeyUsage(
    keyId: string,
    operation: string,
    success: boolean,
    details: Record<string, unknown> = {},
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      category: "key_usage",
      level: "info",
      event: "guardian_key_used",
      details: { keyId, operation, ...details },
      outcome: success ? "success" : "failure",
    });
  }

  /**
   * Log authentication attempt.
   */
  logAuthentication(
    userId: string,
    success: boolean,
    details: Record<string, unknown> = {},
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      category: "authentication",
      level: success ? "info" : "warn",
      event: "authentication_attempt",
      details: { userId, ...details },
      userId,
      outcome: success ? "success" : "failure",
    });
  }

  /**
   * Log authorization decision.
   */
  logAuthorization(
    userId: string,
    resource: string,
    action: string,
    allowed: boolean,
    details: Record<string, unknown> = {},
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      category: "authorization",
      level: allowed ? "info" : "warn",
      event: "authorization_decision",
      details: { userId, resource, action, ...details },
      userId,
      outcome: allowed ? "success" : "failure",
    });
  }

  /**
   * Log configuration change.
   */
  logConfigurationChange(
    configItem: string,
    oldValue: unknown,
    newValue: unknown,
    userId: string,
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      category: "configuration",
      level: "info",
      event: "configuration_changed",
      details: { configItem, oldValue, newValue },
      userId,
      outcome: "success",
    });
  }

  /**
   * Log alert dispatch.
   */
  logAlertDispatch(
    alertType: "telegram" | "pagerduty" | "slack",
    contract: string,
    severity: "info" | "warning" | "critical",
    success: boolean,
    details: Record<string, unknown> = {},
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      category: "alert_dispatch",
      level: severity === "critical" ? "critical" : "info",
      event: "alert_dispatched",
      details: { alertType, contract, severity, ...details },
      outcome: success ? "success" : "failure",
    });
  }

  /**
   * Log Flashbots bundle submission.
   */
  logBundleSubmission(
    contract: string,
    bundleId: string,
    included: boolean,
    details: Record<string, unknown> = {},
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      category: "bundle_submission",
      level: included ? "info" : "warn",
      event: "flashbots_bundle_submitted",
      details: { contract, bundleId, ...details },
      outcome: included ? "success" : "failure",
    });
  }

  /**
   * Log simulation event.
   */
  logSimulation(
    txHash: string,
    contract: string,
    drainPct: number,
    reverted: boolean,
    durationMs: number,
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      category: "simulation",
      level: reverted ? "warn" : "info",
      event: "transaction_simulated",
      details: { txHash, contract, drainPct, reverted },
      durationMs,
      outcome: reverted ? "failure" : "success",
    });
  }

  /**
   * Log threat detection event.
   */
  logDetection(
    txHash: string,
    threatScore: number,
    vulnType: string,
    action: "alert" | "pause" | "none",
    details: Record<string, unknown> = {},
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      category: "detection",
      level: action === "pause" ? "critical" : "info",
      event: "threat_detected",
      details: { txHash, threatScore, vulnType, action, ...details },
      outcome: action === "none" ? "failure" : "success",
    });
  }

  /**
   * Query audit logs by category.
   * Returns array of matching log entries.
   */
  queryAuditLogs(
    category: AuditCategory,
    startTime?: Date,
    endTime?: Date,
  ): AuditEvent[] {
    try {
      const content = require("fs").readFileSync(this.jsonLogFile, "utf8");
      const lines = content.split("\n").filter((line) => line.trim());

      const logs: AuditEvent[] = [];

      for (const line of lines) {
        try {
          const log = JSON.parse(line) as AuditEvent;

          // Filter by category
          if (log.category !== category) continue;

          // Filter by time range
          const logTime = new Date(log.timestamp);
          if (startTime && logTime < startTime) continue;
          if (endTime && logTime > endTime) continue;

          logs.push(log);
        } catch {
          // Skip malformed lines
          continue;
        }
      }

      return logs;
    } catch (error) {
      logger.error({ err: error }, "Failed to query audit logs");
      return [];
    }
  }

  /**
   * Get audit log statistics.
   */
  getStatistics(): {
    try {
      const content = require("fs").readFileSync(this.jsonLogFile, "utf8");
      const lines = content.split("\n").filter((line) => line.trim());

      const stats = {
        totalEvents: lines.length,
        byCategory: {} as Record<string, number>,
        byLevel: {} as Record<string, number>,
      };

      for (const line of lines) {
        try {
          const log = JSON.parse(line) as AuditEvent;

          stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
          stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
        } catch {
          continue;
        }
      }

      return stats;
    } catch {
      return { totalEvents: 0, byCategory: {}, byLevel: {} };
    }
  }

  /**
   * Close audit logger and flush buffers.
   */
  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      logger.info("Audit logger closed");
    }
  }
}
