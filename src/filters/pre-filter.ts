/**
 * PreFilter — Composite filter combining all heuristic checks.
 * Any flag = escalate to simulation.
 * Target: < 5ms per transaction, < 2% pass rate on mainnet traffic.
 */

import { logger } from "../utils/logger.js";
import type { RawTransaction } from "../listeners/base.js";
import type { MonitoredContract } from "../core/config-loader.js";
import { isKnownAttackSelector } from "./function-selector.js";
import { isMonitoredContract, loadMonitoredContracts } from "./monitored-contract-filter.js";
import { isGasAnomalous } from "./gas-anomaly.js";
import { isKnownAttacker, loadKnownAttackers } from "./whale-tracker.js";
import { isCallValueAnomalous } from "./call-value-filter.js";
import { loadSelectors } from "./function-selector.js";

export interface PreFilterResult {
  /** Whether this transaction should be escalated to simulation */
  shouldEscalate: boolean;
  /** List of heuristic flags that triggered */
  flags: string[];
  /** Details for each flag */
  details: PreFilterDetails;
  /** Processing time in ms */
  latencyMs: number;
}

export interface PreFilterDetails {
  selectorMatch: boolean;
  selectorInfo?: { name: string; category: string; risk: string };
  monitoredContract: boolean;
  contract?: MonitoredContract;
  knownAttacker: boolean;
  attackerInfo?: { label: string; source: string };
  gasAnomaly: boolean;
  gasReasons: string[];
  callValueAnomaly: boolean;
  callValueReasons: string[];
}

/** Initialize all pre-filter sub-modules */
export function initPreFilter(contracts: MonitoredContract[], dataDir?: string): void {
  loadSelectors(dataDir);
  loadMonitoredContracts(contracts);
  loadKnownAttackers(dataDir);
  logger.info("Pre-filter modules initialized");
}

/** Run all pre-filter checks on a transaction */
export function preFilter(tx: RawTransaction): PreFilterResult {
  const startTime = performance.now();

  const flags: string[] = [];
  const details: PreFilterDetails = {
    selectorMatch: false,
    monitoredContract: false,
    knownAttacker: false,
    gasAnomaly: false,
    gasReasons: [],
    callValueAnomaly: false,
    callValueReasons: [],
  };

  // 1. Function selector check (< 0.1ms)
  const selectorResult = isKnownAttackSelector(tx);
  if (selectorResult.flagged) {
    flags.push("known_attack_selector");
    details.selectorMatch = true;
    details.selectorInfo = selectorResult.info;
  }

  // 2. Monitored contract check (< 0.1ms)
  const contractResult = isMonitoredContract(tx);
  if (contractResult.flagged) {
    flags.push("monitored_contract");
    details.monitoredContract = true;
    details.contract = contractResult.contract;
  }

  // 3. Known attacker check (< 0.1ms)
  const attackerResult = isKnownAttacker(tx);
  if (attackerResult.flagged) {
    flags.push("known_attacker");
    details.knownAttacker = true;
    if (attackerResult.info) {
      details.attackerInfo = { label: attackerResult.info.label, source: attackerResult.info.source };
    }
  }

  // 4. Gas anomaly check
  const gasResult = isGasAnomalous(tx);
  if (gasResult.flagged) {
    flags.push("gas_anomaly");
    details.gasAnomaly = true;
    details.gasReasons = gasResult.reasons;
  }

  // 5. Call value check
  const valueResult = isCallValueAnomalous(tx);
  if (valueResult.flagged) {
    flags.push("call_value_anomaly");
    details.callValueAnomaly = true;
    details.callValueReasons = valueResult.reasons;
  }

  const latencyMs = performance.now() - startTime;

  const result: PreFilterResult = {
    shouldEscalate: flags.length > 0,
    flags,
    details,
    latencyMs,
  };

  if (result.shouldEscalate) {
    logger.info(
      {
        txHash: tx.hash,
        from: tx.from,
        to: tx.to,
        flags: result.flags,
        latencyMs: result.latencyMs.toFixed(2),
      },
      "Transaction escalated by pre-filter",
    );
  }

  return result;
}