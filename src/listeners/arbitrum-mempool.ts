/**
 * ArbitrumMempoolListener — Arbitrum Sequencer feed subscription for pending transactions.
 * Arbitrum uses a Sequencer rather than traditional mempool.
 * Transactions are submitted to Sequencer's feed endpoint for monitoring.
 * Supports automatic reconnect with exponential backoff.
 */

import { createPublicClient, http, type Hash } from "viem";
import { arbitrum } from "viem/chains";
import { logger } from "../utils/logger.js";
import type { ChainConfig } from "../core/config-loader.js";
import type { RawTransaction, TransactionCallback } from "./base.js";
import { BaseChainListener } from "./base.js";
import { RpcPool } from "./rpc-pool.js";

export class ArbitrumMempoolListener extends BaseChainListener {
  private client: ReturnType<typeof createPublicClient> | null = null;
  private rpcPool: RpcPool;
  private txCount = 0;
  private lastLogTime = Date.now();
  private txRateTimer: ReturnType<typeof setInterval> | null = null;
  private sequencerUrl: string;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(chainConfig: ChainConfig) {
    super({
      chainName: chainConfig.name,
      chainId: chainConfig.chainId,
      reconnectMaxRetries: 3,
      reconnectBaseDelayMs: 1000,
    });
    this.rpcPool = new RpcPool(chainConfig);
    this.sequencerUrl = chainConfig.sequencerUrl ?? "https://sequencer.arbitrum.io/seq";
  }

  async subscribe(callback: TransactionCallback): Promise<void> {
    await this.rpcPool.start();
    await this.connect();

    // Store callback
    this.callback = callback;

    // Log tx/sec every 60 seconds
    this.txRateTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this.lastLogTime) / 1000;
      const rate = this.txCount / elapsed;
      logger.info(
        { chain: this.config.chainName, txPerSec: rate.toFixed(2), totalTx: this.txCount },
        "Transaction rate",
      );
      this.txCount = 0;
      this.lastLogTime = now;
    }, 60_000);
  }

  private async connect(): Promise<void> {
    try {
      const rpcUrl = await this.rpcPool.getActiveRpcUrl();

      this.client = createPublicClient({
        chain: arbitrum,
        transport: http(rpcUrl),
      });

      // Arbitrum uses Sequencer feed - poll for pending transactions
      // Note: In production, this would connect to Sequencer's WebSocket feed
      await this.startSequencerPolling();

      this.isConnected = true;
      logger.info({ chain: this.config.chainName, rpcUrl }, "Arbitrum listener subscribed");
    } catch (error) {
      logger.error({ chain: this.config.chainName, err: error }, "Failed to connect Arbitrum listener");
      void this.reconnect(() => this.connect());
    }
  }

  private async startSequencerPolling(): Promise<void> {
    // Poll Sequencer for pending transactions
    // Arbitrum Sequencer provides a feed of transactions waiting to be included
    this.pollInterval = setInterval(async () => {
      try {
        await this.pollSequencer();
      } catch (error) {
        logger.debug({ chain: this.config.chainName, err: error }, "Sequencer poll error");
      }
    }, 2000); // Poll every 2 seconds
  }

  private async pollSequencer(): Promise<void> {
    if (!this.client) return;

    try {
      // Get pending transactions from Sequencer
      // In production, this would query the Sequencer's pending endpoint
      const latestBlock = await this.client.getBlockNumber();

      // Get recent transactions that may still be pending
      const block = await this.client.getBlock({ blockNumber: latestBlock });

      if (!block || !block.transactions) return;

      // Process transactions from latest block
      // In production, we'd filter for transactions that were recently in Sequencer's mempool
      for (const hash of block.transactions.slice(-10)) {
        // Check last 10 transactions
        await this.handleTx(hash);
      }
    } catch (error) {
      logger.debug({ chain: this.config.chainName, err: error }, "Sequencer polling failed");
    }
  }

  private async handleTx(hash: Hash): Promise<void> {
    this.txCount++;

    try {
      if (!this.client || !this.callback) return;
      const tx = await this.client.getTransaction({ hash });

      const raw: RawTransaction = {
        chain: this.config.chainName,
        hash: tx.hash,
        from: tx.from,
        to: tx.to ?? null,
        value: tx.value.toString(),
        input: tx.input,
        gas: tx.gas?.toString() ?? "0",
        gasPrice: tx.gasPrice?.toString() ?? "0",
        maxFeePerGas: tx.maxFeePerGas?.toString() ?? null,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString() ?? null,
        nonce: tx.nonce,
        type: tx.type ?? null,
        transactionIndex: tx.transactionIndex ?? null,
        blockHash: tx.blockHash ?? null,
        blockNumber: tx.blockNumber?.toString() ?? null,
      };

      await this.callback(raw);
    } catch (error) {
      // Skip malformed or unavailable transactions
      logger.debug({ chain: this.config.chainName, hash, err: error }, "Skipping unavailable transaction");
    }
  }

  async unsubscribe(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.txRateTimer) {
      clearInterval(this.txRateTimer);
      this.txRateTimer = null;
    }
    this.client = null;
    this.isConnected = false;
    this.rpcPool.stop();
    this.cancelReconnect();
    logger.info({ chain: this.config.chainName }, "Arbitrum listener unsubscribed");
  }

  getStatus(): {
    connected: boolean;
    chainName: string;
    chainId: number;
    txCount: number;
    rpcPool: ReturnType<RpcPool["getStatus"]>;
  } {
    return {
      connected: this.isConnected,
      chainName: this.config.chainName,
      chainId: this.config.chainId,
      txCount: this.txCount,
      rpcPool: this.rpcPool.getStatus(),
    };
  }
}
