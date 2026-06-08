/**
 * SmartSentinel - Unit tests for config-loader Zod schemas
 */

import { describe, it, expect } from "vitest";
import {
  ChainConfigSchema,
  MonitoredContractSchema,
  ThresholdsSchema,
} from "../../src/core/config-loader.js";

describe("ChainConfigSchema validation", () => {
  it("should validate a valid chain config", () => {
    const valid = {
      name: "ethereum",
      chainId: 1,
      rpcEndpoints: [
        { name: "alchemy", url: "https://eth-mainnet.g.alchemy.com/v2/key" },
        { name: "infura", url: "https://mainnet.infura.io/v3/key" },
        { name: "quicknode", url: "https://bln.nodereal.io/key" },
      ],
      nativeToken: "ETH",
      flashbotsRelay: "https://relay.flashbots.net",
    };
    const result = ChainConfigSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should reject chain with fewer than 3 RPC endpoints", () => {
    const invalid = {
      name: "ethereum",
      chainId: 1,
      rpcEndpoints: [
        { name: "single-rpc", url: "https://eth-mainnet.g.alchemy.com/v2/key" },
      ],
      nativeToken: "ETH",
    };
    const result = ChainConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("3");
    }
  });

  it("should reject invalid chainId", () => {
    const invalid = {
      name: "ethereum",
      chainId: -1,
      rpcEndpoints: [
        { name: "alchemy", url: "https://eth-mainnet.g.alchemy.com/v2/key" },
        { name: "infura", url: "https://mainnet.infura.io/v3/key" },
        { name: "quicknode", url: "https://bln.nodereal.io/key" },
      ],
      nativeToken: "ETH",
    };
    const result = ChainConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should apply default enabled=true", () => {
    const valid = {
      name: "ethereum",
      chainId: 1,
      rpcEndpoints: [
        { name: "alchemy", url: "https://eth-mainnet.g.alchemy.com/v2/key" },
        { name: "infura", url: "https://mainnet.infura.io/v3/key" },
        { name: "quicknode", url: "https://bln.nodereal.io/key" },
      ],
      nativeToken: "ETH",
    };
    const result = ChainConfigSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
    }
  });
});

describe("MonitoredContractSchema validation", () => {
  it("should validate a valid monitored contract", () => {
    const valid = {
      name: "Aave V3 Pool",
      chain: "ethereum",
      address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
      pauseMethod: "setPoolPause(bool)",
      guardianAddress: "0x1234567890123456789012345678901234567890",
      guardianPrivateKeyEnv: "AAVE_GUARDIAN_KEY",
      tvlUsd: 5000000000,
      drainThresholdPct: 3.0,
      gnnThreshold: 0.80,
      notify: {
        telegramChatId: "-100...",
        pagerdutyServiceKeyEnv: "PD_AAVE_KEY",
      },
      addedBy: "human-review",
      addedAt: "2026-05-31",
    };
    const result = MonitoredContractSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should reject contract with invalid address", () => {
    const invalid = {
      name: "Bad Contract",
      chain: "ethereum",
      address: "0xinvalid",
      pauseMethod: "pause()",
      guardianAddress: "0x1234567890123456789012345678901234567890",
      guardianPrivateKeyEnv: "GUARDIAN_KEY",
      tvlUsd: 1000000,
      notify: {},
      addedBy: "human-review",
      addedAt: "2026-05-31",
    };
    const result = MonitoredContractSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject contract added_by agent (must be human-review)", () => {
    const invalid = {
      name: "Auto Contract",
      chain: "ethereum",
      address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
      pauseMethod: "pause()",
      guardianAddress: "0x1234567890123456789012345678901234567890",
      guardianPrivateKeyEnv: "GUARDIAN_KEY",
      tvlUsd: 1000000,
      notify: {},
      addedBy: "auto-agent",
      addedAt: "2026-05-31",
    };
    const result = MonitoredContractSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should apply default thresholds", () => {
    const valid = {
      name: "Default Thresholds",
      chain: "ethereum",
      address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
      pauseMethod: "pause()",
      guardianAddress: "0x1234567890123456789012345678901234567890",
      guardianPrivateKeyEnv: "GUARDIAN_KEY",
      tvlUsd: 1000000,
      notify: {},
      addedBy: "human-review",
      addedAt: "2026-05-31",
    };
    const result = MonitoredContractSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.drainThresholdPct).toBe(3);
      expect(result.data.gnnThreshold).toBe(0.8);
    }
  });
});

describe("ThresholdsSchema validation", () => {
  it("should validate with full defaults", () => {
    const result = ThresholdsSchema.safeParse({
      gnn: {},
      simulation: {},
      preFilter: {},
      response: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gnn.threatThreshold).toBe(0.75);
      expect(result.data.simulation.drainThresholdPct).toBe(3);
      expect(result.data.preFilter.gasAnomalyMultiplier).toBe(2);
      expect(result.data.response.gasPremiumPct).toBe(15);
    }
  });

  it("should reject gnn.threatThreshold > 1", () => {
    const result = ThresholdsSchema.safeParse({ gnn: { threatThreshold: 1.5 } });
    expect(result.success).toBe(false);
  });

  it("should reject simulation.drainThresholdPct < 0", () => {
    const result = ThresholdsSchema.safeParse({ simulation: { drainThresholdPct: -1 } });
    expect(result.success).toBe(false);
  });

  it("should accept custom thresholds", () => {
    const result = ThresholdsSchema.safeParse({
      gnn: { threatThreshold: 0.9, requestTimeoutMs: 500 },
      simulation: { drainThresholdPct: 5, timeoutMs: 3000, oracleDeltaThresholdPct: 60 },
      preFilter: { gasAnomalyMultiplier: 3, gasPriceAnomalyMultiplier: 5 },
      response: { gasPremiumPct: 20, maxRetryBlocks: 3 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gnn.threatThreshold).toBe(0.9);
      expect(result.data.simulation.drainThresholdPct).toBe(5);
    }
  });
});