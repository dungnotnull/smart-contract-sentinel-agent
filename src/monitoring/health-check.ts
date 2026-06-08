/**
 * Health Check System — Comprehensive health status monitoring.
 * Provides /health and /ready endpoints with component status.
 *
 * Health categories:
 * - Liveness: Is the service running?
 * - Readiness: Can the service handle requests?
 * - Component health: Status of individual components
 */

import { logger } from "../utils/logger.js";
import type { RpcPool } from "../listeners/rpc-pool.js";
import type { AnvilForkPool } from "../simulation/anvil-fork.js";
import type { GnnClient } from "../ml/gnn-client.js";

export interface ComponentHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  message: string;
  lastCheck: string;
  latencyMs?: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "down";
  timestamp: string;
  components: ComponentHealth[];
  uptime: number;
  version: string;
}

export class HealthChecker {
  private startTime: Date;
  private components = new Map<string, ComponentHealth>();
  private version: string;

  constructor(version: string = "0.2.0") {
    this.startTime = new Date();
    this.version = version;
    this.initializeComponentChecks();
  }

  /**
   * Initialize component health checks.
   */
  private initializeComponentChecks(): void {
    // Register default components
    this.registerComponent("sentinel_core", {
      status: "healthy",
      message: "Sentinel core running",
      lastCheck: new Date().toISOString(),
    });

    this.registerComponent("rpc_pools", {
      status: "healthy",
      message: "RPC pools operational",
      lastCheck: new Date().toISOString(),
    });

    this.registerComponent("gnn_server", {
      status: "healthy",
      message: "GNN server unreachable - using heuristic fallback",
      lastCheck: new Date().toISOString(),
    });

    this.registerComponent("simulation_pool", {
      status: "healthy",
      message: "Simulation pool ready",
      lastCheck: new Date().toISOString(),
    });
  }

  /**
   * Register a component for health checking.
   */
  registerComponent(
    name: string,
    health: Omit<ComponentHealth, "name">,
  ): void {
    this.components.set(name, {
      name,
      ...health,
    });
  }

  /**
   * Update component health status.
   */
  updateComponentHealth(
    name: string,
    status: ComponentHealth["status"],
    message: string,
    latencyMs?: number,
  ): void {
    const component = this.components.get(name);
    if (component) {
      component.status = status;
      component.message = message;
      component.lastCheck = new Date().toISOString();
      component.latencyMs = latencyMs;
    } else {
      logger.warn({ componentName: name }, "Attempted to update unregistered component");
    }
  }

  /**
   * Check RPC pool health.
   */
  async checkRpcPoolHealth(rpcPool: RpcPool, chainName: string): Promise<void> {
    try {
      const startTime = Date.now();
      const isActive = rpcPool.getStatus().connected;
      const latency = Date.now() - startTime;

      if (isActive) {
        this.updateComponentHealth(`rpc_pool_${chainName}`, "healthy", "RPC pool connected", latency);
      } else {
        this.updateComponentHealth(`rpc_pool_${chainName}`, "down", "RPC pool disconnected");
      }
    } catch (error) {
      this.updateComponentHealth(`rpc_pool_${chainName}`, "down", "RPC pool check failed");
    }
  }

  /**
   * Check GNN server health.
   */
  async checkGnnServerHealth(gnnClient: GnnClient): Promise<void> {
    try {
      const startTime = Date.now();
      const isHealthy = await gnnClient.isHealthy();
      const latency = Date.now() - startTime;

      if (isHealthy) {
        this.updateComponentHealth("gnn_server", "healthy", "GNN server operational", latency);
      } else {
        this.updateComponentHealth("gnn_server", "degraded", "GNN server down - using heuristic fallback");
      }
    } catch (error) {
      this.updateComponentHealth("gnn_server", "degraded", "GNN server check failed - using heuristic fallback");
    }
  }

  /**
   * Check simulation pool health.
   */
  async checkSimulationPoolHealth(simulationPool: AnvilForkPool): Promise<void> {
    try {
      const startTime = Date.now();
      const status = simulationPool.getStatus();
      const latency = Date.now() - startTime;

      const activeForks = status.activeForks;
      const totalForks = status.poolSize;

      if (activeForks === totalForks && activeForks > 0) {
        this.updateComponentHealth("simulation_pool", "healthy", `${activeForks}/${totalForks} forks active`, latency);
      } else if (activeForks > 0) {
        this.updateComponentHealth("simulation_pool", "degraded", `${activeForks}/${totalForks} forks active`);
      } else {
        this.updateComponentHealth("simulation_pool", "down", "No simulation forks available");
      }
    } catch (error) {
      this.updateComponentHealth("simulation_pool", "down", "Simulation pool check failed");
    }
  }

  /**
   * Get overall health status.
   */
  getHealthStatus(): HealthStatus {
    const now = new Date();
    const uptimeMs = now.getTime() - this.startTime.getTime();

    // Determine overall status
    let overallStatus: HealthStatus["status"] = "healthy";
    const componentArray = Array.from(this.components.values());

    for (const component of componentArray) {
      if (component.status === "down") {
        overallStatus = "down";
        break;
      } else if (component.status === "degraded" && overallStatus !== "down") {
        overallStatus = "degraded";
      }
    }

    return {
      status: overallStatus,
      timestamp: now.toISOString(),
      components: componentArray,
      uptime: Math.floor(uptimeMs / 1000),
      version: this.version,
    };
  }

  /**
   * Get readiness status.
   */
  isReady(): boolean {
    const health = this.getHealthStatus();

    // Service is ready if not down and core components are healthy
    if (health.status === "down") {
      return false;
    }

    // Check critical components
    const criticalComponents = ["sentinel_core", "rpc_pools"];
    for (const component of health.components) {
      if (criticalComponents.includes(component.name) && component.status === "down") {
        return false;
      }
    }

    return true;
  }

  /**
   * Get metrics for health monitoring.
   */
  getHealthMetrics(): {
    uptime: number;
    version: string;
    componentCount: number;
    healthyComponents: number;
    degradedComponents: number;
    downComponents: number;
  } {
    const health = this.getHealthStatus();

    let healthy = 0;
    let degraded = 0;
    let down = 0;

    for (const component of health.components) {
      if (component.status === "healthy") healthy++;
      else if (component.status === "degraded") degraded++;
      else down++;
    }

    return {
      uptime: health.uptime,
      version: health.version,
      componentCount: health.components.length,
      healthyComponents: healthy,
      degradedComponents: degraded,
      downComponents: down,
    };
  }

  /**
   * Perform all health checks.
   */
  async performHealthChecks(
    dependencies: {
      rpcPools?: Map<string, RpcPool>;
      gnnClient?: GnnClient;
      simulationPool?: AnvilForkPool;
    } = {},
  ): Promise<void> {
    // Check RPC pools
    if (dependencies.rpcPools) {
      for (const [chainName, rpcPool] of dependencies.rpcPools) {
        await this.checkRpcPoolHealth(rpcPool, chainName);
      }
    }

    // Check GNN server
    if (dependencies.gnnClient) {
      await this.checkGnnServerHealth(dependencies.gnnClient);
    }

    // Check simulation pool
    if (dependencies.simulationPool) {
      await this.checkSimulationPoolHealth(dependencies.simulationPool);
    }

    logger.debug("All health checks performed");
  }

  /**
   * Create health check response for HTTP endpoint.
   */
  createHealthResponse(): HealthStatus {
    return this.getHealthStatus();
  }

  /**
   * Create readiness response for HTTP endpoint.
   */
  createReadinessResponse(): { ready: boolean } {
    return {
      ready: this.isReady(),
    };
  }
}
