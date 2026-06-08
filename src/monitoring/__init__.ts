/**
 * Monitoring Module — Comprehensive observability for SmartSentinel.
 * Provides Prometheus metrics, health checks, and performance monitoring.
 */

export { PrometheusMetrics, prometheusMetrics } from "./prometheus-metrics.js";
export type { Metric, HistogramMetric } from "./prometheus-metrics.js";

export { HealthChecker } from "./health-check.js";
export type { ComponentHealth, HealthStatus } from "./health-check.js";