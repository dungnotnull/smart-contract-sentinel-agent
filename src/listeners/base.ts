/**
 * RawTransaction — Unified internal transaction format.
 * Normalized from chain-specific formats (viem, solana, etc.)
 */
export interface RawTransaction {
  chain: string;
  hash: string;
  from: string;
  to: string | null;
  value: string;
  input: string;
  gas: string;
  gasPrice: string;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
  nonce: number;
  type: string | number | null;
  transactionIndex: number | null;
  blockHash: string | null;
  blockNumber: string | null;
}

export type TransactionCallback = (tx: RawTransaction) => Promise<void>;

/**
 * BaseChainListener — Abstract interface for all chain listeners.
 * Every supported chain must implement subscribe(), unsubscribe(), and onTx().
 */

export interface ChainListenerConfig {
  chainName: string;
  chainId: number;
  reconnectMaxRetries: number;
  reconnectBaseDelayMs: number;
}

export abstract class BaseChainListener {
  protected config: ChainListenerConfig;
  protected callback: TransactionCallback | null = null;
  protected reconnectAttempts = 0;
  protected isConnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: ChainListenerConfig) {
    this.config = config;
  }

  /** Register callback for incoming transactions */
  abstract subscribe(callback: TransactionCallback): Promise<void>;

  /** Stop listening and clean up resources */
  abstract unsubscribe(): Promise<void>;

  /** Get listener status */
  abstract getStatus(): { connected: boolean; chainName: string; chainId: number };

  /** Exponential backoff reconnect */
  protected async reconnect(connectFn: () => Promise<void>): Promise<void> {
    if (this.reconnectAttempts >= this.config.reconnectMaxRetries) {
      const { logger } = await import("../utils/logger.js");
      logger.error(
        { chain: this.config.chainName, attempts: this.reconnectAttempts },
        "Max reconnect attempts reached. Giving up.",
      );
      return;
    }

    const delay = Math.min(
      this.config.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts),
      30_000,
    );
    this.reconnectAttempts++;

    const { logger } = await import("../utils/logger.js");
    logger.warn(
      { chain: this.config.chainName, attempt: this.reconnectAttempts, delayMs: delay },
      "Reconnecting...",
    );

    return new Promise((resolve) => {
      this.reconnectTimer = setTimeout(async () => {
        try {
          await connectFn();
          this.reconnectAttempts = 0;
          this.isConnected = true;
          logger.info({ chain: this.config.chainName }, "Reconnected successfully");
          resolve();
        } catch {
          await this.reconnect(connectFn);
          resolve();
        }
      }, delay);
    });
  }

  /** Cancel any pending reconnect */
  protected cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}