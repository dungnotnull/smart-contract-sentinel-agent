/**
 * GNN Client — TypeScript HTTP client for the Python GNN inference server.
 * Sends bytecode to the inference server for threat scoring.
 * Timeout: 200ms (production budget).
 */

import { logger } from "../utils/logger.js";

export interface GnnScore {
  threatScore: number;
  vulnType: string;
  latencyMs: number;
  /** Mode used to generate this score */
  mode: "trained" | "heuristic_fallback";
}

export interface GnnHealthStatus {
  /** Overall health status */
  status: "healthy" | "degraded" | "down";
  /** Whether the trained model is loaded in memory */
  modelLoaded: boolean;
  /** Current mode: trained if model loaded, heuristic_fallback otherwise */
  mode: "trained" | "heuristic_fallback";
  /** Version string of the loaded model (if available) */
  modelVersion?: string;
}

const DEFAULT_GNN_SERVER_URL = "http://localhost:8765";
const DEFAULT_TIMEOUT_MS = 200;
const HEALTH_CACHE_TTL_MS = 5000; // Cache health status for 5 seconds

export class GnnClient {
  private serverUrl: string;
  private timeoutMs: number;
  private cachedHealthStatus: GnnHealthStatus | null = null;
  private healthCacheExpiry: number = 0;

  constructor(serverUrl?: string, timeoutMs?: number) {
    this.serverUrl = serverUrl ?? process.env.GNN_SERVER_URL ?? DEFAULT_GNN_SERVER_URL;
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Score bytecode for vulnerability threat */
  async scoreBytecode(bytecode: string, txHash: string): Promise<GnnScore> {
    const startTime = performance.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(`${this.serverUrl}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          bytecode,
          tx_hash: txHash,
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 503) {
          logger.warn("GNN server not ready (model not loaded)");
          return {
            threatScore: 0,
            vulnType: "unknown",
            latencyMs: performance.now() - startTime,
            mode: "heuristic_fallback",
          };
        }
        throw new Error(`GNN server returned ${response.status}`);
      }

      const data = await response.json() as { threat_score: number; vuln_type: string; latency_ms: number };

      return {
        threatScore: data.threat_score,
        vulnType: data.vuln_type,
        latencyMs: performance.now() - startTime,
        mode: "trained",
      };
    } catch (error) {
      const latencyMs = performance.now() - startTime;

      if (error instanceof DOMException && error.name === "AbortError") {
        logger.warn({ txHash, latencyMs: latencyMs.toFixed(0) }, "GNN scoring timed out — falling back to heuristic mode");
      } else {
        logger.error({ txHash, err: error }, "GNN scoring failed — using heuristic fallback");
      }

      // On failure, return 0 threat score with heuristic_fallback mode
      return {
        threatScore: 0,
        vulnType: "unknown",
        latencyMs,
        mode: "heuristic_fallback",
      };
    }
  }

  /** Check if the GNN server is healthy */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      const data = await response.json() as { status: string; model_loaded: boolean };
      return data.status === "ok";
    } catch {
      return false;
    }
  }

  /** Get detailed health status including mode information */
  async getHealthStatus(): Promise<GnnHealthStatus> {
    // Check cache first
    const now = Date.now();
    if (this.cachedHealthStatus && now < this.healthCacheExpiry) {
      return this.cachedHealthStatus;
    }

    try {
      const response = await fetch(`${this.serverUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });

      if (!response.ok) {
        const degradedStatus: GnnHealthStatus = {
          status: "degraded",
          modelLoaded: false,
          mode: "heuristic_fallback",
        };
        this.cachedHealthStatus = degradedStatus;
        this.healthCacheExpiry = now + HEALTH_CACHE_TTL_MS;
        return degradedStatus;
      }

      const data = await response.json() as {
        status: string;
        model_loaded: boolean;
        model_version?: string;
      };

      const healthStatus: GnnHealthStatus = {
        status: data.status === "ok" ? "healthy" : "degraded",
        modelLoaded: data.model_loaded,
        mode: data.model_loaded ? "trained" : "heuristic_fallback",
        modelVersion: data.model_version,
      };

      // Cache the result
      this.cachedHealthStatus = healthStatus;
      this.healthCacheExpiry = now + HEALTH_CACHE_TTL_MS;

      return healthStatus;
    } catch (error) {
      logger.error({ err: error }, "GNN health check failed");
      const downStatus: GnnHealthStatus = {
        status: "down",
        modelLoaded: false,
        mode: "heuristic_fallback",
      };
      this.cachedHealthStatus = downStatus;
      this.healthCacheExpiry = now + HEALTH_CACHE_TTL_MS;
      return downStatus;
    }
  }

  /** Get the current mode (trained or heuristic_fallback) */
  async getMode(): Promise<"trained" | "heuristic_fallback"> {
    const health = await this.getHealthStatus();
    return health.mode;
  }

  /** Check if the trained model is currently loaded */
  async isTrainedModelLoaded(): Promise<boolean> {
    const health = await this.getHealthStatus();
    return health.modelLoaded;
  }
}