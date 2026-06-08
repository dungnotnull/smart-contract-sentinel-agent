/**
 * KnownAttackerFilter — Check if a transaction sender is in the known-attacker registry.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "../utils/logger.js";

interface AttackerEntry {
  address: string;
  label: string;
  chain: string;
  firstSeen: string;
  source: string;
}

interface KnownAttackersData {
  version: number;
  lastUpdated: string;
  attackers: AttackerEntry[];
}

let attackerSet: Set<string> = new Set();
let attackerData: KnownAttackersData = { version: 1, lastUpdated: "", attackers: [] };
let loaded = false;

function ensureLoaded(dataDir?: string): void {
  if (loaded) return;
  loadKnownAttackers(dataDir);
}

export function loadKnownAttackers(dataDir?: string): void {
  const filePath = resolve(dataDir ?? resolve(process.cwd(), "data"), "known-attackers.json");
  try {
    const raw = readFileSync(filePath, "utf-8");
    attackerData = JSON.parse(raw) as KnownAttackersData;
    attackerSet = new Set(attackerData.attackers.map((a: AttackerEntry) => a.address.toLowerCase()));
    loaded = true;
    logger.info({ attackerCount: attackerSet.size, lastUpdated: attackerData.lastUpdated }, "Known attacker registry loaded");
  } catch (error) {
    logger.warn({ path: filePath, err: error }, "Failed to load known attackers");
    attackerSet = new Set();
    attackerData = { version: 1, lastUpdated: "", attackers: [] };
    loaded = true;
  }
}

export function isKnownAttacker(tx: { from: string }): { flagged: boolean; info?: AttackerEntry } {
  ensureLoaded();
  const address = tx.from.toLowerCase();
  const flagged = attackerSet.has(address);
  const info = flagged ? attackerData.attackers.find((a: AttackerEntry) => a.address.toLowerCase() === address) : undefined;

  return { flagged, info };
}

export function addAttacker(entry: AttackerEntry): void {
  ensureLoaded();
  const address = entry.address.toLowerCase();
  if (!attackerSet.has(address)) {
    attackerSet.add(address);
    attackerData.attackers.push(entry);
    attackerData.lastUpdated = new Date().toISOString().slice(0, 10);
    logger.info({ address, label: entry.label }, "New attacker address added to registry");
  }
}

export function getKnownAttackers(): AttackerEntry[] {
  ensureLoaded();
  return attackerData.attackers;
}