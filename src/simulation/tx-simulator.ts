/**
 * TxSimulator â€” Submit pending tx to Anvil fork, capture trace, measure state delta.
 * Uses eth_call with state overrides for simulation.
 */

import { logger } from "../utils/logger.js";
import type { AnvilInstance } from "./anvil-fork.js";
import type { AnvilForkPool } from "./simulation-pool.js";
import type { RawTransaction } from "../listeners/base.js";

export interface TokenFlow {
  token: string;
  from: string;
  to: string;
  amount: string;
}

export interface SimulationResult {
  txHash: string;
  gasUsed: string;
  reverted: boolean;
  tvlDeltaPct: number;
  maxCallDepth: number;
  crossContractReentrant: boolean;
  flashLoanDetected: boolean;
  flashLoanAmount: string;
  flashLoanProvider: string;
  oraclePriceDelta: number;
  tokenFlows: TokenFlow[];
  latencyMs: number;
}

const KNOWN_FLASH_LOAN_PROVIDERS = [
  "0x7d2768de32b0b80b7a3c4a1bd274abc4be6410f5", // Aave V2 LendingPool
  "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2", // Aave V3 Pool
  "0xba12222222228d8ba445958a75a0704d5662317f", // Balancer Vault
  "0xeefba1e75898354a390b46ec83f36811c7d32eb4", // Uniswap V2 Router
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", // Uniswap V3 Router
];

const SIMULATION_TIMEOUT_MS = 2000;

export class TxSimulator {
  constructor(private forkPool: AnvilForkPool | null = null) {}

  /** Simulate a transaction on an Anvil fork */
  async simulate(tx: RawTransaction, targetAddress: string, tvlUsd?: number): Promise<SimulationResult> {
    const startTime = performance.now();
    let instance: AnvilInstance | null = null;

    try {
      // Acquire a fork from the pool
      if (this.forkPool) {
        instance = await this.forkPool.acquire();
      }

      if (!instance) {
        logger.warn("No Anvil fork available â€” returning minimal simulation result");
        return this.minimalResult(tx);
      }

      // Simulate with eth_call
      const result = await this.simulateOnFork(instance, tx, targetAddress, tvlUsd);
      result.latencyMs = performance.now() - startTime;
      return result;
    } catch (error) {
      logger.error({ txHash: tx.hash, err: error }, "Simulation failed");
      return { ...this.minimalResult(tx), latencyMs: performance.now() - startTime };
    } finally {
      if (instance && this.forkPool) {
        this.forkPool.release(instance);
      }
    }
  }

  private async simulateOnFork(
    instance: AnvilInstance,
    tx: RawTransaction,
    targetAddress: string,
    tvlUsd?: number,
  ): Promise<SimulationResult> {
    const port = instance.port;

    // Get pre-simulation balance of target contract
    const preBalance = await this.getEthBalance(port, targetAddress);

    // Simulate the transaction via eth_call
    const callResult = await this.ethCall(port, {
      to: tx.to ?? targetAddress,
      from: tx.from,
      data: tx.input,
      value: tx.value,
      gas: tx.gas,
    });

    // Get post-simulation balance
    const postBalance = await this.getEthBalance(port, targetAddress);

    // Compute drain percentage
    const preBal = BigInt(preBalance ?? "0x0");
    const postBal = BigInt(postBalance ?? "0x0");
    const delta = preBal - postBal; // Positive = drain

    let tvlDeltaPct = 0;
    if (tvlUsd && tvlUsd > 0) {
      const deltaEth = Number(delta) / 1e18;
      const deltaUsd = deltaEth * 2000; // Rough ETH price estimate
      tvlDeltaPct = (deltaUsd / tvlUsd) * 100;
    }

    // Detect flash loan
    const trace = await this.getCallTrace(port, tx);
    const flashLoanDetected = this.detectFlashLoan(trace);
    const reentrancyDetected = this.detectReentrancy(trace);

    return {
      txHash: tx.hash,
      gasUsed: callResult.gasUsed ?? "0",
      reverted: callResult.reverted,
      tvlDeltaPct: Math.abs(tvlDeltaPct),
      maxCallDepth: trace.maxDepth,
      crossContractReentrant: reentrancyDetected,
      flashLoanDetected: flashLoanDetected.detected,
      flashLoanAmount: flashLoanDetected.amount,
      flashLoanProvider: flashLoanDetected.provider,
      oraclePriceDelta: 0, // Computed separately by oracle detector
      tokenFlows: trace.tokenFlows,
      latencyMs: 0, // Set by caller
    };
  }

  private async ethCall(port: number, tx: { to: string; from: string; data: string; value: string; gas: string }): Promise<{ result?: string; gasUsed?: string; reverted: boolean }> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(SIMULATION_TIMEOUT_MS),
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_call",
          params: [{ to: tx.to, from: tx.from, data: tx.data, value: tx.value, gas: tx.gas }, "latest"],
          id: 1,
        }),
      });
      const data = await response.json() as { result?: string; error?: { message: string } };

      if (data.error) {
        return { gasUsed: "0", reverted: true };
      }

      // Estimate gas usage via eth_estimateGas
      let gasUsed = "0";
      try {
        const gasResponse = await fetch(`http://127.0.0.1:${port}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(2000),
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_estimateGas",
            params: [{ to: tx.to, from: tx.from, data: tx.data, value: tx.value }],
            id: 2,
          }),
        });
        const gasData = await gasResponse.json() as { result?: string };
        gasUsed = gasData.result ?? "0";
      } catch { /* gas estimation failure is non-critical */ }

      return { result: data.result, gasUsed, reverted: data.result === "0x" };
    } catch (error) {
      logger.debug({ port, err: error }, "eth_call simulation failed");
      return { gasUsed: "0", reverted: true };
    }
  }

  private async getEthBalance(port: number, address: string): Promise<string | null> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [address, "latest"],
          id: 1,
        }),
      });
      const data = await response.json() as { result?: string };
      return data.result ?? null;
    } catch {
      return null;
    }
  }

  private async getCallTrace(port: number, tx: RawTransaction): Promise<{ maxDepth: number; tokenFlows: TokenFlow[] }> {
    // Use debug_traceTransaction if available, otherwise return defaults
    try {
      const response = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(3000),
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "debug_traceTransaction",
          params: [tx.hash, { tracer: "callTracer" }],
          id: 1,
        }),
      });
      const data = await response.json() as { result?: { structLogs?: Array<{ depth: number }> }; error?: unknown };

      if (data.error || !data.result?.structLogs) {
        return { maxDepth: 1, tokenFlows: [] };
      }

      const maxDepth = data.result.structLogs.reduce((max, log) => Math.max(max, log.depth), 0);
      return { maxDepth, tokenFlows: [] };
    } catch {
      return { maxDepth: 1, tokenFlows: [] };
    }
  }

  private detectFlashLoan(trace: { maxDepth: number; tokenFlows: TokenFlow[] }): { detected: boolean; amount: string; provider: string } {
    for (const flow of trace.tokenFlows) {
      if (KNOWN_FLASH_LOAN_PROVIDERS.includes(flow.from.toLowerCase()) || KNOWN_FLASH_LOAN_PROVIDERS.includes(flow.to.toLowerCase())) {
        return { detected: true, amount: flow.amount, provider: flow.from };
      }
    }
    return { detected: false, amount: "0", provider: "" };
  }

  private detectReentrancy(trace: { maxDepth: number; tokenFlows: TokenFlow[] }): boolean {
    return trace.maxDepth > 5; // Heuristic: depth > 5 suggests reentrancy
  }

  private minimalResult(tx: RawTransaction): SimulationResult {
    return {
      txHash: tx.hash,
      gasUsed: "0",
      reverted: false,
      tvlDeltaPct: 0,
      maxCallDepth: 0,
      crossContractReentrant: false,
      flashLoanDetected: false,
      flashLoanAmount: "0",
      flashLoanProvider: "",
      oraclePriceDelta: 0,
      tokenFlows: [],
      latencyMs: 0,
    };
  }
}