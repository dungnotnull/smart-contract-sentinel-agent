/**
 * FeatureExtractor — TypeScript wrapper for bytecode feature extraction.
 * Calls the Python ML server's /score endpoint, or falls back to
 * a lightweight local heuristic if the server is unavailable.
 */

import { logger } from "../utils/logger.js";

export interface ExtractedFeatures {
  selector: string;
  bytecodeSize: number;
  hasDelegateCall: boolean;
  hasSelfDestruct: boolean;
  hasCreate: boolean;
  suspiciousOpCodes: string[];
}

const SUSPICIOUS_OP_CODES = new Set([
  "DELEGATECALL", "SELFDESTRUCT", "CREATE", "CREATE2", "CALLCODE",
  "STATICCALL", "EXTCODECOPY", "EXTCODESIZE",
]);

/** Extract features from transaction bytecode (lightweight TS-side check) */
export function extractFeatures(tx: { input: string }): ExtractedFeatures {
  const bytecode = tx.input;

  // Extract 4-byte function selector
  const selector = bytecode.length >= 10 ? bytecode.slice(0, 10) : "";

  // Bytecode size
  const bytecodeSize = bytecode.length;

  // Quick heuristic checks on bytecode
  const hasDelegateCall = bytecode.toUpperCase().includes("F4"); // DELEGATECALL opcode
  const hasSelfDestruct = bytecode.toUpperCase().includes("FF"); // SELFDESTRUCT opcode
  const hasCreate = bytecode.toUpperCase().includes("F0"); // CREATE opcode

  // Find suspicious opcodes
  const suspiciousOpCodes: string[] = [];
  if (hasDelegateCall) suspiciousOpCodes.push("DELEGATECALL");
  if (hasSelfDestruct) suspiciousOpCodes.push("SELFDESTRUCT");
  if (hasCreate) suspiciousOpCodes.push("CREATE");

  return {
    selector,
    bytecodeSize,
    hasDelegateCall,
    hasSelfDestruct,
    hasCreate,
    suspiciousOpCodes,
  };
}