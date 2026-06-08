/**
 * Input Validator — Validate and sanitize all inputs to prevent attacks.
 * Prevents injection, XSS, and other vulnerabilities through strict validation.
 *
 * Validation categories:
 * - Addresses (Ethereum addresses, Solana addresses)
 * - Transaction hashes
 * - Numeric values (amounts, thresholds)
 * - Strings (prevent injection attacks)
 * - Configuration values
 */

import { logger } from "../utils/logger.js";

export interface ValidationResult {
  valid: boolean;
  sanitized: any;
  errors: string[];
}

export class InputValidator {
  /**
   * Validate Ethereum address.
   */
  static validateAddress(address: unknown): ValidationResult {
    const errors: string[] = [];

    // Type check
    if (typeof address !== "string") {
      errors.push("Address must be a string");
      return { valid: false, sanitized: null, errors };
    }

    // Format check (0x + 40 hex chars)
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      errors.push("Invalid Ethereum address format");
    }

    // Sanitize (lowercase)
    const sanitized = address.toLowerCase();

    return {
      valid: errors.length === 0,
      sanitized,
      errors,
    };
  }

  /**
   * Validate transaction hash.
   */
  static validateTxHash(hash: unknown): ValidationResult {
    const errors: string[] = [];

    // Type check
    if (typeof hash !== "string") {
      errors.push("Transaction hash must be a string");
      return { valid: false, sanitized: null, errors };
    }

    // Format check (0x + 64 hex chars)
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      errors.push("Invalid transaction hash format");
    }

    // Sanitize (lowercase)
    const sanitized = hash.toLowerCase();

    return {
      valid: errors.length === 0,
      sanitized,
      errors,
    };
  }

  /**
   * Validate numeric value (amount, gas price, etc).
   */
  static validateNumber(value: unknown, options: { min?: number; max?: number } = {}): ValidationResult {
    const errors: string[] = [];

    // Type check
    if (typeof value !== "number" && typeof value !== "string") {
      errors.push("Value must be a number or numeric string");
      return { valid: false, sanitized: null, errors };
    }

    // Convert to number
    const numValue = typeof value === "string" ? parseFloat(value) : value;

    if (isNaN(numValue)) {
      errors.push("Value is not a valid number");
      return { valid: false, sanitized: null, errors };
    }

    // Range check
    if (options.min !== undefined && numValue < options.min) {
      errors.push(`Value must be at least ${options.min}`);
    }

    if (options.max !== undefined && numValue > options.max) {
      errors.push(`Value must be at most ${options.max}`);
    }

    // Prevent NaN and Infinity
    if (!isFinite(numValue)) {
      errors.push("Value must be finite");
    }

    return {
      valid: errors.length === 0,
      sanitized: numValue,
      errors,
    };
  }

  /**
   * Validate percentage (0-100).
   */
  static validatePercentage(value: unknown): ValidationResult {
    return this.validateNumber(value, { min: 0, max: 100 });
  }

  /**
   * Validate threshold score (0.0-1.0).
   */
  static validateThreshold(value: unknown): ValidationResult {
    return this.validateNumber(value, { min: 0, max: 1 });
  }

  /**
   * Validate string input (prevent injection).
   */
  static validateString(
    input: unknown,
    options: { maxLength?: number; allowEmpty?: boolean; pattern?: RegExp } = {},
  ): ValidationResult {
    const errors: string[] = [];

    // Type check
    if (typeof input !== "string") {
      errors.push("Input must be a string");
      return { valid: false, sanitized: null, errors };
    }

    // Empty check
    if (input.length === 0 && options.allowEmpty !== true) {
      errors.push("Input cannot be empty");
    }

    // Length check
    if (options.maxLength && input.length > options.maxLength) {
      errors.push(`Input exceeds maximum length of ${options.maxLength}`);
    }

    // Pattern check
    if (options.pattern && !options.pattern.test(input)) {
      errors.push("Input does not match required pattern");
    }

    // Sanitize: trim whitespace, remove control characters
    let sanitized = input.trim();
    sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, ""); // Remove control chars

    // Additional XSS prevention
    sanitized = this.sanitizeHtml(sanitized);

    return {
      valid: errors.length === 0,
      sanitized,
      errors,
    };
  }

  /**
   * Validate chain name.
   */
  static validateChainName(chain: unknown): ValidationResult {
    const validChains = ["ethereum", "arbitrum", "optimism", "base", "polygon", "solana"];
    const errors: string[] = [];

    if (typeof chain !== "string") {
      errors.push("Chain name must be a string");
      return { valid: false, sanitized: null, errors };
    }

    const sanitized = chain.toLowerCase();

    if (!validChains.includes(sanitized)) {
      errors.push(`Invalid chain name. Must be one of: ${validChains.join(", ")}`);
    }

    return {
      valid: errors.length === 0,
      sanitized,
      errors,
    };
  }

  /**
   * Validate environment variable value.
   */
  static validateEnvValue(
    value: unknown,
    required: boolean = true,
  ): ValidationResult {
    const errors: string[] = [];

    if (value === null || value === undefined) {
      if (required) {
        errors.push("Required value is missing");
      }
      return { valid: !required, sanitized: value, errors };
    }

    // Basic string validation for env vars
    return this.validateString(value, { maxLength: 4096 });
  }

  /**
   * Sanitize HTML to prevent XSS.
   */
  private static sanitizeHtml(input: string): string {
    // Remove potentially dangerous HTML tags
    return input
      .replace(/<script[^>]*>.*?<\/script>/gi, "")
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+\s*=/gi, "");
  }

  /**
   * Validate array input.
   */
  static validateArray<T>(
    input: unknown,
    itemValidator?: (item: unknown) => ValidationResult,
  ): ValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(input)) {
      errors.push("Input must be an array");
      return { valid: false, sanitized: null, errors };
    }

    if (itemValidator) {
      const sanitized: T[] = [];
      for (let i = 0; i < input.length; i++) {
        const result = itemValidator(input[i]);
        if (!result.valid) {
          errors.push(`Item ${i}: ${result.errors.join(", ")}`);
        } else {
          sanitized.push(result.sanitized);
        }
      }

      return {
        valid: errors.length === 0,
        sanitized,
        errors,
      };
    }

    return {
      valid: true,
      sanitized: input,
      errors: [],
    };
  }

  /**
   * Validate contract configuration.
   */
  static validateContractConfig(config: unknown): ValidationResult {
    const errors: string[] = [];

    if (typeof config !== "object" || config === null) {
      errors.push("Contract config must be an object");
      return { valid: false, sanitized: null, errors };
    }

    const cfg = config as Record<string, unknown>;

    // Validate required fields
    const nameResult = this.validateString(cfg.name, { maxLength: 100 });
    if (!nameResult.valid) errors.push(...nameResult.errors.map((e) => `name: ${e}`));

    const chainResult = this.validateChainName(cfg.chain);
    if (!chainResult.valid) errors.push(...chainResult.errors.map((e) => `chain: ${e}`));

    const addressResult = this.validateAddress(cfg.address);
    if (!addressResult.valid) errors.push(...addressResult.errors.map((e) => `address: ${e}`));

    const pauseMethodResult = this.validateString(cfg.pauseMethod, { maxLength: 100 });
    if (!pauseMethodResult.valid) errors.push(...pauseMethodResult.errors.map((e) => `pauseMethod: ${e}`));

    const guardianAddressResult = this.validateAddress(cfg.guardianAddress);
    if (!guardianAddressResult.valid) errors.push(...guardianAddressResult.errors.map((e) => `guardianAddress: ${e}`));

    const tvlResult = this.validateNumber(cfg.tvlUsd, { min: 0 });
    if (!tvlResult.valid) errors.push(...tvlResult.errors.map((e) => `tvlUsd: ${e}`));

    const drainResult = this.validatePercentage(cfg.drainThresholdPct);
    if (!drainResult.valid) errors.push(...drainResult.errors.map((e) => `drainThresholdPct: ${e}`));

    const gnnResult = this.validateThreshold(cfg.gnnThreshold);
    if (!gnnResult.valid) errors.push(...gnnResult.errors.map((e) => `gnnThreshold: ${e}`));

    return {
      valid: errors.length === 0,
      sanitized: cfg,
      errors,
    };
  }

  /**
   * Validate and sanitize raw transaction data.
   */
  static validateRawTransaction(tx: unknown): ValidationResult {
    const errors: string[] = [];

    if (typeof tx !== "object" || tx === null) {
      errors.push("Transaction must be an object");
      return { valid: false, sanitized: null, errors };
    }

    const rawTx = tx as Record<string, unknown>;

    // Validate required fields
    if (!rawTx.hash) {
      errors.push("Transaction hash is required");
    } else {
      const hashResult = this.validateTxHash(rawTx.hash);
      if (!hashResult.valid) errors.push(...hashResult.errors);
    }

    if (!rawTx.from) {
      errors.push("Transaction from address is required");
    } else {
      const fromResult = this.validateAddress(rawTx.from);
      if (!fromResult.valid) errors.push(...fromResult.errors);
    }

    if (rawTx.to !== null && rawTx.to !== undefined) {
      const toResult = this.validateAddress(rawTx.to);
      if (!toResult.valid) errors.push(...toResult.errors);
    }

    // Validate numeric fields
    if (rawTx.value !== undefined && rawTx.value !== null) {
      const valueResult = this.validateString(rawTx.value.toString(), { maxLength: 100 });
      if (!valueResult.valid) errors.push(...valueResult.errors.map((e) => `value: ${e}`));
    }

    if (rawTx.gas && rawTx.gas !== "0") {
      const gasResult = this.validateString(rawTx.gas.toString(), { maxLength: 20 });
      if (!gasResult.valid) errors.push(...gasResult.errors.map((e) => `gas: ${e}`));
    }

    // Sanitize input field (prevent injection)
    let sanitizedInput = rawTx.input;
    if (typeof sanitizedInput === "string") {
      const inputResult = this.validateString(sanitizedInput, { maxLength: 1000000 });
      if (inputResult.valid) {
        sanitizedInput = inputResult.sanitized;
      }
    }

    return {
      valid: errors.length === 0,
      sanitized: {
        ...rawTx,
        input: sanitizedInput,
      },
      errors,
    };
  }

  /**
   * Validate API request parameters.
   */
  static validateApiRequest(params: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      switch (key) {
        case "address":
        case "contractAddress":
          const addrResult = this.validateAddress(value);
          if (!addrResult.valid) {
            errors.push(...addrResult.errors.map((e) => `${key}: ${e}`));
          } else {
            sanitized[key] = addrResult.sanitized;
          }
          break;

        case "txHash":
        case "transactionHash":
          const hashResult = this.validateTxHash(value);
          if (!hashResult.valid) {
            errors.push(...hashResult.errors.map((e) => `${key}: ${e}`));
          } else {
            sanitized[key] = hashResult.sanitized;
          }
          break;

        case "threshold":
        case "score":
          const scoreResult = this.validateThreshold(value);
          if (!scoreResult.valid) {
            errors.push(...scoreResult.errors.map((e) => `${key}: ${e}`));
          } else {
            sanitized[key] = scoreResult.sanitized;
          }
          break;

        case "amount":
        case "limit":
          const numResult = this.validateNumber(value, { min: 0 });
          if (!numResult.valid) {
            errors.push(...numResult.errors.map((e) => `${key}: ${e}`));
          } else {
            sanitized[key] = numResult.sanitized;
          }
          break;

        default:
          // For unknown keys, do basic string validation
          if (typeof value === "string") {
            const strResult = this.validateString(value, { maxLength: 1000 });
            if (!strResult.valid) {
              errors.push(...strResult.errors.map((e) => `${key}: ${e}`));
            } else {
              sanitized[key] = strResult.sanitized;
            }
          } else {
            sanitized[key] = value;
          }
      }
    }

    return {
      valid: errors.length === 0,
      sanitized,
      errors,
    };
  }
}
