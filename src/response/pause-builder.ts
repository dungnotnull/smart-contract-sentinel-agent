/**
 * PauseBuilder — Encode pause() calldata for target contracts.
 * Uses the contract's configured pause_method from monitored-contracts.yml.
 */

import { ethers } from "ethers";

const PAUSE_ABI = [
  "function pause()",
  "function setPoolPause(bool paused)",
  "function emergencyPause()",
  "function togglePause()",
  "function unpause()",
];

/**
 * Build a pause transaction for a monitored contract
 *
 * Note: Gas parameters (maxFeePerGas, maxPriorityFeePerGas, gasLimit)
 * are calculated by the GasEscalator and will be overridden by FrontRunner.
 * This function focuses on proper calldata encoding.
 */
export function buildPauseTransaction(
  contractAddress: string,
  pauseMethod: string,
  guardianAddress: string,
  attackTx: { maxFeePerGas: string | null; maxPriorityFeePerGas: string | null; gasPrice: string },
  gasPremiumPct: number = 15,
): {
  to: string;
  from: string;
  data: string;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasLimit: bigint;
} {
  const iface = new ethers.Interface(PAUSE_ABI);

  // Encode the pause call based on the configured method
  let data: string;
  try {
    if (pauseMethod.includes("(bool)")) {
      // Method like setPoolPause(bool) — pass true
      const functionName = pauseMethod.split("(")[0];
      data = iface.encodeFunctionData(functionName, [true]);
    } else if (pauseMethod.includes("()")) {
      // Simple pause() method
      const functionName = pauseMethod.replace("()", "");
      data = iface.encodeFunctionData(functionName, []);
    } else {
      // Try encoding as-is
      data = iface.encodeFunctionData(pauseMethod, []);
    }
  } catch {
    // Fallback: try simple pause()
    try {
      data = iface.encodeFunctionData("pause", []);
    } catch {
      throw new Error(`Failed to encode pause method: ${pauseMethod}`);
    }
  }

  // Base gas calculation (will be overridden by GasEscalator in FrontRunner)
  const attackMaxFee = BigInt(attackTx.maxFeePerGas ?? attackTx.gasPrice ?? "50000000000"); // 50 gwei fallback
  const attackPriorityFee = BigInt(attackTx.maxPriorityFeePerGas ?? "2000000000"); // 2 gwei fallback
  const premiumMultiplier = BigInt(Math.floor((100 + gasPremiumPct) * 100));
  const divisor = 10000n;

  const pauseMaxFee = (attackMaxFee * premiumMultiplier) / divisor;
  const pausePriorityFee = (attackPriorityFee * premiumMultiplier) / divisor;

  return {
    to: contractAddress,
    from: guardianAddress,
    data,
    maxFeePerGas: pauseMaxFee,
    maxPriorityFeePerGas: pausePriorityFee,
    gasLimit: 200_000n, // Conservative — pause() should be cheap
  };
}