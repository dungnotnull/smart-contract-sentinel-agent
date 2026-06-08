/**
 * FunctionSelectorFilter — O(1) lookup of known attack function selectors.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "../utils/logger.js";

interface SelectorEntry {
  name: string;
  category: string;
  risk: string;
  description: string;
}

interface SelectorsData {
  version: string;
  lastUpdated: string;
  selectors: Record<string, SelectorEntry>;
}

let selectorSet: Set<string> = new Set();
let selectorData: SelectorsData = { version: "0.0.0", lastUpdated: "", selectors: {} };
let loaded = false;

function ensureLoaded(dataDir?: string): void {
  if (loaded) return;
  loadSelectors(dataDir);
}

export function loadSelectors(dataDir?: string): void {
  const filePath = resolve(dataDir ?? resolve(process.cwd(), "data"), "4byte-selectors.json");
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as SelectorsData;
    selectorData = parsed;
    selectorSet = new Set(Object.keys(parsed.selectors));
    loaded = true;
    logger.info({ selectorCount: selectorSet.size, lastUpdated: selectorData.lastUpdated }, "Function selector database loaded");
  } catch (error) {
    logger.warn({ path: filePath, err: error }, "Failed to load function selectors");
    selectorSet = new Set();
    selectorData = { version: "0.0.0", lastUpdated: "", selectors: {} };
    loaded = true;
  }
}

export function isKnownAttackSelector(tx: { input: string }): { flagged: boolean; selector: string; info?: SelectorEntry } {
  ensureLoaded();

  if (!tx.input || tx.input === "0x" || tx.input.length < 10) {
    return { flagged: false, selector: "" };
  }

  const selector = tx.input.slice(0, 10).toLowerCase();
  const flagged = selectorSet.has(selector);

  return {
    flagged,
    selector,
    info: flagged && selectorData.selectors[selector] ? selectorData.selectors[selector] : undefined,
  };
}

export function getAllSelectors(): Set<string> {
  ensureLoaded();
  return selectorSet;
}

export function getSelectorInfo(selector: string): SelectorEntry | undefined {
  ensureLoaded();
  return selectorData.selectors[selector];
}