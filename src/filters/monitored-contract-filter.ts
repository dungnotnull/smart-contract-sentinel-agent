/**
 * MonitoredContractFilter — Check if a transaction targets a monitored contract.
 * O(1) Map lookup; loaded from config at startup.
 */

import type { MonitoredContract } from "../core/config-loader.js";

let monitoredAddresses: Map<string, MonitoredContract> | null = null;

/** Load monitored contracts into a Map for O(1) lookup */
export function loadMonitoredContracts(contracts: MonitoredContract[]): void {
  monitoredAddresses = new Map(contracts.map((c) => [c.address.toLowerCase(), c]));
}

/** Check if a transaction targets a monitored contract */
export function isMonitoredContract(tx: { to: string | null }): { flagged: boolean; contract?: MonitoredContract } {
  if (!monitoredAddresses) {
    throw new Error("Monitored contracts not loaded — call loadMonitoredContracts first");
  }

  if (!tx.to) {
    return { flagged: false };
  }

  const contract = monitoredAddresses.get(tx.to.toLowerCase());
  return {
    flagged: contract !== undefined,
    contract,
  };
}

/** Get all monitored contracts */
export function getMonitoredContracts(): MonitoredContract[] {
  if (!monitoredAddresses) return [];
  return Array.from(monitoredAddresses.values());
}