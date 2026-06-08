/**
 * Security Module — Comprehensive security hardening for SmartSentinel.
 * Provides encrypted key management, audit logging, rate limiting, and input validation.
 */

export { SecureKeyManager } from "./key-manager.js";
export type { EncryptedKeyData, KeyMetadata } from "./key-manager.js";

export { AuditLogger } from "./audit-logger.js";
export type { AuditEvent, AuditCategory } from "./audit-logger.js";

export { RateLimiter } from "./rate-limiter.js";
export type { RateLimitConfig, RateLimitResult } from "./rate-limiter.js";

export { InputValidator } from "./input-validator.js";
export type { ValidationResult } from "./input-validator.js";
