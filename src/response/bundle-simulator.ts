/**
 * BundleSimulator — Pre-submission validation for Flashbots bundles.
 * Simulates transactions in sequence before submitting to Flashbots relay.
 * Prevents submitting bundles that would revert or waste gas.
 */

import { ethers } from "ethers";
import { logger } from "../utils/logger.js";

export interface SimulationResult {
  success: boolean;
  revertReason: string | null;
  gasUsed: bigint;
  estimatedBlockNumber: number;
  txResults: Array<{
    txHash: string;
    success: boolean;
    gasUsed: bigint;
    revertReason?: string;
  }>;
}

export class BundleSimulator {
  private provider: ethers.JsonRpcProvider;
  private rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Simulate a bundle of signed transactions in sequence.
   * Stops on first failure and returns detailed results.
   *
   * @param signedTxs - Array of signed transaction hex strings
   * @returns SimulationResult with success status and gas details
   */
  async simulateBundle(signedTxs: string[]): Promise<SimulationResult> {
    logger.info({ txCount: signedTxs.length }, "Starting bundle simulation");

    const currentBlock = await this.getCurrentBlockNumber();
    const txResults: SimulationResult["txResults"] = [];
    let totalGasUsed = 0n;
    let simulationFailed = false;
    let failureReason: string | null = null;

    for (let i = 0; i < signedTxs.length; i++) {
      const signedTx = signedTxs[i];
      const txIndex = i;

      try {
        logger.debug({ txIndex, txHash: this.extractTxHash(signedTx) }, "Simulating transaction");

        // Parse the signed transaction
        const parsedTx = ethers.Transaction.from(signedTx);

        // Estimate gas for this transaction
        const gasEstimate = await this.provider.estimateGas({
          to: parsedTx.to,
          from: parsedTx.from,
          data: parsedTx.data,
          value: parsedTx.value,
          gasLimit: parsedTx.gasLimit,
          gasPrice: parsedTx.gasPrice,
          maxFeePerGas: parsedTx.maxFeePerGas,
          maxPriorityFeePerGas: parsedTx.maxPriorityFeePerGas,
          accessList: parsedTx.accessList,
        });

        const gasUsed = gasEstimate;
        totalGasUsed += gasUsed;

        txResults.push({
          txHash: parsedTx.hash || `unknown-${txIndex}`,
          success: true,
          gasUsed,
        });

        logger.debug(
          { txIndex, txHash: parsedTx.hash, gasUsed: gasUsed.toString() },
          "Transaction simulation succeeded",
        );
      } catch (error) {
        simulationFailed = true;
        const revertReason = this.extractRevertReason(error);
        failureReason = revertReason;

        // Parse tx hash for reporting even on failure
        let txHash = `unknown-${txIndex}`;
        try {
          const parsedTx = ethers.Transaction.from(signedTx);
          txHash = parsedTx.hash || txHash;
        } catch {
          // Use unknown hash if parsing fails
        }

        txResults.push({
          txHash,
          success: false,
          gasUsed: 0n,
          revertReason: revertReason,
        });

        logger.warn(
          { txIndex, txHash, revertReason },
          "Transaction simulation failed - stopping bundle simulation",
        );

        // Stop simulation on first failure
        break;
      }
    }

    const result: SimulationResult = {
      success: !simulationFailed,
      revertReason: failureReason,
      gasUsed: totalGasUsed,
      estimatedBlockNumber: currentBlock + 1,
      txResults,
    };

    logger.info(
      {
        success: result.success,
        totalGasUsed: totalGasUsed.toString(),
        txCount: signedTxs.length,
        simulatedTxCount: txResults.length,
        revertReason: failureReason,
      },
      "Bundle simulation completed",
    );

    return result;
  }

  /**
   * Get the current block number from the provider.
   * Useful for determining target block for bundle submission.
   */
  async getCurrentBlockNumber(): Promise<number> {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      logger.debug({ blockNumber }, "Retrieved current block number");
      return blockNumber;
    } catch (error) {
      logger.error({ err: error }, "Failed to get current block number");
      throw new Error(`Failed to get current block number: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Close the provider connection and cleanup resources.
   */
  async close(): Promise<void> {
    try {
      await this.provider.destroy();
      logger.info("Bundle simulator provider connection closed");
    } catch (error) {
      logger.warn({ err: error }, "Error closing bundle simulator provider");
    }
  }

  /**
   * Extract transaction hash from signed transaction hex string.
   * Used for logging and tracking.
   */
  private extractTxHash(signedTx: string): string {
    try {
      const parsedTx = ethers.Transaction.from(signedTx);
      return parsedTx.hash || "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * Extract meaningful revert reason from error object.
   * Parses common error patterns from ethers.js and RPC responses.
   */
  private extractRevertReason(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message;

      // Check for execution reverted patterns
      if (message.includes("execution reverted")) {
        const reasonMatch = message.match(/reason="([^"]+)"/);
        if (reasonMatch) {
          return `execution reverted: ${reasonMatch[1]}`;
        }
        return "execution reverted";
      }

      // Check for out of gas
      if (message.includes("out of gas") || message.includes("exceeds gas limit")) {
        return "out of gas";
      }

      // Check for insufficient funds
      if (message.includes("insufficient funds")) {
        return "insufficient funds";
      }

      // Check for nonce errors
      if (message.includes("nonce too low") || message.includes("nonce too high")) {
        return "invalid nonce";
      }

      // Return the original error message if no pattern matches
      return message;
    }

    // Fallback for non-Error objects
    return String(error);
  }
}
