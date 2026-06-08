/**
 * BaseMempoolListener — Base (Coinbase L2) mempool subscription for pending transactions.
 * Base uses a traditional mempool similar to Ethereum with Flashbots support.
 * Supports automatic reconnect with exponential backoff.
 */

import { createPublicClient, webSocket, http, type Hash } from "viem";
import { base } from "viem/chains";
import { logger } from "../utils/logger.js";
import type { ChainConfig } from "../core/config-loader.js";
import type { RawTransaction, TransactionCallback } from "./base.js";
import { BaseChainListener } from "./base.js";
import { RpcPool } from "./rpc-pool.js";

export class BaseMempoolListener extends BaseChainListener {
  private client: ReturnType<typeof createPublicClient> | null = null;
  private unwatch: (() => void) | null = null;
  private rpcPool: RpcPool;
  private txCount = 0;
  private lastLogTime = Date.now();
  private txRateTimer: ReturnType<typeof setInterval> | null = null;
  private flashbotsRelayUrl: string;

  constructor(chainConfig: ChainConfig) {
    super({
      chainName: chainConfig.name,
      chainId: chainConfig.chainId,
      reconnectMaxRetries: 3,
      reconnectBaseDelayMs: 1000,
    });
    this.rpcPool = new RpcPool(chainConfig);
    this.flashbotsRelayUrl = chainConfig.flashbotsRelayUrl ?? "https://relay.flashbots.net";
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
      const wsUrl = await this.rpcPool.getActiveWsUrl();

      this.client = createPublicClient({
        chain: base,
        transport: webSocket(wsUrl, {
          reconnect: true,
          retryCount: 3,
          retryDelay: 1000,
        }),
      });

      // Watch for pending transactions
      this.unwatch = this.client.watchPendingTransactions({
        onTransactions: async (hashes: Hash[]) => {
          for (const hash of hashes) {
            await this.handlePendingTx(hash);
          }
        },
        onError: (error: Error) => {
          logger.error({ chain: this.config.chainName, err: error }, "Base mempool subscription error");
          void this.reconnect(() => this.connect());
        },
      });

      this.isConnected = true;
      logger.info(
        { chain: this.config.chainName, wsUrl, flashbotsRelay: this.flashbotsRelayUrl },
        "Base listener subscribed",
      );
    } catch (error) {
      logger.error({ chain: this.config.chainName, err: error }, "Failed to connect Base listener");
      void this.reconnect(() => this.connect());
    }
  }

  private async handlePendingTx(hash: Hash): Promise<void> {
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
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = null;
    }
    if (this.txRateTimer) {
      clearInterval(this.txRateTimer);
      this.txRateTimer = null;
    }
    this.client = null;
    this.isConnected = false;
    this.rpcPool.stop();
    this.cancelReconnect();
    logger.info({ chain: this.config.chainName }, "Base listener unsubscribed");
  }

  getStatus(): {
    connected: boolean;
    chainName: string;
    chainId: number;
    txCount: number;
    rpcPool: ReturnType<RpcPool["getStatus"]>;
    flashbotsRelayUrl: string;
  } {
    return {
      connected: this.isConnected,
      chainName: this.config.chainName,
      chainId: this.config.chainId,
      txCount: this.txCount,
      rpcPool: this.rpcPool.getStatus(),
      flashbotsRelayUrl: this.flashbotsRelayUrl,
    };
  }
}
