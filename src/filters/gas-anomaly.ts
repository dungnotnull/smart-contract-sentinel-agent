/**
 * GasAnomalyFilter — Detect abnormal gas patterns that may indicate attacks.
 * Tracks per-contract p95 gas baselines using a sliding window.
 * Flags transactions where gas exceeds p95 * multiplier.
 */

import { logger } from "../utils/logger.js";

interface GasBaseline {
  gasLimits: number[];
  gasPrices: bigint[];
  p95GasLimit: number;
  p95GasPrice: bigint;
}

const baselines = new Map<string, GasBaseline>();
const MAX_WINDOW = 1000; // Sliding window size per contract

let gasAnomalyMultiplier = 2.0;
let gasPriceAnomalyMultiplier = 3.0;

/** Configure anomaly multipliers */
export function configureGasAnomaly(config: { gasAnomalyMultiplier?: number; gasPriceAnomalyMultiplier?: number }): void {
  if (config.gasAnomalyMultiplier) gasAnomalyMultiplier = config.gasAnomalyMultiplier;
  if (config.gasPriceAnomalyMultiplier) gasPriceAnomalyMultiplier = config.gasPriceAnomalyMultiplier;
}

/** Check if a transaction has anomalous gas usage */
export function isGasAnomalous(tx: { to: string | null; gas: string; gasPrice: string; maxFeePerGas: string | null; maxPriorityFeePerGas: string | null }): {
  flagged: boolean;
  reasons: string[];
  gasLimitAnomaly: boolean;
  gasPriceAnomaly: boolean;
} {
  const reasons: string[] = [];
  let gasLimitAnomaly = false;
  let gasPriceAnomaly = false;

  const gasLimit = BigInt(tx.gas || "0");
  const effectiveGasPrice = tx.maxFeePerGas
    ? BigInt(tx.maxFeePerGas)
    : tx.gasPrice
      ? BigInt(tx.gasPrice)
      : 0n;

  if (tx.to) {
    const baseline = getOrCreateBaseline(tx.to);

    // Update baseline
    updateBaseline(baseline, Number(gasLimit), effectiveGasPrice);

    // Check gas limit anomaly (>2x p95)
    if (baseline.p95GasLimit > 0 && Number(gasLimit) > baseline.p95GasLimit * gasAnomalyMultiplier) {
      gasLimitAnomaly = true;
      reasons.push(`Gas limit ${gasLimit} > ${gasAnomalyMultiplier}x p95 (${baseline.p95GasLimit})`);
    }

    // Check gas price anomaly (>3x p95)
    if (baseline.p95GasPrice > 0n && effectiveGasPrice > baseline.p95GasPrice * BigInt(Math.floor(gasPriceAnomalyMultiplier * 100)) / 100n) {
      gasPriceAnomaly = true;
      reasons.push(`Gas price ${effectiveGasPrice} > ${gasPriceAnomalyMultiplier}x p95 (${baseline.p95GasPrice})`);
    }
  }

  return {
    flagged: gasLimitAnomaly || gasPriceAnomaly,
    reasons,
    gasLimitAnomaly,
    gasPriceAnomaly,
  };
}

function getOrCreateBaseline(contractAddress: string): GasBaseline {
  let baseline = baselines.get(contractAddress);
  if (!baseline) {
    baseline = { gasLimits: [], gasPrices: [], p95GasLimit: 0, p95GasPrice: 0n };
    baselines.set(contractAddress, baseline);
  }
  return baseline;
}

function updateBaseline(baseline: GasBaseline, gasLimit: number, gasPrice: bigint): void {
  baseline.gasLimits.push(gasLimit);
  baseline.gasPrices.push(gasPrice);

  // Trim to sliding window
  if (baseline.gasLimits.length > MAX_WINDOW) {
    baseline.gasLimits = baseline.gasLimits.slice(-MAX_WINDOW);
    baseline.gasPrices = baseline.gasPrices.slice(-MAX_WINDOW);
  }

  // Recalculate p95
  if (baseline.gasLimits.length >= 10) {
    const sortedLimits = [...baseline.gasLimits].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLimits.length * 0.95);
    baseline.p95GasLimit = sortedLimits[p95Index];

    const sortedPrices = [...baseline.gasPrices].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const p95PriceIndex = Math.floor(sortedPrices.length * 0.95);
    baseline.p95GasPrice = sortedPrices[p95PriceIndex];
  }
}

/** Get baseline stats for a contract (for debugging) */
export function getBaseline(contractAddress: string): GasBaseline | undefined {
  return baselines.get(contractAddress);
}