/**
 * Gas Escalation Strategy for Flashbots Bundles
 *
 * This module provides a systematic approach to gas price escalation
 * for defensive transactions submitted via Flashbots bundles.
 *
 * The strategy uses a tiered escalation system with configurable premiums
 * over the attack transaction's gas parameters.
 */

/**
 * Gas strategy parameters for a single escalation tier
 */
export interface GasStrategy {
  /** Maximum fee per gas (base fee + priority fee) */
  maxFeePerGas: bigint;
  /** Maximum priority fee per gas (miner tip) */
  maxPriorityFeePerGas: bigint;
  /** Gas limit for the transaction */
  gasLimit: bigint;
  /** Current escalation tier (0-indexed) */
  escalationTier: number;
}

/**
 * Gas parameters extracted from an attack transaction
 */
export interface AttackTransactionGas {
  /** Maximum fee per gas from the attack transaction */
  maxFeePerGas: bigint;
  /** Maximum priority fee per gas from the attack transaction */
  maxPriorityFeePerGas: bigint;
  /** Gas price (legacy) or current base fee */
  gasPrice: bigint;
  /** Gas limit used by the attack transaction */
  gasLimit: bigint;
}

/**
 * Configuration options for the gas escalator
 */
export interface GasEscalatorConfig {
  /** Base premium percentage over attack gas (default: 15) */
  basePremium: number;
  /** Escalation multipliers for each tier (default: [1.0, 1.5, 2.0]) */
  escalationMultipliers: number[];
  /** Buffer percentage for gas limit overhead (default: 10) */
  gasLimitBuffer: number;
}

/**
 * Default configuration for gas escalation
 */
const DEFAULT_CONFIG: GasEscalatorConfig = {
  basePremium: 15, // 15% base premium
  escalationMultipliers: [1.0, 1.5, 2.0], // 15% -> 22.5% -> 30% effective premiums
  gasLimitBuffer: 10, // 10% buffer for pause transaction overhead
};

/**
 * Gas Escalator class for calculating escalating gas parameters
 *
 * This class implements a tiered gas escalation strategy to ensure
 * defensive transactions are prioritized over attack transactions
 * in the Flashbots bundle auction.
 */
export class GasEscalator {
  private readonly config: GasEscalatorConfig;
  private currentTier: number;

  /**
   * Create a new GasEscalator instance
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<GasEscalatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentTier = 0;
  }

  /**
   * Get the total number of escalation tiers available
   */
  get maxTiers(): number {
    return this.config.escalationMultipliers.length;
  }

  /**
   * Get the current escalation tier
   */
  get tier(): number {
    return this.currentTier;
  }

  /**
   * Reset to the first escalation tier
   */
  reset(): void {
    this.currentTier = 0;
  }

  /**
   * Calculate gas parameters for the current tier
   *
   * @param attackGas - Gas parameters from the attack transaction
   * @returns Gas strategy with calculated parameters for current tier
   */
  calculateGas(attackGas: AttackTransactionGas): GasStrategy {
    const multiplier = this.config.escalationMultipliers[this.currentTier];
    const effectivePremium = this.config.basePremium * multiplier;

    // Calculate max fee per gas with premium
    const maxFeePerGas = this.applyPremium(attackGas.maxFeePerGas, effectivePremium);

    // Calculate max priority fee per gas with premium
    let maxPriorityFeePerGas = this.applyPremium(
      attackGas.maxPriorityFeePerGas,
      effectivePremium
    );

    // Ensure maxPriorityFeePerGas doesn't exceed maxFeePerGas
    if (maxPriorityFeePerGas > maxFeePerGas) {
      maxPriorityFeePerGas = maxFeePerGas;
    }

    // Calculate gas limit with buffer for pause transaction overhead
    const gasLimit = this.applyPremium(attackGas.gasLimit, this.config.gasLimitBuffer);

    return {
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit,
      escalationTier: this.currentTier,
    };
  }

  /**
   * Calculate gas parameters for a specific tier
   *
   * @param attackGas - Gas parameters from the attack transaction
   * @param tier - The escalation tier to calculate for
   * @returns Gas strategy with calculated parameters for specified tier
   */
  calculateGasForTier(attackGas: AttackTransactionGas, tier: number): GasStrategy {
    if (tier < 0 || tier >= this.maxTiers) {
      throw new Error(`Tier ${tier} is out of bounds (0-${this.maxTiers - 1})`);
    }

    const originalTier = this.currentTier;
    this.currentTier = tier;
    const result = this.calculateGas(attackGas);
    this.currentTier = originalTier;

    return result;
  }

  /**
   * Move to the next escalation tier
   *
   * @returns The new tier number
   * @throws Error if already at maximum tier
   */
  nextTier(): number {
    if (!this.canEscalate()) {
      throw new Error(`Already at maximum tier (${this.maxTiers - 1})`);
    }

    this.currentTier++;
    return this.currentTier;
  }

  /**
   * Check if more escalation tiers are available
   *
   * @returns True if can escalate further, false otherwise
   */
  canEscalate(): boolean {
    return this.currentTier < this.maxTiers - 1;
  }

  /**
   * Apply a percentage premium to a bigint value
   *
   * @param value - The base value
   * @param premiumPercent - The premium percentage (e.g., 15 for 15%)
   * @returns The value with premium applied
   */
  private applyPremium(value: bigint, premiumPercent: number): bigint {
    const multiplier = BigInt(Math.floor((100 + premiumPercent) * 100));
    const divisor = 10000n; // 100 * 100 for precision
    return (value * multiplier) / divisor;
  }

  /**
   * Estimate effective premium percentage for a tier
   *
   * @param tier - The escalation tier
   * @returns Effective premium percentage
   */
  getEffectivePremium(tier: number): number {
    if (tier < 0 || tier >= this.maxTiers) {
      throw new Error(`Tier ${tier} is out of bounds (0-${this.maxTiers - 1})`);
    }

    const multiplier = this.config.escalationMultipliers[tier];
    return this.config.basePremium * multiplier;
  }

  /**
   * Get all escalation tier summaries
   *
   * @returns Array of tier information
   */
  getTierSummaries(): Array<{ tier: number; multiplier: number; effectivePremium: number }> {
    return this.config.escalationMultipliers.map((multiplier, index) => ({
      tier: index,
      multiplier,
      effectivePremium: this.config.basePremium * multiplier,
    }));
  }
}
