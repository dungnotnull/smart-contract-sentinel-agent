/**
 * RpcPool — Multi-RPC failover pool per chain.
 * 3 providers minimum; failover within 500ms; alert on full pool failure.
 * Round-robin across healthy providers; mark unhealthy on timeout/error.
 */

import { createPublicClient, http, type PublicClient } from "viem";
import { logger } from "../utils/logger.js";
import type { ChainConfig, RpcEndpoint } from "../core/config-loader.js";

interface PoolEntry {
  config: RpcEndpoint;
  client: PublicClient;
  healthy: boolean;
  lastFailure: number;
  consecutiveFailures: number;
}

export class RpcPool {
  private entries: PoolEntry[] = [];
  private currentIndex = 0;
  private readonly failoverTimeoutMs = 500;
  private readonly maxConsecutiveFailures = 3;
  private readonly healthCheckIntervalMs = 30_000;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private chainName: string;

  constructor(private chainConfig: ChainConfig) {
    this.chainName = chainConfig.name;
  }

  /** Initialize the pool with clients for all RPC endpoints */
  async start(): Promise<void> {
    for (const endpoint of this.chainConfig.rpcEndpoints) {
      const client = createPublicClient({
        transport: http(endpoint.url, {
          timeout: this.failoverTimeoutMs,
          retryCount: 0,
        }),
      });

      this.entries.push({
        config: endpoint,
        client,
        healthy: true,
        lastFailure: 0,
        consecutiveFailures: 0,
      });
    }

    logger.info(
      { chain: this.chainName, endpoints: this.entries.map((e) => e.config.name) },
      "RPC pool initialized",
    );

    this.startHealthChecks();
  }

  /** Get the active public client (round-robin across healthy providers) */
  getClient(): PublicClient {
    const healthy = this.entries.filter((e) => e.healthy);
    if (healthy.length === 0) {
      logger.error({ chain: this.chainName }, "ALL RPC ENDPOINTS UNHEALTHY — using least-recently-failed");
      // Fallback: use the entry with the oldest lastFailure
      const sorted = [...this.entries].sort((a, b) => a.lastFailure - b.lastFailure);
      return sorted[0].client;
    }

    this.currentIndex = this.currentIndex % healthy.length;
    const entry = healthy[this.currentIndex];
    this.currentIndex++;
    return entry.client;
  }

  /** Get the WebSocket URL for the active healthy provider */
  async getActiveWsUrl(): Promise<string> {
    const healthy = this.entries.filter((e) => e.healthy && e.config.wsUrl);
    if (healthy.length === 0) {
      // Fallback to first entry with wsUrl
      const fallback = this.entries.find((e) => e.config.wsUrl);
      if (!fallback) {
        throw new Error(`No WebSocket URL available for chain ${this.chainName}`);
      }
      return fallback.config.wsUrl!;
    }

    this.currentIndex = this.currentIndex % healthy.length;
    const entry = healthy[this.currentIndex];
    this.currentIndex++;
    return entry.config.wsUrl!;
  }

  /** Mark an endpoint as failed */
  markFailed(endpointName: string): void {
    const entry = this.entries.find((e) => e.config.name === endpointName);
    if (!entry) return;

    entry.consecutiveFailures++;
    entry.lastFailure = Date.now();

    if (entry.consecutiveFailures >= this.maxConsecutiveFailures) {
      entry.healthy = false;
      logger.warn(
        { chain: this.chainName, endpoint: endpointName, failures: entry.consecutiveFailures },
        "RPC endpoint marked unhealthy",
      );
    }
  }

  /** Mark an endpoint as healthy (successful request) */
  markHealthy(endpointName: string): void {
    const entry = this.entries.find((e) => e.config.name === endpointName);
    if (!entry) return;
    entry.consecutiveFailures = 0;
    entry.healthy = true;
  }

  /** Periodic health check: restore unhealthy endpoints */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      for (const entry of this.entries) {
        if (!entry.healthy) {
          try {
            const blockNumber = await entry.client.getBlockNumber();
            if (blockNumber > 0n) {
              entry.healthy = true;
              entry.consecutiveFailures = 0;
              logger.info(
                { chain: this.chainName, endpoint: entry.config.name, blockNumber: blockNumber.toString() },
                "RPC endpoint restored to healthy",
              );
            }
          } catch {
            logger.debug(
              { chain: this.chainName, endpoint: entry.config.name },
              "Health check still failing",
            );
          }
        }
      }
    }, this.healthCheckIntervalMs);
  }

  /** Stop the pool and health checks */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    logger.info({ chain: this.chainName }, "RPC pool stopped");
  }

  /** Get pool status for health check */
  getStatus(): { chain: string; total: number; healthy: number; endpoints: Array<{ name: string; healthy: boolean }> } {
    return {
      chain: this.chainName,
      total: this.entries.length,
      healthy: this.entries.filter((e) => e.healthy).length,
      endpoints: this.entries.map((e) => ({ name: e.config.name, healthy: e.healthy })),
    };
  }
}