/**
 * CallValueFilter — Detect unusual ETH value accompanying a call.
 * Flash loans often send 0 ETH but trigger large internal transfers,
 * while some attacks send very large ETH values.
 */

import { logger } from "../utils/logger.js";

// Thresholds for unusual ETH values
const HIGH_VALUE_THRESHOLD_ETH = 1000n; // 1000 ETH is suspiciously high for most interactions
const WHALE_VALUE_THRESHOLD_ETH = 10000n; // 10,000 ETH is whale territory

/** Check if a transaction has unusual call value */
export function isCallValueAnomalous(tx: { value: string; to: string | null }): {
  flagged: boolean;
  reasons: string[];
  highValue: boolean;
  whaleValue: boolean;
} {
  const reasons: string[] = [];
  let highValue = false;
  let whaleValue = false;

  try {
    const valueWei = BigInt(tx.value || "0");
    const valueEth = valueWei / 10n ** 18n;

    if (valueEth >= WHALE_VALUE_THRESHOLD_ETH) {
      whaleValue = true;
      reasons.push(`Whale value: ${valueEth} ETH`);
    } else if (valueEth >= HIGH_VALUE_THRESHOLD_ETH) {
      highValue = true;
      reasons.push(`High value: ${valueEth} ETH`);
    }

    // Zero-value calls to monitored contracts can be flash loan entry points
    if (valueWei === 0n && tx.to) {
      // This is informational only — not flagged alone
      // The pre-filter composite will combine with other signals
    }
  } catch {
    // Invalid value — skip
  }

  return {
    flagged: highValue || whaleValue,
    reasons,
    highValue,
    whaleValue,
  };
}