/**
 * Listener Factory — Create appropriate chain listeners based on chain name.
 * Supports Ethereum, Arbitrum, Optimism, Base, and Polygon.
 */

import { EthereumMempoolListener } from "./ethereum-mempool.js";
import { ArbitrumMempoolListener } from "./arbitrum-mempool.js";
import { OptimismMempoolListener } from "./optimism-mempool.js";
import { BaseMempoolListener } from "./base-mempool.js";
import { PolygonMempoolListener } from "./polygon-mempool.js";
import type { ChainConfig } from "../core/config-loader.js";
import type { BaseChainListener } from "./base.js";
import { logger } from "../utils/logger.js";

/**
 * Create a chain listener for the specified chain configuration.
 * Returns the appropriate listener implementation based on chain name.
 */
export function createChainListener(chainConfig: ChainConfig): BaseChainListener {
  const { name } = chainConfig;

  switch (name.toLowerCase()) {
    case "ethereum":
      logger.info({ chain: name }, "Creating Ethereum mempool listener");
      return new EthereumMempoolListener(chainConfig);

    case "arbitrum":
      logger.info({ chain: name }, "Creating Arbitrum mempool listener");
      return new ArbitrumMempoolListener(chainConfig);

    case "optimism":
      logger.info({ chain: name }, "Creating Optimism mempool listener");
      return new OptimismMempoolListener(chainConfig);

    case "base":
      logger.info({ chain: name }, "Creating Base mempool listener");
      return new BaseMempoolListener(chainConfig);

    case "polygon":
      logger.info({ chain: name }, "Creating Polygon mempool listener");
      return new PolygonMempoolListener(chainConfig);

    default:
      throw new Error(`Unsupported chain: ${name}. Supported chains: ethereum, arbitrum, optimism, base, polygon`);
  }
}

/**
 * Create listeners for all enabled chains in the configuration.
 * Returns an array of listener instances.
 */
export function createAllListeners(chainConfigs: ChainConfig[]): Map<string, BaseChainListener> {
  const listeners = new Map<string, BaseChainListener>();

  for (const chainConfig of chainConfigs) {
    if (!chainConfig.enabled) {
      logger.info({ chain: chainConfig.name }, "Chain is disabled, skipping listener creation");
      continue;
    }

    try {
      const listener = createChainListener(chainConfig);
      listeners.set(chainConfig.name, listener);
    } catch (error) {
      logger.error({ chain: chainConfig.name, err: error }, "Failed to create listener for chain");
      // Continue creating other listeners
    }
  }

  logger.info({ totalListeners: listeners.size }, "Created chain listeners");
  return listeners;
}
