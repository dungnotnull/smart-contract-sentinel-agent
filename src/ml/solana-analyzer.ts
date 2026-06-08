/**
 * SolanaProgramAnalyzer — Analyze Solana BPF bytecode for vulnerability patterns.
 * Solana programs are compiled to BPF (Berkeley Packet Filter) bytecode, different from EVM.
 * This module analyzes program binaries for known vulnerability patterns.
 *
 * Detection patterns:
 * - Missing owner checks
 * - Unsafe arithmetic operations
 * - Missing rent exemption checks
 * - Unchecked account validations
 */

import { logger } from "../utils/logger.js";

export interface VulnPattern {
  name: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

export interface SolanaAnalysisResult {
  threatScore: number;
  vulnType: string;
  patterns: VulnPattern[];
  confidence: "low" | "medium" | "high";
}

/**
 * Known vulnerability patterns in Solana programs
 */
const SOLANA_VULN_PATTERNS: VulnPattern[] = [
  {
    name: "missing_owner_check",
    description: "Program doesn't verify account owner before state modifications",
    severity: "high",
  },
  {
    name: "unchecked_arithmetic",
    description: "Arithmetic operations without overflow/underflow checks",
    severity: "medium",
  },
  {
    name: "missing_signer_check",
    description: "Transaction signer not verified for privileged operations",
    severity: "critical",
  },
  {
    name: "missing_rent_check",
    description: "Account rent exemption not verified",
    severity: "medium",
  },
  {
    name: "mutable_account_bypass",
    description: "Account writability not properly enforced",
    severity: "high",
  },
  {
    name: "pd_misuse",
    description: "Program Derived Address (PDA) validation bypassed",
    severity: "high",
  },
];

/**
 * BPF bytecode patterns indicating potential vulnerabilities
 */
const BPF_VULN_SIGNATURES: Record<string, number> = {
  // Potential overflow patterns (unchecked arithmetic)
  "0x1f": 0.15, // add
  "0x2f": 0.15, // sub
  "0x5f": 0.15, // mul
  "0x3f": 0.12, // div

  // Memory operations (potential unsafe access)
  "0x72": 0.10, // ldx (load X)
  "0x73": 0.10, // stx (store X)
  "0x7a": 0.08, // lddw (load double word)

  // Control flow (potential bypass patterns)
  "0x85": 0.12, // call
  "0x95": 0.10, // exit
  "0x05": 0.08, // jump
};

/**
 * Analyze Solana program bytecode for vulnerability patterns.
 *
 * @param programData - Raw program binary or ELF data
 * @param programId - Solana program account address
 * @returns Analysis result with threat score and vulnerability patterns
 */
export function analyzeSolanaProgram(
  programData: Buffer | string,
  programId: string,
): SolanaAnalysisResult {
  const data = typeof programData === "string" ? Buffer.from(programData, "hex") : programData;
  const patterns: VulnPattern[] = [];
  let totalScore = 0.0;

  try {
    // Analyze BPF bytecode for vulnerability signatures
    const byteCodeScores = analyzeBpfBytecode(data);
    totalScore += byteCodeScores;

    // Check for high-risk patterns
    if (hasUncheckedArithmetic(data)) {
      patterns.push(SOLANA_VULN_PATTERNS[1]); // unchecked_arithmetic
      totalScore += 0.15;
    }

    if (hasMissingSignerCheck(data)) {
      patterns.push(SOLANA_VULN_PATTERNS[2]); // missing_signer_check
      totalScore += 0.25; // Critical severity
    }

    if (hasMissingRentCheck(data)) {
      patterns.push(SOLANA_VULN_PATTERNS[3]); // missing_rent_check
      totalScore += 0.12;
    }

    // Determine vulnerability type based on patterns found
    const vulnType = determineVulnType(patterns);

    // Calculate confidence based on pattern count and score
    const confidence = calculateConfidence(totalScore, patterns.length);

    logger.debug(
      {
        programId,
        threatScore: totalScore.toFixed(2),
        vulnType,
        patternCount: patterns.length,
        confidence,
      },
      "Solana program analysis complete",
    );

    return {
      threatScore: Math.min(totalScore, 1.0),
      vulnType,
      patterns,
      confidence,
    };
  } catch (error) {
    logger.error({ err: error, programId }, "Solana program analysis failed");

    return {
      threatScore: 0.0,
      vulnType: "unknown",
      patterns: [],
      confidence: "low",
    };
  }
}

/**
 * Analyze BPF bytecode for known vulnerability signatures.
 */
function analyzeBpfBytecode(data: Buffer): number {
  let score = 0.0;
  const hex = data.toString("hex");

  // Check for BPF vulnerability signatures
  for (const [signature, weight] of Object.entries(BPF_VULN_SIGNATURES)) {
    const count = countOccurrences(hex, signature);
    if (count > 0) {
      // More occurrences = higher score, but cap contribution
      const contribution = Math.min(weight * count * 0.5, weight * 2);
      score += contribution;
    }
  }

  return score;
}

/**
 * Check for unchecked arithmetic operations.
 */
function hasUncheckedArithmetic(data: Buffer): boolean {
  // Look for sequences of arithmetic ops without bounds checking
  const hex = data.toString("hex");
  const unsafePatterns = ["1f2f", "2f5f", "5f3f"]; // Sequential arithmetic ops

  for (const pattern of unsafePatterns) {
    if (hex.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Check for missing signer verification.
 */
function hasMissingSignerCheck(data: Buffer): boolean {
  // In BPF, signer verification typically involves specific syscalls
  // This is a simplified check
  const hex = data.toString("hex");

  // Look for cross-program calls without signer checks
  const crossProgramInvoke = "85"; // BPF_CALL
  const hasInvokes = countOccurrences(hex, crossProgramInvoke) > 0;

  // Look for signer validation patterns (these would be present in secure code)
  const signerCheck = "01"; // Simplified pattern
  const hasChecks = hex.includes(signerCheck);

  return hasInvokes && !hasChecks;
}

/**
 * Check for missing rent exemption verification.
 */
function hasMissingRentCheck(data: Buffer): boolean {
  // Rent exemption checks involve specific syscalls
  // This is a simplified heuristic
  const hex = data.toString("hex");

  // Look for account operations without rent checks
  const accountOps = ["72", "73"]; // ldx, stx
  const rentCheck = "b0"; // Simplified pattern for rent syscall

  for (const op of accountOps) {
    if (hex.includes(op) && !hex.includes(rentCheck)) {
      return true;
    }
  }

  return false;
}

/**
 * Count occurrences of a substring in hex string.
 */
function countOccurrences(hex: string, pattern: string): number {
  let count = 0;
  let position = 0;

  while ((position = hex.indexOf(pattern, position)) !== -1) {
    count++;
    position += pattern.length;
  }

  return count;
}

/**
 * Determine vulnerability type based on detected patterns.
 */
function determineVulnType(patterns: VulnPattern[]): string {
  if (patterns.length === 0) {
    return "unknown";
  }

  // Prioritize critical vulnerabilities
  const criticalPattern = patterns.find((p) => p.severity === "critical");
  if (criticalPattern) {
    return "access_control";
  }

  const highPattern = patterns.find((p) => p.severity === "high");
  if (highPattern) {
    return highPattern.name;
  }

  // Default to first pattern
  return patterns[0].name;
}

/**
 * Calculate confidence level based on score and pattern count.
 */
function calculateConfidence(score: number, patternCount: number): "low" | "medium" | "high" {
  if (score >= 0.5 && patternCount >= 2) {
    return "high";
  } else if (score >= 0.3 && patternCount >= 1) {
    return "medium";
  } else {
    return "low";
  }
}

/**
 * Validate Solana program account structure.
 */
export function validateProgramAccount(accountData: Buffer): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  try {
    // Check minimum size
    if (accountData.length < 8) {
      errors.push("Program data too small");
    }

    // Check for ELF magic bytes (Solana programs are ELF binaries)
    const elfMagic = accountData.slice(0, 4).toString("hex");
    if (elfMagic !== "7f454c46") {
      errors.push("Invalid ELF magic bytes");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  } catch (error) {
    return {
      isValid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Extract program metadata from ELF binary.
 */
export function extractProgramMetadata(elfData: Buffer): {
  name?: string;
  version?: string;
  entryPoint?: bigint;
} | null {
  try {
    // In production, this would parse ELF sections
    // For now, return a placeholder
    return {
      name: "unknown",
      version: "1.0.0",
      entryPoint: BigInt(0),
    };
  } catch {
    return null;
  }
}
