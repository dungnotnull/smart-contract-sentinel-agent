/**
 * Sentinel Ă¢â‚¬â€ Main orchestrator that wires all modules together.
 * Mempool Ă¢â€ â€™ PreFilter Ă¢â€ â€™ Simulation Ă¢â€ â€™ ML Ă¢â€ â€™ Decision Ă¢â€ â€™ Alert/Response
 */

import { logger } from "../utils/logger.js";
import { loadConfig, type SmartSentinelConfig } from "../core/config-loader.js";
import { EthereumMempoolListener } from "../listeners/ethereum-mempool.js";
import { FlashbotsMevShareListener } from "../listeners/flashbots-relay.js";
import type { RawTransaction, TransactionCallback } from "../listeners/base.js";
import { initPreFilter, preFilter, type PreFilterResult } from "../filters/pre-filter.js";
import { AnvilForkPool } from "../simulation/simulation-pool.js";
import { TxSimulator } from "../simulation/tx-simulator.js";
import { computeDrain, type DrainResult } from "../simulation/drain-calculator.js";
import { GnnClient } from "../ml/gnn-client.js";
import { assessThreat } from "../ml/threat-scorer.js";
import { decide, type DecisionResult } from "../core/decision-engine.js";
import { AlertDispatcher } from "../alerts/dispatcher.js";
import { IncidentLog } from "../storage/incident-log.js";
import type { MonitoredContract } from "../core/config-loader.js";
import type { SimulationResult } from "../simulation/tx-simulator.js";
import type { GnnScore } from "../ml/gnn-client.js";

export class Sentinel {
  private config!: SmartSentinelConfig;
  private mempoolListeners: EthereumMempoolListener[] = [];
  private mevShareListeners: FlashbotsMevShareListener[] = [];
  private forkPool!: AnvilForkPool;
  private simulator!: TxSimulator;
  private gnnClient!: GnnClient;
  private alertDispatcher!: AlertDispatcher;
  private incidentLog!: IncidentLog;
  private isRunning = false;
  private startTime = 0;

  async start(): Promise<void> {
    this.startTime = Date.now();
    logger.info("SmartSentinel starting...");

    // Load configuration
    this.config = await loadConfig();

    // Initialize pre-filter with monitored contracts
    initPreFilter(this.config.contracts);

    // Initialize RPC pool and mempool listeners for each chain
    for (const chain of this.config.chains) {
      if (!chain.enabled) continue;

      const listener = new EthereumMempoolListener(chain);

      this.mempoolListeners.push(listener);

      // MEV-Share listener for chains that support it
      if (chain.flashbotsRelay) {
        const mevListener = new FlashbotsMevShareListener(chain);
        this.mevShareListeners.push(mevListener);
      }
    }

    // Initialize simulation pool
    this.forkPool = new AnvilForkPool();
    await this.forkPool.start();
    this.simulator = new TxSimulator(this.forkPool);

    // Initialize ML client
    this.gnnClient = new GnnClient();

    // Initialize alert dispatcher
    this.alertDispatcher = new AlertDispatcher(this.config.thresholds);

    // Initialize incident log
    this.incidentLog = new IncidentLog();

    // Subscribe to mempool transactions
    const txCallback: TransactionCallback = (tx: RawTransaction) => this.processTransaction(tx);

    for (const listener of this.mempoolListeners) {
      await listener.subscribe(txCallback);
    }

    for (const listener of this.mevShareListeners) {
      await listener.subscribe(txCallback);
    }

    this.isRunning = true;
    logger.info(
      {
        chains: this.config.chains.filter((c) => c.enabled).map((c) => c.name),
        contracts: this.config.contracts.length,
        autoPause: true,
      },
      "SmartSentinel initialized and running",
    );
  }

  async stop(): Promise<void> {
    logger.info("SmartSentinel shutting down...");

    for (const listener of this.mempoolListeners) {
      await listener.unsubscribe();
    }
    for (const listener of this.mevShareListeners) {
      await listener.unsubscribe();
    }

    await this.forkPool.stop();
    this.incidentLog.close();
    this.isRunning = false;
    logger.info("SmartSentinel stopped");
  }

  /** Main processing pipeline for each transaction */
  private async processTransaction(tx: RawTransaction): Promise<void> {
    const pipelineStart = performance.now();

    try {
      // Step 1: Pre-filter (target: < 5ms)
      const filterResult = preFilter(tx);
      if (!filterResult.shouldEscalate) {
        return; // Discard Ă¢â‚¬â€ log count only
      }

      logger.info(
        { txHash: tx.hash, flags: filterResult.flags, filterLatencyMs: filterResult.latencyMs.toFixed(2) },
        "Transaction passed pre-filter",
      );

      // Step 2: Find the monitored contract (if any)
      const contract = filterResult.details.contract;
      if (!contract) {
        logger.debug({ txHash: tx.hash }, "No monitored contract match Ă¢â‚¬â€ skipping simulation");
        return;
      }

      // Step 3: Simulation (target: < 1000ms)
      const simulation = await this.simulator.simulate(tx, contract.address, contract.tvlUsd);
      if (simulation.reverted) {
        logger.debug({ txHash: tx.hash }, "Transaction reverted in simulation Ă¢â‚¬â€ likely failed attack");
        return;
      }

      // Step 4: Drain calculation
      const drain = computeDrain(simulation, contract);
      if (!drain.exceedsThreshold && !drain.oracleManipulationDetected) {
        logger.debug(
          { txHash: tx.hash, drainPct: drain.drainPct.toFixed(2), threshold: contract.drainThresholdPct },
          "Drain below threshold Ă¢â‚¬â€ discarding",
        );
        return;
      }

      // Step 5: GNN scoring (target: < 200ms)
      let gnnScore: GnnScore;
      if (await this.gnnClient.isHealthy()) {
        gnnScore = await this.gnnClient.scoreBytecode(tx.input, tx.hash);
      } else {
        logger.warn("GNN server unavailable Ă¢â‚¬â€ falling back to simulation-only mode with elevated threshold");
        gnnScore = { threatScore: 0, vulnType: "unknown", latencyMs: 0 , mode: "heuristic_fallback" };
      }

      // Step 6: Decision (AND-gate logic)
      const decision = decide({
        gnnScore: gnnScore.threatScore,
        drainPct: simulation.tvlDeltaPct,
        oracleDeltaPct: simulation.oraclePriceDelta,
        heuristicFlags: filterResult.flags,
        thresholds: {
          gnn: contract.gnnThreshold,
          drain: contract.drainThresholdPct,
        },
        simulation,
        txHash: tx.hash,
        contractName: contract.name,
      });

      // Step 7: Alert / Response
      const pipelineLatencyMs = performance.now() - pipelineStart;
      await this.alertDispatcher.dispatch(decision, {
        tx,
        simulation,
        drain,
        gnnScore,
        filterResult,
        contract,
        pipelineLatencyMs,
      });

      // Step 8: Log incident
      await this.incidentLog.logIncident({
        incidentId: decision.incidentId,
        action: decision.action,
        txHash: tx.hash,
        contractName: contract.name,
        contractAddress: contract.address,
        chain: tx.chain,
        gnnScore: gnnScore.threatScore,
        drainPct: simulation.tvlDeltaPct,
        heuristicFlags: filterResult.flags,
        decisionReason: decision.reason,
        pipelineLatencyMs,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error({ txHash: tx.hash, err: error }, "Error processing transaction through pipeline");
    }
  }

  /** Get sentinel status for health check */
  getStatus(): Record<string, unknown> {
    return {
      isRunning: this.isRunning,
      uptimeMs: this.isRunning ? Date.now() - this.startTime : 0,
      chains: this.config?.chains.filter((c) => c.enabled).map((c) => c.name) ?? [],
      contracts: this.config?.contracts.length ?? 0,
      forkPool: this.forkPool?.getStatus(),
      gnnServer: "not checked",
    };
  }
}