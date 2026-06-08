/**
 * Unit tests for Gas Escalation Strategy
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GasEscalator,
  GasStrategy,
  AttackTransactionGas,
  GasEscalatorConfig,
} from '../../src/response/gas-escalation';

describe('GasEscalator', () => {
  let escalator: GasEscalator;
  let mockAttackGas: AttackTransactionGas;

  beforeEach(() => {
    escalator = new GasEscalator();
    mockAttackGas = {
      maxFeePerGas: 1000000000n, // 1 Gwei
      maxPriorityFeePerGas: 100000000n, // 0.1 Gwei
      gasPrice: 900000000n, // 0.9 Gwei
      gasLimit: 100000n, // 100k gas
    };
  });

  describe('Configuration and Initialization', () => {
    it('should use default configuration when no config provided', () => {
      expect(escalator.maxTiers).toBe(3);
      expect(escalator.tier).toBe(0);
    });

    it('should accept custom configuration', () => {
      const customConfig: Partial<GasEscalatorConfig> = {
        basePremium: 20,
        escalationMultipliers: [1.0, 2.0, 3.0, 4.0],
        gasLimitBuffer: 15,
      };
      const customEscalator = new GasEscalator(customConfig);

      expect(customEscalator.maxTiers).toBe(4);
      expect(customEscalator.getEffectivePremium(0)).toBe(20);
    });

    it('should reset to tier 0', () => {
      escalator.nextTier();
      expect(escalator.tier).toBe(1);

      escalator.reset();
      expect(escalator.tier).toBe(0);
    });
  });

  describe('Gas Calculation', () => {
    it('should calculate gas with base premium at tier 0', () => {
      const result = escalator.calculateGas(mockAttackGas);

      // Base premium: 15%
      // maxFeePerGas: 1 Gwei * 1.15 = 1.15 Gwei
      expect(result.maxFeePerGas).toBe(1150000000n);
      expect(result.escalationTier).toBe(0);
    });

    it('should calculate gas with escalated premium at tier 1', () => {
      escalator.nextTier();
      const result = escalator.calculateGas(mockAttackGas);

      // Effective premium: 15% * 1.5 = 22.5%
      // maxFeePerGas: 1 Gwei * 1.225 = 1.225 Gwei
      expect(result.maxFeePerGas).toBe(1225000000n);
      expect(result.escalationTier).toBe(1);
    });

    it('should calculate gas with escalated premium at tier 2', () => {
      escalator.nextTier();
      escalator.nextTier();
      const result = escalator.calculateGas(mockAttackGas);

      // Effective premium: 15% * 2.0 = 30%
      // maxFeePerGas: 1 Gwei * 1.30 = 1.30 Gwei
      expect(result.maxFeePerGas).toBe(1300000000n);
      expect(result.escalationTier).toBe(2);
    });

    it('should add buffer to gas limit', () => {
      const result = escalator.calculateGas(mockAttackGas);

      // Gas limit: 100k * 1.10 = 110k
      expect(result.gasLimit).toBe(110000n);
    });

    it('should ensure maxPriorityFeePerGas does not exceed maxFeePerGas', () => {
      // Edge case where priority fee would exceed max fee
      const edgeCaseGas: AttackTransactionGas = {
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 950000000n, // Very high priority fee
        gasPrice: 900000000n,
        gasLimit: 100000n,
      };

      const result = escalator.calculateGas(edgeCaseGas);

      // Both should be the same after premium applied
      expect(result.maxPriorityFeePerGas).toBeLessThanOrEqual(result.maxFeePerGas);
    });

    it('should maintain relationship between maxFeePerGas and maxPriorityFeePerGas', () => {
      const result = escalator.calculateGas(mockAttackGas);

      expect(result.maxPriorityFeePerGas).toBeLessThanOrEqual(result.maxFeePerGas);
    });
  });

  describe('Tier Navigation', () => {
    it('should start at tier 0', () => {
      expect(escalator.tier).toBe(0);
    });

    it('should advance to next tier', () => {
      const newTier = escalator.nextTier();
      expect(newTier).toBe(1);
      expect(escalator.tier).toBe(1);
    });

    it('should advance multiple tiers', () => {
      escalator.nextTier();
      escalator.nextTier();
      expect(escalator.tier).toBe(2);
    });

    it('should throw error when advancing beyond max tier', () => {
      escalator.nextTier();
      escalator.nextTier();

      expect(() => escalator.nextTier()).toThrow('Already at maximum tier');
    });

    it('should correctly report if can escalate', () => {
      expect(escalator.canEscalate()).toBe(true);

      escalator.nextTier();
      expect(escalator.canEscalate()).toBe(true);

      escalator.nextTier();
      expect(escalator.canEscalate()).toBe(false);
    });
  });

  describe('Tier-Specific Calculation', () => {
    it('should calculate gas for specific tier without changing current tier', () => {
      escalator.nextTier();
      expect(escalator.tier).toBe(1);

      const tier0Result = escalator.calculateGasForTier(mockAttackGas, 0);
      expect(tier0Result.escalationTier).toBe(0);
      expect(escalator.tier).toBe(1); // Current tier unchanged
    });

    it('should throw error for invalid tier', () => {
      expect(() => escalator.calculateGasForTier(mockAttackGas, -1)).toThrow();
      expect(() => escalator.calculateGasForTier(mockAttackGas, 10)).toThrow();
    });

    it('should produce different gas parameters for different tiers', () => {
      const tier0 = escalator.calculateGasForTier(mockAttackGas, 0);
      const tier1 = escalator.calculateGasForTier(mockAttackGas, 1);
      const tier2 = escalator.calculateGasForTier(mockAttackGas, 2);

      expect(tier0.maxFeePerGas).toBeLessThan(tier1.maxFeePerGas);
      expect(tier1.maxFeePerGas).toBeLessThan(tier2.maxFeePerGas);
    });
  });

  describe('Premium Calculations', () => {
    it('should return correct effective premium for each tier', () => {
      expect(escalator.getEffectivePremium(0)).toBe(15); // 15% * 1.0
      expect(escalator.getEffectivePremium(1)).toBe(22.5); // 15% * 1.5
      expect(escalator.getEffectivePremium(2)).toBe(30); // 15% * 2.0
    });

    it('should throw error for invalid tier in getEffectivePremium', () => {
      expect(() => escalator.getEffectivePremium(-1)).toThrow();
      expect(() => escalator.getEffectivePremium(10)).toThrow();
    });

    it('should provide tier summaries', () => {
      const summaries = escalator.getTierSummaries();

      expect(summaries).toHaveLength(3);
      expect(summaries[0]).toEqual({
        tier: 0,
        multiplier: 1.0,
        effectivePremium: 15,
      });
      expect(summaries[1]).toEqual({
        tier: 1,
        multiplier: 1.5,
        effectivePremium: 22.5,
      });
      expect(summaries[2]).toEqual({
        tier: 2,
        multiplier: 2.0,
        effectivePremium: 30,
      });
    });
  });

  describe('BigInt Arithmetic Precision', () => {
    it('should handle large gas values correctly', () => {
      const largeGas: AttackTransactionGas = {
        maxFeePerGas: 100000000000n, // 100 Gwei
        maxPriorityFeePerGas: 10000000000n, // 10 Gwei
        gasPrice: 90000000000n,
        gasLimit: 1000000n, // 1M gas
      };

      const result = escalator.calculateGas(largeGas);

      // 100 Gwei * 1.15 = 115 Gwei
      expect(result.maxFeePerGas).toBe(115000000000n);
      expect(result.gasLimit).toBe(1100000n);
    });

    it('should handle small gas values correctly', () => {
      const smallGas: AttackTransactionGas = {
        maxFeePerGas: 1000000n, // 0.001 Gwei
        maxPriorityFeePerGas: 100000n,
        gasPrice: 900000n,
        gasLimit: 21000n, // Minimum gas for simple transfer
      };

      const result = escalator.calculateGas(smallGas);

      // Should round correctly with BigInt division
      expect(result.maxFeePerGas).toBeGreaterThan(0n);
      expect(result.gasLimit).toBe(23100n); // 21000 * 1.10
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle realistic Ethereum mainnet gas prices', () => {
      const mainnetGas: AttackTransactionGas = {
        maxFeePerGas: 50000000000n, // 50 Gwei (moderately congested)
        maxPriorityFeePerGas: 2000000000n, // 2 Gwei
        gasPrice: 48000000000n,
        gasLimit: 200000n, // Typical complex transaction
      };

      const result = escalator.calculateGas(mainnetGas);

      // 50 Gwei * 1.15 = 57.5 Gwei
      expect(result.maxFeePerGas).toBe(57500000000n);
      expect(result.gasLimit).toBe(220000n); // 200k * 1.10
    });

    it('should handle high congestion scenarios', () => {
      const congestionGas: AttackTransactionGas = {
        maxFeePerGas: 300000000000n, // 300 Gwei (high congestion)
        maxPriorityFeePerGas: 50000000000n, // 50 Gwei
        gasPrice: 250000000000n,
        gasLimit: 500000n, // Large transaction
      };

      const result = escalator.calculateGas(congestionGas);

      // 300 Gwei * 1.15 = 345 Gwei
      expect(result.maxFeePerGas).toBe(345000000000n);
      expect(result.gasLimit).toBe(550000n);
    });

    it('should maintain escalation advantage across tiers', () => {
      const attackGas: AttackTransactionGas = {
        maxFeePerGas: 100000000000n, // 100 Gwei
        maxPriorityFeePerGas: 5000000000n, // 5 Gwei
        gasPrice: 95000000000n,
        gasLimit: 300000n,
      };

      const tier0 = escalator.calculateGasForTier(attackGas, 0);
      const tier1 = escalator.calculateGasForTier(attackGas, 1);
      const tier2 = escalator.calculateGasForTier(attackGas, 2);

      // Each tier should provide incrementally higher gas
      expect(tier0.maxFeePerGas).toBeLessThan(tier1.maxFeePerGas);
      expect(tier1.maxFeePerGas).toBeLessThan(tier2.maxFeePerGas);

      // All tiers should exceed the original attack gas
      expect(tier0.maxFeePerGas).toBeGreaterThan(attackGas.maxFeePerGas);
      expect(tier1.maxFeePerGas).toBeGreaterThan(attackGas.maxFeePerGas);
      expect(tier2.maxFeePerGas).toBeGreaterThan(attackGas.maxFeePerGas);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero gas limit', () => {
      const zeroGas: AttackTransactionGas = {
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 100000000n,
        gasPrice: 900000000n,
        gasLimit: 0n,
      };

      const result = escalator.calculateGas(zeroGas);
      expect(result.gasLimit).toBe(0n);
    });

    it('should handle very small difference between maxFee and priorityFee', () => {
      const tightGas: AttackTransactionGas = {
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 999999999n, // Almost same as maxFee
        gasPrice: 900000000n,
        gasLimit: 100000n,
      };

      const result = escalator.calculateGas(tightGas);

      // Should cap priority fee at max fee
      expect(result.maxPriorityFeePerGas).toBeLessThanOrEqual(result.maxFeePerGas);
    });

    it('should handle custom config with many tiers', () => {
      const manyTiersConfig: Partial<GasEscalatorConfig> = {
        escalationMultipliers: [1.0, 1.2, 1.4, 1.6, 1.8, 2.0],
      };
      const manyTierEscalator = new GasEscalator(manyTiersConfig);

      expect(manyTierEscalator.maxTiers).toBe(6);

      // Should be able to navigate all tiers
      for (let i = 0; i < 6; i++) {
        expect(manyTierEscalator.canEscalate()).toBe(i < 5);
        if (i < 5) {
          manyTierEscalator.nextTier();
        }
      }
    });

    it('should handle custom config with single tier', () => {
      const singleTierConfig: Partial<GasEscalatorConfig> = {
        escalationMultipliers: [1.0],
      };
      const singleTierEscalator = new GasEscalator(singleTierConfig);

      expect(singleTierEscalator.maxTiers).toBe(1);
      expect(singleTierEscalator.canEscalate()).toBe(false);
    });
  });
});
