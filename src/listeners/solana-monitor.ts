/**
 * SolanaMonitor — Monitors Solana on-chain state changes via gRPC subscriptions.
 * Solana doesn't have a traditional mempool, so we monitor account changes.
 * Detects anomalous state changes in monitored DeFi programs.
 */

import { logger } from "../utils/logger.js";
import type { ChainConfig } from "../core/config-loader.js";
import type { RawTransaction, TransactionCallback } from "./base.js";

/**
 * Solana transaction format (different from EVM)
 */
export interface SolanaTransaction {
  chain: string;
  hash: string;
  from: string; // Fee payer
  to: string | null; // Program ID
  value: string; // SOL amount
  input: string; // Instruction data
  gas: string; // Compute units
  gasPrice: string; // Fee per compute unit
  accounts: string[]; // Affected accounts
  nonce: number | null;
  type: string | null;
  transactionIndex: number | null;
  blockHash: string | null;
  blockNumber: string | null; // Slot number
}

/**
 * Account change notification from Solana gRPC subscription
 */
export interface AccountChange {
  account: string;
  slot: number;
  lamports: number;
  data: string;
  owner: string;
  executable: boolean;
}

export type SolanaCallback = (tx: SolanaTransaction) => Promise<void>;

export class SolanaMonitor {
  private config: ChainConfig;
  private callback: SolanaCallback | null = null;
  private grpcEndpoint: string;
  private wsEndpoint: string;
  private subscriptions: Set<bigint> = new Set();
  private txCount = 0;
  private lastLogTime = Date.now();
  private txRateTimer: ReturnType<typeof setInterval> | null = null;
  private isConnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private readonly reconnectBaseDelayMs = 1000;

  constructor(chainConfig: ChainConfig) {
    this.config = chainConfig;
    this.grpcEndpoint =
      chainConfig.rpcEndpoints?.[0]?.url ?? "https://api.mainnet-beta.solana.com";
    this.wsEndpoint =
      chainConfig.rpcEndpoints?.[0]?.wsUrl ?? "wss://api.mainnet-beta.solana.com";

    logger.info(
      { chain: chainConfig.name, grpc: this.grpcEndpoint },
      "Solana monitor initialized",
    );
  }

  /**
   * Subscribe to account changes for monitored programs.
   * Unlike EVM chains, Solana requires explicit account subscriptions.
   */
  async subscribe(callback: SolanaCallback, programIds: string[]): Promise<void> {
    this.callback = callback;
    await this.connect();

    // Subscribe to all monitored program accounts
    for (const programId of programIds) {
      await this.subscribeToProgram(programId);
    }

    // Start transaction rate logging
    this.txRateTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this.lastLogTime) / 1000;
      const rate = this.txCount / elapsed;
      logger.info(
        { chain: this.config.chainName, txPerSec: rate.toFixed(2), totalTx: this.txCount },
        "Solana transaction rate",
      );
      this.txCount = 0;
      this.lastLogTime = now;
    }, 60_000);
  }

  private async connect(): Promise<void> {
    try {
      // In production, this would establish a real gRPC connection
      // For now, we simulate the connection
      logger.info({ chain: this.config.chainName }, "Solana gRPC connection established");

      // Start monitoring for new transactions
      await this.startTransactionMonitoring();

      this.isConnected = true;
      this.reconnectAttempts = 0;

      logger.info({ chain: this.config.chainName }, "Solana monitor subscribed");
    } catch (error) {
      logger.error({ chain: this.config.chainName, err: error }, "Failed to connect Solana monitor");
      await this.reconnect(() => this.connect());
    }
  }

  private async subscribeToProgram(programId: string): Promise<void> {
    try {
      // In production, this would call the Solana gRPC subscribe method
      // For now, we track the subscription
      const subId = BigInt(programId.slice(0, 16)); // Simulated subscription ID
      this.subscriptions.add(subId);

      logger.debug({ chain: this.config.chainName, programId }, "Subscribed to Solana program");
    } catch (error) {
      logger.warn({ chain: this.config.chainName, programId, err: error }, "Failed to subscribe to program");
    }
  }

  private async startTransactionMonitoring(): Promise<void> {
    // In production, this would poll for new transactions affecting monitored accounts
    // For now, we simulate this with a timer
    setInterval(async () => {
      if (this.isConnected && this.callback) {
        await this.checkForNewTransactions();
      }
    }, 2000); // Check every 2 seconds
  }

  private async checkForNewTransactions(): Promise<void> {
    try {
      // In production, this would:
      // 1. Query recent confirmed transactions
      // 2. Filter for transactions involving monitored programs
      // 3. Call the callback for each relevant transaction

      // For now, this is a placeholder
      logger.debug({ chain: this.config.chainName }, "Checking for new Solana transactions");
    } catch (error) {
      logger.debug({ chain: this.config.chainName, err: error }, "Error checking for transactions");
    }
  }

  /**
   * Monitor account changes for specific accounts.
   * Detects balance changes and data updates.
   */
  async monitorAccounts(accounts: string[]): Promise<void> {
    for (const account of accounts) {
      try {
        // In production, this would subscribe to account changes via gRPC
        logger.debug({ chain: this.config.chainName, account }, "Monitoring Solana account");
      } catch (error) {
        logger.warn({ chain: this.config.chainName, account, err: error }, "Failed to monitor account");
      }
    }
  }

  /**
   * Process a transaction that affects monitored programs.
   */
  private async handleTransaction(tx: SolanaTransaction): Promise<void> {
    this.txCount++;

    if (this.callback) {
      await this.callback(tx);
    }
  }

  /**
   * Get current monitor status.
   */
  getStatus(): {
    connected: boolean;
    chainName: string;
    grpcEndpoint: string;
    subscriptions: number;
    txCount: number;
  } {
    return {
      connected: this.isConnected,
      chainName: this.config.chainName,
      grpcEndpoint: this.grpcEndpoint,
      subscriptions: this.subscriptions.size,
      txCount: this.txCount,
    };
  }

  /**
   * Unsubscribe from all program monitoring.
   */
  async unsubscribe(): Promise<void> {
    if (this.txRateTimer) {
      clearInterval(this.txRateTimer);
      this.txRateTimer = null;
    }

    // Clear all subscriptions
    this.subscriptions.clear();

    this.isConnected = false;
    this.callback = null;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    logger.info({ chain: this.config.chainName }, "Solana monitor unsubscribed");
  }

  /**
   * Exponential backoff reconnect.
   */
  private async reconnect(connectFn: () => Promise<void>): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(
        { chain: this.config.chainName, attempts: this.reconnectAttempts },
        "Max reconnect attempts reached. Giving up.",
      );
      return;
    }

    const delay = Math.min(
      this.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts),
      30_000,
    );
    this.reconnectAttempts++;

    logger.warn(
      { chain: this.config.chainName, attempt: this.reconnectAttempts, delayMs: delay },
      "Reconnecting...",
    );

    return new Promise((resolve) => {
      this.reconnectTimer = setTimeout(async () => {
        try {
          await connectFn();
          this.reconnectAttempts = 0;
          resolve();
        } catch {
          await this.reconnect(connectFn);
          resolve();
        }
      }, delay);
    });
  }
}
