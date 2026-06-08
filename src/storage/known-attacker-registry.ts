import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface AttackerEntry {
  address: string;
  label: string;
  chain: string;
  firstSeen: string;
  source: string;
}

export interface KnownAttackerRegistry {
  version: number;
  lastUpdated: string;
  attackers: AttackerEntry[];
}

let registry: KnownAttackerRegistry | null = null;

export function loadRegistry(): KnownAttackerRegistry {
  if (registry !== null) return registry;
  const raw = readFileSync(resolve(process.cwd(), "data", "known-attackers.json"), "utf-8");
  const parsed: KnownAttackerRegistry = JSON.parse(raw);
  registry = parsed;
  return registry;
}

export function isKnown(address: string): boolean {
  const reg = loadRegistry();
  return reg.attackers.some((a) => a.address.toLowerCase() === address.toLowerCase());
}

export function addAttacker(entry: AttackerEntry): void {
  const reg = loadRegistry();
  reg.attackers.push(entry);
  reg.lastUpdated = new Date().toISOString().slice(0, 10);
  writeFileSync(resolve(process.cwd(), "data", "known-attackers.json"), JSON.stringify(reg, null, 2));
  registry = reg;
}