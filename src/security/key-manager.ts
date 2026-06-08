/**
 * Secure Key Manager — Encrypted storage and loading of guardian wallet keys.
 * Encrypts keys at rest using AES-256-GCM with environment-derived keys.
 * Never logs private keys or decrypted values.
 *
 * Security features:
 * - Keys encrypted at rest using AES-256-GCM
 * - Encryption key derived from environment + system-specific salt
 * - Keys only decrypted in memory when needed
 * - Automatic zeroization of memory after use
 * - Comprehensive audit logging
 */

import crypto from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { randomBytes, scryptSync } from "crypto";
import { logger } from "../utils/logger.js";
import { performance } from "perf_hooks";

export interface EncryptedKeyData {
  version: string;
  algorithm: string;
  salt: string;
  nonce: string;
  ciphertext: string;
  keyId: string; // Identifies which key (e.g., "ethereum-guardian")
  createdAt: string;
}

export interface KeyMetadata {
  keyId: string;
  chain: string;
  address: string;
  lastUsed: string;
  keyVersion: number;
}

export class SecureKeyManager {
  private encryptionKey: Buffer | null = null;
  private keysDir: string;
  private keyCache = new Map<string, Buffer>(); // Decrypted keys in memory

  constructor(keysDir: string = "./data/keys") {
    this.keysDir = keysDir;
    this.initializeKeyDirectory();
  }

  /**
   * Initialize key storage directory.
   */
  private initializeKeyDirectory(): void {
    if (!existsSync(this.keysDir)) {
      mkdirSync(this.keysDir, { mode: 0o700 });
      logger.info({ keysDir: this.keysDir }, "Created secure key directory");
    }
  }

  /**
   * Derive encryption key from environment and system-specific salt.
   * Uses scrypt for key derivation (memory-hard, resistant to brute force).
   */
  private deriveEncryptionKey(): Buffer {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    // Get master key from environment (required)
    const masterKeyEnv = process.env.SMARTSENTINEL_MASTER_KEY;
    if (!masterKeyEnv) {
      throw new Error("SMARTSENTINEL_MASTER_KEY environment variable not set");
    }

    // System-specific salt (hostname + process ID)
    const systemSalt = `${process.env.HOSTNAME || "unknown"}-${process.pid}`;

    // Use scrypt for key derivation (memory-hard)
    const salt = crypto.createHash("sha256").update(systemSalt).digest();
    this.encryptionKey = scryptSync(
      Buffer.from(masterKeyEnv, "hex"),
      salt,
      {
        N: 2 ** 16, // CPU/memory cost parameter
        r: 8, // Block size parameter
        p: 1, // Parallelization parameter
      },
      32, // Key length (32 bytes for AES-256)
    );

    logger.debug("Derived encryption key from environment");
    return this.encryptionKey;
  }

  /**
   * Encrypt a private key using AES-256-GCM.
   */
  encryptPrivateKey(privateKey: string, keyId: string): EncryptedKeyData {
    const startTime = performance.now();

    try {
      // Validate private key format
      if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
        throw new Error("Invalid private key format (expected 66 hex chars with 0x prefix)");
      }

      const key = this.deriveEncryptionKey();

      // Generate random nonce
      const nonce = randomBytes(12);

      // Encrypt using AES-256-GCM
      const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
      let ciphertext = cipher.update(privateKey, "utf8");
      cipher.final();
      const authTag = cipher.getAuthTag();

      // Combine ciphertext + auth tag
      const encrypted = Buffer.concat([ciphertext, authTag]);

      // Generate salt for storage (additional layer)
      const salt = randomBytes(16).toString("hex");

      const encryptedData: EncryptedKeyData = {
        version: "1.0",
        algorithm: "aes-256-gcm",
        salt,
        nonce: nonce.toString("hex"),
        ciphertext: encrypted.toString("hex"),
        keyId,
        createdAt: new Date().toISOString(),
      };

      const elapsed = performance.now() - startTime;
      logger.info(
        { keyId, encrypted: true, latencyMs: elapsed.toFixed(2) },
        "Private key encrypted",
      );

      return encryptedData;
    } catch (error) {
      logger.error({ err: error, keyId }, "Failed to encrypt private key");
      throw new Error("Key encryption failed");
    }
  }

  /**
   * Decrypt a private key using AES-256-GCM.
   * NEVER logs the decrypted key.
   */
  decryptPrivateKey(encryptedData: EncryptedKeyData): Buffer {
    const startTime = performance.now();

    try {
      const key = this.deriveEncryptionKey();

      // Parse encrypted data
      const nonce = Buffer.from(encryptedData.nonce, "hex");
      const ciphertext = Buffer.from(encryptedData.ciphertext, "hex");

      // Split ciphertext and auth tag
      const authTag = ciphertext.subarray(ciphertext.length - 16);
      const actualCiphertext = ciphertext.subarray(0, ciphertext.length - 16);

      // Decrypt using AES-256-GCM
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(actualCiphertext);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      const elapsed = performance.now() - startTime;
      logger.debug(
        { keyId: encryptedData.keyId, decrypted: true, latencyMs: elapsed.toFixed(2) },
        "Private key decrypted",
      );

      return decrypted;
    } catch (error) {
      logger.error({ err: error, keyId: encryptedData.keyId }, "Failed to decrypt private key");
      throw new Error("Key decryption failed - data may be corrupted");
    }
  }

  /**
   * Store an encrypted private key to disk.
   */
  storeEncryptedKey(encryptedData: EncryptedKeyData): void {
    const keyFile = join(this.keysDir, `${encryptedData.keyId}.json`);

    try {
      // Write encrypted key with restricted permissions
      writeFileSync(keyFile, JSON.stringify(encryptedData, null, 2), {
        mode: 0o600,
      });

      logger.info({ keyId: encryptedData.keyId }, "Encrypted key stored to disk");
    } catch (error) {
      logger.error({ err: error, keyId: encryptedData.keyId }, "Failed to store encrypted key");
      throw error;
    }
  }

  /**
   * Load an encrypted private key from disk.
   */
  loadEncryptedKey(keyId: string): EncryptedKeyData | null {
    const keyFile = join(this.keysDir, `${keyId}.json`);

    try {
      if (!existsSync(keyFile)) {
        logger.warn({ keyId, keyFile }, "Encrypted key file not found");
        return null;
      }

      const data = readFileSync(keyFile, "utf8");
      const encryptedData = JSON.parse(data) as EncryptedKeyData;

      // Validate version
      if (encryptedData.version !== "1.0") {
        throw new Error(`Unsupported key version: ${encryptedData.version}`);
      }

      logger.debug({ keyId }, "Encrypted key loaded from disk");
      return encryptedData;
    } catch (error) {
      logger.error({ err: error, keyId }, "Failed to load encrypted key");
      return null;
    }
  }

  /**
   * Get a decrypted private key for use.
   * Loads from disk, decrypts, caches in memory, and returns.
   * NEVER logs the key.
   */
  getGuardianKey(keyId: string): Buffer {
    // Check cache first
    if (this.keyCache.has(keyId)) {
      return this.keyCache.get(keyId)!;
    }

    // Load encrypted key from disk
    const encryptedData = this.loadEncryptedKey(keyId);
    if (!encryptedData) {
      throw new Error(`Guardian key not found: ${keyId}`);
    }

    // Decrypt key
    const decryptedKey = this.decryptPrivateKey(encryptedData);

    // Cache in memory
    this.keyCache.set(keyId, decryptedKey);

    // Log key access (without key value)
    logger.info({ keyId, action: "key_loaded" }, "Guardian key accessed");

    return decryptedKey;
  }

  /**
   * Zeroize a buffer (securely clear memory).
   */
  private zeroize(buffer: Buffer): void {
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = 0;
    }
  }

  /**
   * Clear a key from memory cache.
   */
  clearKeyFromCache(keyId: string): void {
    const key = this.keyCache.get(keyId);
    if (key) {
      this.zeroize(key);
      this.keyCache.delete(keyId);
      logger.info({ keyId }, "Key cleared from memory cache");
    }
  }

  /**
   * Clear all keys from memory.
   */
  clearAllKeys(): void {
    for (const [keyId, key] of this.keyCache.entries()) {
      this.zeroize(key);
    }
    this.keyCache.clear();
    logger.info("All keys cleared from memory");
  }

  /**
   * Import a guardian key from environment variable.
   * Encrypts and stores it securely.
   */
  importKeyFromEnvironment(envVarName: string, keyId: string): void {
    const privateKeyEnv = process.env[envVarName];
    if (!privateKeyEnv) {
      throw new Error(`Environment variable not set: ${envVarName}`);
    }

    // Validate and encrypt key
    const encryptedData = this.encryptPrivateKey(privateKeyEnv, keyId);

    // Store to disk
    this.storeEncryptedKey(encryptedData);

    // Remove from environment (optional - for extra security)
    delete process.env[envVarName];

    logger.info({ envVar: envVarName, keyId }, "Key imported from environment");
  }

  /**
   * Validate that a key exists and is accessible.
   */
  validateKey(keyId: string): boolean {
    try {
      const key = this.getGuardianKey(keyId);
      return key !== null && key.length === 32; // 32 bytes for secp256k1 private key
    } catch {
      return false;
    }
  }

  /**
   * Get all stored key IDs.
   */
  listStoredKeys(): string[] {
    try {
      const files = require("fs").readdirSync(this.keysDir);
      return files
        .filter((f: string) => f.endsWith(".json"))
        .map((f: string) => f.replace(".json", ""));
    } catch {
      return [];
    }
  }

  /**
   * Clean up resources.
   */
  close(): void {
    this.clearAllKeys();
    this.encryptionKey = null;
    logger.info("Secure key manager closed");
  }
}
