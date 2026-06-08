/**
 * FrontRunner — Build and submit Flashbots bundles for defensive front-running.
 * Uses @flashbots/ethers-provider-bundle to submit pause transactions via private relay.
 * NEVER submits to the public mempool.
 *
 * Production implementation with:
 * - FlashbotsBundleProvider for real bundle submission
 * - GasEscalator for tier-based gas calculation
 * - BundleSimulator for pre-submission validation
 * - Inclusion confirmation polling
 * - Full error handling and retry logic
 */

import { ethers } from "ethers";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { logger } from "../utils/logger.js";
import type { MonitoredContract } from "../core/config-loader.js";
import { buildPauseTransaction } from "./pause-builder.js";
import { GasEscalator, type AttackTransactionGas } from "./gas-escalation.js";
import { BundleSimulator, type SimulationResult } from "./bundle-simulator.js";

const FLASHBOTS_RELAY_URL = "https://relay.flashbots.net";
const MAX_BUNDLE_RETRIES = 2;
const INCLUSION_CHECK_BLOCKS = 6; // Check for inclusion for ~72 seconds (6 * 12s block time)

export interface BundleResult {
  bundleHash: string;
  included: boolean;
  blockNumber?: number;
  error?: string;
  simulationResults?: SimulationResult;
}

export interface BundleSubmissionParams {
  contract: MonitoredContract;
  attackTx: {
    hash: string;
    from: string;
    to: string | null;
    maxFeePerGas: string | null;
    maxPriorityFeePerGas: string | null;
    gasPrice: string;
    gasLimit: string;
  };
  simulationResult: { drainPct: number; reverted: boolean };
}

export class FrontRunner {
  private provider: ethers.Provider | null = null;
  private flashbotsProvider: FlashbotsBundleProvider | null = null;
  private flashbotsRelayUrl: string;
  private autoPauseEnabled: boolean;
  private gasEscalator: GasEscalator;
  private bundleSimulator: BundleSimulator | null = null;
  private wallet: ethers.Wallet | null = null;

  constructor(rpcUrl: string, flashbotsRelayUrl?: string, autoPauseEnabled?: boolean) {
    this.flashbotsRelayUrl = flashbotsRelayUrl ?? FLASHBOTS_RELAY_URL;
    this.autoPauseEnabled = autoPauseEnabled ?? (process.env.AUTO_PAUSE_ENABLED === "true");
    this.gasEscalator = new GasEscalator();

    if (rpcUrl) {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.bundleSimulator = new BundleSimulator(rpcUrl);
    }
  }

  /**
   * Initialize the Flashbots provider with guardian wallet
   */
  private async initializeFlashbotsProvider(guardianPrivateKey: string): Promise<boolean> {
    try {
      if (!this.provider) {
        throw new Error("RPC provider not initialized");
      }

      this.wallet = new ethers.Wallet(guardianPrivateKey, this.provider);
      this.flashbotsProvider = await FlashbotsBundleProvider.create(
        this.provider as any,
        this.wallet as any,
        this.flashbotsRelayUrl
      );

      logger.info(
        { relayUrl: this.flashbotsRelayUrl, guardian: this.wallet.address },
        "Flashbots provider initialized successfully"
      );

      return true;
    } catch (error) {
      logger.error({ err: error }, "Failed to initialize Flashbots provider");
      return false;
    }
  }

  /**
   * Execute defensive pause by submitting Flashbots bundle
   */
  async executeDefensivePause(params: BundleSubmissionParams): Promise<BundleResult> {
    const { contract, attackTx, simulationResult } = params;

    if (!this.autoPauseEnabled) {
      logger.warn(
        { contract: contract.name, txHash: attackTx.hash },
        "AUTO_PAUSE_ENABLED is false — skipping front-run. Alert-only mode.",
      );
      return { bundleHash: "", included: false, error: "Auto-pause is disabled" };
    }

    if (simulationResult.reverted) {
      logger.warn({ txHash: attackTx.hash }, "Attack tx reverted in simulation — not front-running");
      return { bundleHash: "", included: false, error: "Attack tx reverted" };
    }

    const guardianPrivateKey = process.env[contract.guardianPrivateKeyEnv];
    if (!guardianPrivateKey) {
      logger.error(
        { envVar: contract.guardianPrivateKeyEnv, contract: contract.name },
        "Guardian private key not found in environment",
      );
      return { bundleHash: "", included: false, error: "Guardian key not available" };
    }

    if (!this.provider) {
      logger.error("No RPC provider available for bundle submission");
      return { bundleHash: "", included: false, error: "No RPC provider" };
    }

    try {
      // Initialize Flashbots provider
      const initialized = await this.initializeFlashbotsProvider(guardianPrivateKey);
      if (!initialized || !this.flashbotsProvider || !this.wallet) {
        return { bundleHash: "", included: false, error: "Failed to initialize Flashbots provider" };
      }

      // Extract attack transaction gas parameters
      const attackGas: AttackTransactionGas = {
        maxFeePerGas: BigInt(attackTx.maxFeePerGas ?? attackTx.gasPrice ?? "0"),
        maxPriorityFeePerGas: BigInt(attackTx.maxPriorityFeePerGas ?? "0"),
        gasPrice: BigInt(attackTx.gasPrice ?? "0"),
        gasLimit: BigInt(attackTx.gasLimit ?? "200000"),
      };

      // Calculate gas parameters with current escalation tier
      const gasStrategy = this.gasEscalator.calculateGas(attackGas);

      // Build pause transaction with gas escalation
      const pauseTx = buildPauseTransaction(
        contract.address,
        contract.pauseMethod,
        contract.guardianAddress,
        {
          maxFeePerGas: attackTx.maxFeePerGas,
          maxPriorityFeePerGas: attackTx.maxPriorityFeePerGas,
          gasPrice: attackTx.gasPrice,
        },
        this.gasEscalator.getEffectivePremium(this.gasEscalator.tier)
      );

      // Override gas parameters with escalated values
      pauseTx.maxFeePerGas = gasStrategy.maxFeePerGas;
      pauseTx.maxPriorityFeePerGas = gasStrategy.maxPriorityFeePerGas;
      pauseTx.gasLimit = gasStrategy.gasLimit;

      const currentBlock = await this.provider.getBlockNumber();
      const targetBlock = currentBlock + 1;

      logger.info(
        {
          contract: contract.name,
          guardian: contract.guardianAddress,
          targetBlock,
          attackTxHash: attackTx.hash,
          gasTier: gasStrategy.escalationTier,
          effectivePremium: this.gasEscalator.getEffectivePremium(gasStrategy.escalationTier),
        },
        "Submitting Flashbots bundle for defensive pause",
      );

      logger.info(
        {
          contract: contract.name,
          targetBlock,
          maxFeePerGas: pauseTx.maxFeePerGas.toString(),
          maxPriorityFeePerGas: pauseTx.maxPriorityFeePerGas.toString(),
          gasLimit: pauseTx.gasLimit.toString(),
        },
        "Flashbots bundle prepared with escalated gas",
      );

      // Build signed transaction
      const signedTx = await this.wallet.signTransaction({
        to: pauseTx.to,
        from: pauseTx.from,
        data: pauseTx.data,
        maxFeePerGas: pauseTx.maxFeePerGas,
        maxPriorityFeePerGas: pauseTx.maxPriorityFeePerGas,
        gasLimit: pauseTx.gasLimit,
        chainId: (await this.provider.getNetwork()).chainId,
      });

      // Simulate bundle before submission
      if (this.bundleSimulator) {
        const simulationResults = await this.bundleSimulator.simulateBundle([signedTx]);

        if (!simulationResults.success) {
          logger.warn(
            {
              contract: contract.name,
              revertReason: simulationResults.revertReason,
              gasUsed: simulationResults.gasUsed.toString(),
            },
            "Bundle simulation failed - aborting submission"
          );

          return {
            bundleHash: "",
            included: false,
            error: `Bundle simulation failed: ${simulationResults.revertReason}`,
            simulationResults,
          };
        }

        logger.info(
          {
            contract: contract.name,
            gasUsed: simulationResults.gasUsed.toString(),
            txCount: simulationResults.txResults.length,
          },
          "Bundle simulation successful - proceeding with submission"
        );
      }

      // Submit bundle with retry logic
      const bundleResult = await this.submitBundleWithRetry(signedTx, targetBlock);

      if (bundleResult.included) {
        logger.info(
          {
            contract: contract.name,
            bundleHash: bundleResult.bundleHash,
            blockNumber: bundleResult.blockNumber,
          },
          "Flashbots bundle successfully included"
        );
      } else {
        logger.warn(
          {
            contract: contract.name,
            error: bundleResult.error,
          },
          "Flashbots bundle submission failed after retries"
        );
      }

      return bundleResult;
    } catch (error) {
      logger.error({ err: error, contract: contract.name }, "Flashbots bundle submission failed");
      return {
        bundleHash: "",
        included: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Submit bundle with retry logic across escalation tiers
   */
  private async submitBundleWithRetry(
    signedTx: string,
    targetBlock: number
  ): Promise<BundleResult> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= MAX_BUNDLE_RETRIES; attempt++) {
      if (attempt > 0 && this.gasEscalator.canEscalate()) {
        const newTier = this.gasEscalator.nextTier();
        logger.info(
          { attempt, newTier, effectivePremium: this.gasEscalator.getEffectivePremium(newTier) },
          "Escalating gas price for retry"
        );

        // Re-sign transaction with new gas parameters
        if (this.wallet && this.provider) {
          const gasStrategy = this.gasEscalator.calculateGas({
            maxFeePerGas: 0n,
            maxPriorityFeePerGas: 0n,
            gasPrice: 50000000000n, // 50 gwei base
            gasLimit: 200000n
          });

          // Parse the original transaction to extract its fields
          const originalTx = ethers.Transaction.from(signedTx);

          const reSignedTx = await this.wallet.signTransaction({
            to: originalTx.to,
            from: originalTx.from,
            data: originalTx.data,
            maxFeePerGas: gasStrategy.maxFeePerGas,
            maxPriorityFeePerGas: gasStrategy.maxPriorityFeePerGas,
            gasLimit: gasStrategy.gasLimit,
            chainId: originalTx.chainId,
            nonce: originalTx.nonce,
          });

          signedTx = reSignedTx;
        }
      }

      try {
        if (!this.flashbotsProvider || !this.wallet) {
          throw new Error("Flashbots provider not initialized");
        }

        // Create signed bundle
        const signedBundle = await this.flashbotsProvider.signBundle([
          { signedTransaction: signedTx }
        ]);

        // Submit bundle to Flashbots
        const bundleSubmission = await this.flashbotsProvider.sendRawBundle(
          signedBundle,
          targetBlock + attempt
        );

        // Check if submission failed
        if ('error' in bundleSubmission) {
          lastError = bundleSubmission.error.message;
          logger.warn(
            { attempt, error: lastError },
            "Bundle submission failed"
          );
          continue;
        }

        const bundleHash = bundleSubmission.bundleHash;
        logger.info(
          { attempt, bundleHash, targetBlock: targetBlock + attempt },
          "Bundle submitted successfully"
        );

        // Wait for inclusion confirmation
        const inclusionResult = await bundleSubmission.wait();

        if (inclusionResult === 0) { // FlashbotsBundleResolution.BundleIncluded
          return {
            bundleHash,
            included: true,
            blockNumber: targetBlock + attempt,
          };
        } else {
          lastError = `Bundle not included (resolution: ${inclusionResult})`;
          logger.warn(
            { bundleHash, targetBlock: targetBlock + attempt, resolution: inclusionResult },
            "Bundle not included in target block"
          );

          // Still return success if submission succeeded but we're waiting for inclusion
          return {
            bundleHash,
            included: false,
            error: lastError,
          };
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.error(
          { attempt, error: lastError },
          "Bundle submission attempt failed"
        );
      }
    }

    return {
      bundleHash: "",
      included: false,
      error: lastError || "Bundle submission failed after all retries",
    };
  }

  /**
   * Check bundle inclusion in target block
   */
  async checkBundleInclusion(bundleHash: string, targetBlock: number): Promise<boolean> {
    if (!this.provider) return false;

    try {
      logger.debug({ bundleHash, targetBlock }, "Checking bundle inclusion");

      // Check consecutive blocks for inclusion
      for (let blockOffset = 0; blockOffset < INCLUSION_CHECK_BLOCKS; blockOffset++) {
        const checkBlock = targetBlock + blockOffset;

        try {
          const block = await this.provider.getBlock(checkBlock, true);
          if (!block) continue;

          // Get transactions for this block
          const txHashes = block.transactions;
          for (const txHash of txHashes) {
            // Get transaction details to check if it's from our guardian
            try {
              const tx = await this.provider.getTransaction(txHash);
              if (!tx) continue;

              if (tx.from.toLowerCase() === this.wallet?.address.toLowerCase()) {
                // Verify this is our pause transaction by checking receipt
                const receipt = await this.provider.getTransactionReceipt(txHash);
                if (receipt && receipt.status === 1) {
                  logger.info(
                    { bundleHash, blockNumber: checkBlock, txHash },
                    "Bundle inclusion confirmed"
                  );
                  return true;
                }
              }
            } catch (txError) {
              logger.debug(
                { txHash, error: txError },
                "Failed to get transaction details"
              );
            }
          }
        } catch (blockError) {
          logger.debug(
            { blockNumber: checkBlock, error: blockError },
            "Block not yet mined, continuing to check"
          );
          // Continue checking next block
        }
      }

      logger.warn(
        { bundleHash, targetBlock, checkedBlocks: INCLUSION_CHECK_BLOCKS },
        "Bundle inclusion not confirmed within check window"
      );
      return false;
    } catch (error) {
      logger.error({ err: error, bundleHash, targetBlock }, "Error checking bundle inclusion");
      return false;
    }
  }

  /**
   * Reset gas escalation tier to base level
   */
  resetGasEscalation(): void {
    this.gasEscalator.reset();
    logger.debug("Gas escalation tier reset to base level");
  }

  /**
   * Get current gas escalation tier
   */
  getCurrentGasTier(): number {
    return this.gasEscalator.tier;
  }

  /**
   * Get gas escalation tier summaries
   */
  getGasTierSummaries(): Array<{ tier: number; multiplier: number; effectivePremium: number }> {
    return this.gasEscalator.getTierSummaries();
  }

  /**
   * Close provider connections and cleanup resources
   */
  async close(): Promise<void> {
    try {
      if (this.provider) {
        await this.provider.destroy();
      }
      if (this.bundleSimulator) {
        await this.bundleSimulator.close();
      }
      logger.info("FrontRunner resources cleaned up");
    } catch (error) {
      logger.warn({ err: error }, "Error closing FrontRunner resources");
    }
  }
}
