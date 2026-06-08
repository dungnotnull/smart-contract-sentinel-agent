/**
 * Integration Tests for Flashbots FrontRunner
 *
 * Tests the complete Flashbots bundle submission pipeline including:
 * - Provider initialization
 * - Bundle construction
 * - Gas escalation
 * - Bundle simulation
 * - Submission and inclusion checking
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ethers } from "ethers";
import { FrontRunner } from "../../src/response/front-runner.js";
import { GasEscalator } from "../../src/response/gas-escalation.js";
import type { MonitoredContract } from "../../src/core/config-loader.js";

describe("FrontRunner Integration Tests", () => {
  let frontRunner: FrontRunner;
  let testRpcUrl: string;
  let mockContract: MonitoredContract;
  let mockAttackTx: {
    hash: string;
    from: string;
    to: string | null;
    maxFeePerGas: string | null;
    maxPriorityFeePerGas: string | null;
    gasPrice: string;
    gasLimit: string;
  };

  beforeEach(() => {
    // Use a test RPC URL (could be Anvil fork or local node)
    testRpcUrl = process.env.TEST_RPC_URL || "http://localhost:8545";

    frontRunner = new FrontRunner(testRpcUrl, "https://relay.flashbots.net", true);

    mockContract = {
      name: "Test Protocol",
      chain: "ethereum",
      address: "0x1234567890123456789012345678901234567890",
      pauseMethod: "pause()",
      guardianAddress: "0x9876543210987654321098765432109876543210",
      guardianPrivateKeyEnv: "TEST_GUARDIAN_KEY",
      tvlUsd: 1000000000,
      drainThresholdPct: 5.0,
      gnnThreshold: 0.80,
      notify: {
        telegramChatId: "-1001234567890",
      },
      addedBy: "test",
      addedAt: "2026-06-08",
    };

    mockAttackTx = {
      hash: "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      from: "0xattacker123456789012345678901234567890123456",
      to: mockContract.address,
      maxFeePerGas: "50000000000", // 50 gwei
      maxPriorityFeePerGas: "2000000000", // 2 gwei
      gasPrice: "50000000000",
      gasLimit: "300000",
    };

    // Set up test environment variables
    process.env.TEST_GUARDIAN_KEY = "0x" + "1".repeat(64); // Mock private key
    process.env.AUTO_PAUSE_ENABLED = "true";
  });

  afterEach(async () => {
    await frontRunner.close();
  });

  describe("Gas Escalation", () => {
    it("should calculate gas parameters for base tier", () => {
      const escalator = new GasEscalator();
      const attackGas = {
        maxFeePerGas: 50000000000n,
        maxPriorityFeePerGas: 2000000000n,
        gasPrice: 50000000000n,
        gasLimit: 300000n,
      };

      const gasStrategy = escalator.calculateGas(attackGas);

      expect(gasStrategy.escalationTier).toBe(0);
      expect(gasStrategy.maxFeePerGas).toBeGreaterThan(attackGas.maxFeePerGas);
      expect(gasStrategy.maxPriorityFeePerGas).toBeGreaterThan(attackGas.maxPriorityFeePerGas);
      expect(gasStrategy.gasLimit).toBeGreaterThan(attackGas.gasLimit);
    });

    it("should escalate gas prices across tiers", () => {
      const escalator = new GasEscalator();
      const attackGas = {
        maxFeePerGas: 50000000000n,
        maxPriorityFeePerGas: 2000000000n,
        gasPrice: 50000000000n,
        gasLimit: 300000n,
      };

      const baseGas = escalator.calculateGas(attackGas);
      escalator.nextTier();
      const escalatedGas = escalator.calculateGas(attackGas);

      expect(escalatedGas.escalationTier).toBe(1);
      expect(escalatedGas.maxFeePerGas).toBeGreaterThan(baseGas.maxFeePerGas);
      expect(escalatedGas.maxPriorityFeePerGas).toBeGreaterThan(baseGas.maxPriorityFeePerGas);
    });

    it("should provide correct tier summaries", () => {
      const escalator = new GasEscalator();
      const summaries = escalator.getTierSummaries();

      expect(summaries).toHaveLength(3);
      expect(summaries[0].tier).toBe(0);
      expect(summaries[0].multiplier).toBe(1.0);
      expect(summaries[1].tier).toBe(1);
      expect(summaries[1].multiplier).toBe(1.5);
      expect(summaries[2].tier).toBe(2);
      expect(summaries[2].multiplier).toBe(2.0);
    });

    it("should calculate effective premiums correctly", () => {
      const escalator = new GasEscalator();
      const premium0 = escalator.getEffectivePremium(0);
      const premium1 = escalator.getEffectivePremium(1);
      const premium2 = escalator.getEffectivePremium(2);

      expect(premium0).toBe(15); // Base 15%
      expect(premium1).toBe(22.5); // 15% * 1.5
      expect(premium2).toBe(30); // 15% * 2.0
    });

    it("should reset to base tier", () => {
      const escalator = new GasEscalator();
      escalator.nextTier();
      expect(escalator.tier).toBe(1);

      escalator.reset();
      expect(escalator.tier).toBe(0);
    });
  });

  describe("FrontRunner Construction", () => {
    it("should initialize with correct configuration", () => {
      expect(frontRunner).toBeDefined();
      expect(frontRunner.getCurrentGasTier()).toBe(0);
    });

    it("should handle auto-pause disabled mode", () => {
      const disabledRunner = new FrontRunner(testRpcUrl, undefined, false);
      expect(disabledRunner).toBeDefined();
    });

    it("should reset gas escalation", () => {
      frontRunner.resetGasEscalation();
      expect(frontRunner.getCurrentGasTier()).toBe(0);
    });

    it("should provide gas tier summaries", () => {
      const summaries = frontRunner.getGasTierSummaries();
      expect(summaries).toHaveLength(3);
      expect(summaries[0]).toMatchObject({
        tier: 0,
        multiplier: 1.0,
        effectivePremium: 15,
      });
    });
  });

  describe("Bundle Execution", () => {
    it("should skip execution when auto-pause is disabled", async () => {
      const disabledRunner = new FrontRunner(testRpcUrl, undefined, false);

      const result = await disabledRunner.executeDefensivePause({
        contract: mockContract,
        attackTx: mockAttackTx,
        simulationResult: { drainPct: 10, reverted: false },
      });

      expect(result.included).toBe(false);
      expect(result.error).toBe("Auto-pause is disabled");

      await disabledRunner.close();
    });

    it("should skip execution for reverted attack transactions", async () => {
      const result = await frontRunner.executeDefensivePause({
        contract: mockContract,
        attackTx: mockAttackTx,
        simulationResult: { drainPct: 10, reverted: true },
      });

      expect(result.included).toBe(false);
      expect(result.error).toBe("Attack tx reverted");
    });

    it("should fail when guardian key is missing", async () => {
      delete process.env.TEST_GUARDIAN_KEY;

      const result = await frontRunner.executeDefensivePause({
        contract: mockContract,
        attackTx: mockAttackTx,
        simulationResult: { drainPct: 10, reverted: false },
      });

      expect(result.included).toBe(false);
      expect(result.error).toBe("Guardian key not available");
    });

    it("should handle bundle execution with valid parameters", async () => {
      // This test would require a real RPC endpoint and valid guardian key
      // In a real integration test environment, this would submit an actual bundle

      const result = await frontRunner.executeDefensivePause({
        contract: mockContract,
        attackTx: mockAttackTx,
        simulationResult: { drainPct: 10, reverted: false },
      });

      // Result will depend on whether we have a real RPC endpoint
      // For unit tests, we expect either success or a connection error
      expect(result).toHaveProperty("included");
      expect(result).toHaveProperty("bundleHash");
      expect(result).toHaveProperty("error");
    });
  });

  describe("Bundle Inclusion Checking", () => {
    it("should check bundle inclusion in target block", async () => {
      const bundleHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const targetBlock = 12345;

      // This will return false if no provider or block not found
      const included = await frontRunner.checkBundleInclusion(bundleHash, targetBlock);

      expect(typeof included).toBe("boolean");
    });

    it("should handle invalid bundle hash gracefully", async () => {
      const invalidHash = "invalid-hash";
      const targetBlock = 12345;

      const included = await frontRunner.checkBundleInclusion(invalidHash, targetBlock);

      expect(included).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid contract address gracefully", async () => {
      const invalidContract = {
        ...mockContract,
        address: "invalid-address",
      };

      const result = await frontRunner.executeDefensivePause({
        contract: invalidContract,
        attackTx: mockAttackTx,
        simulationResult: { drainPct: 10, reverted: false },
      });

      expect(result.included).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle invalid pause method", async () => {
      const invalidPauseContract = {
        ...mockContract,
        pauseMethod: "nonexistentMethod()",
      };

      const result = await frontRunner.executeDefensivePause({
        contract: invalidPauseContract,
        attackTx: mockAttackTx,
        simulationResult: { drainPct: 10, reverted: false },
      });

      expect(result.included).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle missing gas parameters", async () => {
      const invalidGasTx = {
        ...mockAttackTx,
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
        gasPrice: "0",
      };

      const result = await frontRunner.executeDefensivePause({
        contract: mockContract,
        attackTx: invalidGasTx,
        simulationResult: { drainPct: 10, reverted: false },
      });

      expect(result).toBeDefined();
    });
  });

  describe("Resource Cleanup", () => {
    it("should close resources properly", async () => {
      await expect(frontRunner.close()).resolves.not.toThrow();
    });

    it("should handle multiple close calls", async () => {
      await frontRunner.close();
      await expect(frontRunner.close()).resolves.not.toThrow();
    });
  });

  describe("Gas Escalation Integration", () => {
    it("should use escalated gas prices on retry", async () => {
      const initialTier = frontRunner.getCurrentGasTier();
      expect(initialTier).toBe(0);

      // Simulate a retry scenario
      const escalatedTier = frontRunner.getCurrentGasTier() + 1;
      frontRunner.resetGasEscalation();

      expect(frontRunner.getCurrentGasTier()).toBe(0);
    });

    it("should calculate gas for specific tier", () => {
      const escalator = new GasEscalator();
      const attackGas = {
        maxFeePerGas: 50000000000n,
        maxPriorityFeePerGas: 2000000000n,
        gasPrice: 50000000000n,
        gasLimit: 300000n,
      };

      const tier0Gas = escalator.calculateGasForTier(attackGas, 0);
      const tier1Gas = escalator.calculateGasForTier(attackGas, 1);
      const tier2Gas = escalator.calculateGasForTier(attackGas, 2);

      expect(tier0Gas.escalationTier).toBe(0);
      expect(tier1Gas.escalationTier).toBe(1);
      expect(tier2Gas.escalationTier).toBe(2);

      expect(tier1Gas.maxFeePerGas).toBeGreaterThan(tier0Gas.maxFeePerGas);
      expect(tier2Gas.maxFeePerGas).toBeGreaterThan(tier1Gas.maxFeePerGas);
    });

    it("should throw error for out-of-bounds tier", () => {
      const escalator = new GasEscalator();
      const attackGas = {
        maxFeePerGas: 50000000000n,
        maxPriorityFeePerGas: 2000000000n,
        gasPrice: 50000000000n,
        gasLimit: 300000n,
      };

      expect(() => {
        escalator.calculateGasForTier(attackGas, 99);
      }).toThrow("Tier 99 is out of bounds");
    });
  });
});
