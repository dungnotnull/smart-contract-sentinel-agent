/**
 * AnvilForkPool — Pool of pre-warmed Anvil forks for low-latency simulation.
 * Maintains N warm forks (one per CPU core, minimum 4).
 * Refreshes idle forks on every new block.
 */

import { availableParallelism } from "node:os";
import { logger } from "../utils/logger.js";
import { spawnFork, resetFork, killFork, isHealthy, type AnvilInstance } from "./anvil-fork.js";

const DEFAULT_POOL_SIZE = Math.max(availableParallelism(), 4);
const DEFAULT_FORK_URL = process.env.ETH_RPC_URL ?? "https://eth-mainnet.g.alchemy.com/v2/demo";

export class AnvilForkPool {
  private forks: AnvilInstance[] = [];
  private readonly poolSize: number;
  private readonly forkUrl: string;
  private currentBlock: bigint = 0n;
  private started = false;

  constructor(poolSize?: number, forkUrl?: string) {
    this.poolSize = poolSize ?? DEFAULT_POOL_SIZE;
    this.forkUrl = forkUrl ?? DEFAULT_FORK_URL;
  }

  /** Start the pool: spawn all fork instances */
  async start(): Promise<void> {
    logger.info({ poolSize: this.poolSize, forkUrl: this.forkUrl }, "Starting Anvil fork pool");

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const instance = await spawnFork(this.forkUrl);
        instance.busy = false;
        this.forks.push(instance);
        logger.debug({ port: instance.port, index: i }, "Fork spawned");
      } catch (error) {
        logger.error({ index: i, err: error }, "Failed to spawn Anvil fork");
      }
    }

    this.started = true;
    logger.info({ activeForks: this.forks.length }, "Anvil fork pool started");
  }

  /** Acquire a free fork from the pool */
  async acquire(): Promise<AnvilInstance> {
    const free = this.forks.find((f) => !f.busy);
    if (free) {
      free.busy = true;

      // Check health before returning
      const healthy = await isHealthy(free);
      if (!healthy) {
        logger.warn({ port: free.port }, "Unhealthy fork detected — respawning");
        killFork(free);
        const index = this.forks.indexOf(free);
        this.forks[index] = await spawnFork(this.forkUrl);
        this.forks[index].busy = true;
        return this.forks[index];
      }

      return free;
    }

    // All busy — spawn an emergency fork
    logger.warn("All forks busy — spawning emergency fork");
    const emergency = await spawnFork(this.forkUrl);
    emergency.busy = true;
    this.forks.push(emergency);
    return emergency;
  }

  /** Release a fork back to the pool */
  release(instance: AnvilInstance): void {
    instance.busy = false;
  }

  /** Refresh idle forks to a new block number */
  async onNewBlock(blockNumber: bigint): Promise<void> {
    this.currentBlock = blockNumber;
    const idleForks = this.forks.filter((f) => !f.busy);

    logger.debug({ blockNumber: blockNumber.toString(), idleForks: idleForks.length }, "Refreshing idle forks");

    await Promise.all(idleForks.map((f) => resetFork(f, blockNumber)));
  }

  /** Stop all fork processes */
  async stop(): Promise<void> {
    for (const fork of this.forks) {
      killFork(fork);
    }
    this.forks = [];
    this.started = false;
    logger.info("Anvil fork pool stopped");
  }

  /** Get pool status */
  getStatus(): { poolSize: number; active: number; busy: number; currentBlock: string } {
    return {
      poolSize: this.poolSize,
      active: this.forks.length,
      busy: this.forks.filter((f) => f.busy).length,
      currentBlock: this.currentBlock.toString(),
    };
  }
}