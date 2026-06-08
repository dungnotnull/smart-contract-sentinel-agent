/**
 * FlashbotsMevShareListener — Monitors Flashbots MEV-Share for private order flow hints.
 * Provides partial visibility into ~40% of Ethereum transactions that bypass the public mempool.
 */

import { logger } from "../utils/logger.js";
import type { ChainConfig } from "../core/config-loader.js";
import type { RawTransaction, TransactionCallback } from "./base.js";
import { BaseChainListener } from "./base.js";

interface MevShareHint {
  txHash: string;
  logs?: Array<{ address: string; topics: string[] }>;
  functionSelector?: string;
  to?: string;
  gasUsed?: string;
  blockNumber?: string;
}

export class FlashbotsMevShareListener extends BaseChainListener {
  private eventSource: EventSource | null = null;
  private readonly mevShareUrl: string;

  constructor(chainConfig: ChainConfig) {
    super({
      chainName: chainConfig.name,
      chainId: chainConfig.chainId,
      reconnectMaxRetries: 5,
      reconnectBaseDelayMs: 2000,
    });
    this.mevShareUrl = chainConfig.flashbotsRelay ?? "https://mev-share.flashbots.net";
  }

  async subscribe(callback: TransactionCallback): Promise<void> {
    this.callback = callback;
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      // Flashbots MEV-Share provides hints via SSE (Server-Sent Events)
      const sseUrl = `${this.mevShareUrl}/v1/transactions`;

      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onmessage = (event: MessageEvent) => {
        try {
          const hint: MevShareHint = JSON.parse(event.data);
          this.processHint(hint);
        } catch (error) {
          logger.debug({ chain: this.config.chainName, err: error }, "Failed to parse MEV-Share hint");
        }
      };

      this.eventSource.onerror = () => {
        logger.warn({ chain: this.config.chainName }, "MEV-Share SSE connection lost");
        this.isConnected = false;
        void this.reconnect(() => this.connect());
      };

      this.eventSource.onopen = () => {
        this.isConnected = true;
        logger.info({ chain: this.config.chainName, url: this.mevShareUrl }, "MEV-Share listener connected");
      };

      this.isConnected = true;
    } catch (error) {
      logger.error({ chain: this.config.chainName, err: error }, "Failed to connect MEV-Share listener");
      void this.reconnect(() => this.connect());
    }
  }

  private async processHint(hint: MevShareHint): Promise<void> {
    if (!this.callback) return;

    // Convert MEV-Share hint to a partial RawTransaction
    // MEV-Share hints may not contain full transaction data
    const raw: RawTransaction = {
      chain: this.config.chainName,
      hash: hint.txHash,
      from: "0x0000000000000000000000000000000000000000", // Unknown from MEV-Share hint
      to: hint.to ?? null,
      value: "0",
      input: hint.functionSelector ? `0x${hint.functionSelector.replace("0x", "")}...` : "0x",
      gas: "0",
      gasPrice: "0",
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
      nonce: 0,
      type: null,
      transactionIndex: null,
      blockHash: null,
      blockNumber: hint.blockNumber ?? null,
    };

    logger.info(
      {
        chain: this.config.chainName,
        txHash: hint.txHash,
        functionSelector: hint.functionSelector,
        to: hint.to,
      },
      "MEV-Share hint received",
    );

    try {
      await this.callback(raw);
    } catch (error) {
      logger.debug({ chain: this.config.chainName, txHash: hint.txHash, err: error }, "Error processing MEV-Share hint");
    }
  }

  async unsubscribe(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnected = false;
    this.cancelReconnect();
    logger.info({ chain: this.config.chainName }, "MEV-Share listener unsubscribed");
  }

  getStatus(): { connected: boolean; chainName: string; chainId: number } {
    return {
      connected: this.isConnected,
      chainName: this.config.chainName,
      chainId: this.config.chainId,
    };
  }
}