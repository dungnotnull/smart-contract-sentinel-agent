/**
 * Prometheus Metrics Exporter — Expose metrics for Prometheus scraping.
 * Provides comprehensive observability for SmartSentinel operations.
 *
 * Metric categories:
 * - Chain listeners: connectivity, transaction rate, errors
 * - Detection: threat scores, simulation results, decisions
 * - Response: bundle submissions, inclusions, failures
 * - Performance: latency percentiles, resource usage
 * - Health: component status, error rates
 */

import { logger } from "../utils/logger.js";
import { performance } from "perf_hooks";

export type MetricType = "counter" | "gauge" | "histogram" | "summary";

export interface Metric {
  name: string;
  type: MetricType;
  help: string;
  value: number;
  labels?: Record<string, string>;
}

export interface HistogramMetric extends Metric {
  type: "histogram";
  buckets: number[];
  sum: number;
  count: number;
}

export class PrometheusMetrics {
  private metrics = new Map<string, Metric>();
  private metricHelp = new Map<string, string>();

  constructor() {
    this.initializeDefaultMetrics();
  }

  /**
   * Initialize default metrics.
   */
  private initializeDefaultMetrics(): void {
    // Counter metrics
    this.registerMetric("transactions_processed_total", "counter", "Total transactions processed");
    this.registerMetric("threats_detected_total", "counter", "Total threats detected");
    this.registerMetric("alerts_dispatched_total", "counter", "Total alerts dispatched");
    this.registerMetric("bundles_submitted_total", "counter", "Total bundles submitted");
    this.registerMetric("bundles_included_total", "counter", "Total bundles included");
    this.registerMetric("simulation_errors_total", "counter", "Total simulation errors");
    this.registerMetric("rpc_failures_total", "counter", "Total RPC failures");

    // Gauge metrics
    this.registerMetric("connected_listeners", "gauge", "Number of connected chain listeners");
    this.registerMetric("active_simulations", "gauge", "Number of active simulations");
    this.registerMetric("gnn_server_up", "gauge", "GNN server availability (1=up, 0=down)");
    this.registerMetric("auto_pause_enabled", "gauge", "Auto-pause enabled (1=true, 0=false)");
    this.registerMetric("monitoring_contracts_count", "gauge", "Number of monitored contracts");

    // Histogram metrics (latency tracking)
    this.registerHistogram("detection_latency_seconds", "Detection latency in seconds", [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]);
    this.registerHistogram("simulation_latency_seconds", "Simulation latency in seconds", [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]);
    this.registerHistogram("gnn_scoring_latency_seconds", "GNN scoring latency in seconds", [0.001, 0.005, 0.01, 0.05, 0.1, 0.2, 0.5]);
    this.registerHistogram("bundle_submission_latency_seconds", "Bundle submission latency in seconds", [0.1, 0.5, 1, 2, 5, 10, 30]);

    // Summary metrics
    this.registerSummary("transaction_value_transferred", "Total value of transactions processed (in wei)");
  }

  /**
   * Register a metric.
   */
  registerMetric(name: string, type: MetricType, help: string, buckets?: number[]): void {
    this.metrics.set(name, {
      name,
      type,
      help,
      value: 0,
      labels: {},
    });
    this.metricHelp.set(name, help);

    if (type === "histogram" && buckets) {
      this.metrics.set(name, {
        ...this.metrics.get(name)!,
        type: "histogram",
        buckets,
        sum: 0,
        count: 0,
      });
    }
  }

  /**
   * Register a histogram metric.
   */
  registerHistogram(name: string, help: string, buckets: number[]): void {
    this.registerMetric(name, "histogram", help, buckets);
  }

  /**
   * Register a summary metric.
   */
  registerSummary(name: string, help: string): void {
    // Summary metrics use the same structure as histograms for simplicity
    this.registerHistogram(name, help, [0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000]);
  }

  /**
   * Increment a counter metric.
   */
  incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== "counter") {
      logger.warn({ metricName: name }, "Attempted to increment non-counter metric");
      return;
    }

    metric.value += value;
    if (labels) {
      metric.labels = { ...metric.labels, ...labels };
    }
  }

  /**
   * Set a gauge metric value.
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== "gauge") {
      logger.warn({ metricName: name }, "Attempted to set non-gauge metric");
      return;
    }

    metric.value = value;
    if (labels) {
      metric.labels = { ...metric.labels, ...labels };
    }
  }

  /**
   * Observe a histogram/summary metric.
   */
  observe(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric || (metric.type !== "histogram" && metric.type !== "summary")) {
      logger.warn({ metricName: name }, "Attempted to observe non-histogram metric");
      return;
    }

    const histogram = metric as HistogramMetric;

    // Find appropriate bucket
    let bucketIndex = histogram.buckets.findIndex((b) => value <= b);
    if (bucketIndex === -1) {
      bucketIndex = histogram.buckets.length; // +Inf bucket
    }

    // Increment bucket count (simplified - real implementation uses full histogram)
    histogram.count++;
    histogram.sum += value;

    if (labels) {
      histogram.labels = { ...histogram.labels, ...labels };
    }
  }

  /**
   * Time a function execution and record as histogram metric.
   */
  async timeOperation<T>(
    metricName: string,
    operation: () => T,
    labels?: Record<string, string>,
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await operation();
      const duration = (performance.now() - start) / 1000;
      this.observe(metricName, duration, labels);
      return result;
    } catch (error) {
      const duration = (performance.now() - start) / 1000;
      this.observe(metricName, duration, labels);
      throw error;
    }
  }

  /**
   * Record a transaction processed.
   */
  recordTransaction(chain: string, success: boolean): void {
    this.incrementCounter("transactions_processed_total", { chain });
    if (!success) {
      this.incrementCounter("simulation_errors_total", { chain });
    }
  }

  /**
   * Record a threat detected.
   */
  recordThreatDetected(vulnType: string, score: number): void {
    this.incrementCounter("threats_detected_total", { vulnType });

    // Also record as histogram
    this.observe("threat_score_distribution", score, { vulnType });
  }

  /**
   * Record an alert dispatched.
   */
  recordAlertDispatched(
    alertType: "telegram" | "pagerduty" | "slack",
    severity: "info" | "warning" | "critical",
  ): void {
    this.incrementCounter("alerts_dispatched_total", { alertType, severity });
  }

  /**
   * Record bundle submission.
   */
  recordBundleSubmission(chain: string, included: boolean): void {
    this.incrementCounter("bundles_submitted_total", { chain });
    if (included) {
      this.incrementCounter("bundles_included_total", { chain });
    }
  }

  /**
   * Record RPC failure.
   */
  recordRpcFailure(chain: string, endpoint: string): void {
    this.incrementCounter("rpc_failures_total", { chain, endpoint });
  }

  /**
   * Update connected listeners gauge.
   */
  updateConnectedListeners(count: number): void {
    this.setGauge("connected_listeners", count);
  }

  /**
   * Update active simulations gauge.
   */
  updateActiveSimulations(count: number): void {
    this.setGauge("active_simulations", count);
  }

  /**
   * Update GNN server status.
   */
  updateGnnServerStatus(up: boolean): void {
    this.setGauge("gnn_server_up", up ? 1 : 0);
  }

  /**
   * Update auto-pause enabled status.
   */
  updateAutoPauseStatus(enabled: boolean): void {
    this.setGauge("auto_pause_enabled", enabled ? 1 : 0);
  }

  /**
   * Update monitored contracts count.
   */
  updateMonitoredContractsCount(count: number): void {
    this.setGauge("monitoring_contracts_count", count);
  }

  /**
   * Export metrics in Prometheus exposition format.
   */
  exportMetrics(): string {
    const lines: string[] = [];

    // Export HELP lines
    for (const [name, help] of this.metricHelp.entries()) {
      lines.push(`# HELP ${name}`);
      lines.push(`# ${help}`);
    }

    // Export TYPE lines
    for (const [name, metric] of this.metrics.entries()) {
      lines.push(`# TYPE ${name} ${metric.type}`);
    }

    // Export metric values
    for (const [name, metric] of this.metrics.entries()) {
      if (metric.type === "counter" || metric.type === "gauge") {
        let line = `${name}`;

        // Add labels if present
        if (metric.labels && Object.keys(metric.labels).length > 0) {
          const labels = Object.entries(metric.labels)
            .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
            .join(",");
          line += `{${labels}}`;
        }

        line += ` ${metric.value}`;
        lines.push(line);
      } else if (metric.type === "histogram" || metric.type === "summary") {
        const histogram = metric as HistogramMetric;

        // Export buckets
        for (let i = 0; i < histogram.buckets.length; i++) {
          const bucket = histogram.buckets[i];
          lines.push(`${name}_bucket{le}"+${bucket}" ${0}`);
        }

        // Export +Inf bucket
        lines.push(`${name}_bucket{le}"+Inf"} ${0}`);

        // Export sum and count
        lines.push(`${name}_sum ${histogram.sum.toFixed(2)}`);
        lines.push(`${name}_count ${histogram.count}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get all metrics as object (for JSON API).
   */
  getMetrics(): Record<string, Metric> {
    const result: Record<string, Metric> = {};

    for (const [name, metric] of this.metrics.entries()) {
      result[name] = { ...metric };
    }

    return result;
  }

  /**
   * Reset all metrics to zero (for testing).
   */
  resetMetrics(): void {
    for (const metric of this.metrics.values()) {
      if (metric.type === "counter" || metric.type === "gauge") {
        metric.value = 0;
      } else if (metric.type === "histogram" || metric.type === "summary") {
        const histogram = metric as HistogramMetric;
        histogram.sum = 0;
        histogram.count = 0;
      }
    }

    logger.debug("All metrics reset");
  }
}

// Global metrics instance
export const prometheusMetrics = new PrometheusMetrics();
