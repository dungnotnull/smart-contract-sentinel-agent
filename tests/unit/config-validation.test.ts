/**
 * SmartSentinel — Config validation integration test
 * Verifies that malformed configs are rejected with clear error messages
 */

import { describe, it, expect } from "vitest";
import {
  ChainConfigSchema,
  MonitoredContractSchema,
} from "../../src/core/config-loader.js";

describe("Config validation rejects malformed configs", () => {
  it("should reject monitored contract with invalid address", () => {
    const malformed = {
      name: "Bad Contract",
      chain: "ethereum",
      address: "NOT_AN_ADDRESS",  // Invalid!
      pauseMethod: "pause()",
      guardianAddress: "0x1234567890123456789012345678901234567890",
      guardianPrivateKeyEnv: "GUARDIAN_KEY",
      tvlUsd: 1000000,
      notify: {},
      addedBy: "human-review",
      addedAt: "2026-06-08",
    };
    const result = MonitoredContractSchema.safeParse(malformed);
    expect(result.success).toBe(false);
    if (!result.success) {
      const addressError = result.error.issues.find(i => i.path.join(".").includes("address"));
      expect(addressError).toBeDefined();
      expect(addressError!.message).toContain("Invalid Ethereum address");
    }
  });

  it("should reject contract addedBy auto-agent (must be human-review)", () => {
    const malformed = {
      name: "Auto-added",
      chain: "ethereum",
      address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
      pauseMethod: "pause()",
      guardianAddress: "0x1234567890123456789012345678901234567890",
      guardianPrivateKeyEnv: "GUARDIAN_KEY",
      tvlUsd: 1000000,
      notify: {},
      addedBy: "auto-agent",  // Invalid! Must be "human-review"
      addedAt: "2026-06-08",
    };
    const result = MonitoredContractSchema.safeParse(malformed);
    expect(result.success).toBe(false);
    if (!result.success) {
      const addedByError = result.error.issues.find(i => i.path.join(".").includes("addedBy"));
      expect(addedByError).toBeDefined();
    }
  });

  it("should reject chain config with fewer than 3 RPC endpoints", () => {
    const malformed = {
      name: "ethereum",
      chainId: 1,
      rpcEndpoints: [
        { name: "single-rpc", url: "https://eth-mainnet.g.alchemy.com/v2/key" },
      ],
      nativeToken: "ETH",
    };
    const result = ChainConfigSchema.safeParse(malformed);
    expect(result.success).toBe(false);
    if (!result.success) {
      const rpcError = result.error.issues.find(i => i.path.join(".").includes("rpcEndpoints"));
      expect(rpcError).toBeDefined();
    }
  });

  it("should reject chain config with invalid URL", () => {
    const malformed = {
      name: "ethereum",
      chainId: 1,
      rpcEndpoints: [
        { name: "bad-rpc", url: "not-a-url" },
        { name: "another", url: "also-not-url" },
        { name: "third", url: "still-not-url" },
      ],
      nativeToken: "ETH",
    };
    const result = ChainConfigSchema.safeParse(malformed);
    expect(result.success).toBe(false);
  });
});