/**
 * Tests for Listener Factory
 */

import { describe, it, expect } from "vitest";
import { createChainListener, createAllListeners } from "../../src/listeners/listener-factory.js";
import type { ChainConfig } from "../../src/core/config-loader.js";
import { EthereumMempoolListener } from "../../src/listeners/ethereum-mempool.js";
import { ArbitrumMempoolListener } from "../../src/listeners/arbitrum-mempool.js";
import { OptimismMempoolListener } from "../../src/listeners/optimism-mempool.js";
import { BaseMempoolListener } from "../../src/listeners/base-mempool.js";
import { PolygonMempoolListener } from "../../src/listeners/polygon-mempool.js";

describe("ListenerFactory", () => {
  const createMockChainConfig = (name: string, chainId: number): ChainConfig => ({
    name,
    chainId,
    rpcEndpoints: [
      { name: "rpc1", url: "https://rpc1.example.com" },
      { name: "rpc2", url: "https://rpc2.example.com" },
      { name: "rpc3", url: "https://rpc3.example.com" },
    ],
    nativeToken: "ETH",
    enabled: true,
  });

  it("should create Ethereum listener for ethereum chain", () => {
    const config = createMockChainConfig("ethereum", 1);
    const listener = createChainListener(config);

    expect(listener).toBeInstanceOf(EthereumMempoolListener);
  });

  it("should create Arbitrum listener for arbitrum chain", () => {
    const config = createMockChainConfig("arbitrum", 42161);
    const listener = createChainListener(config);

    expect(listener).toBeInstanceOf(ArbitrumMempoolListener);
  });

  it("should create Optimism listener for optimism chain", () => {
    const config = createMockChainConfig("optimism", 10);
    const listener = createChainListener(config);

    expect(listener).toBeInstanceOf(OptimismMempoolListener);
  });

  it("should create Base listener for base chain", () => {
    const config = createMockChainConfig("base", 8453);
    const listener = createChainListener(config);

    expect(listener).toBeInstanceOf(BaseMempoolListener);
  });

  it("should create Polygon listener for polygon chain", () => {
    const config = createMockChainConfig("polygon", 137);
    const listener = createChainListener(config);

    expect(listener).toBeInstanceOf(PolygonMempoolListener);
  });

  it("should be case-insensitive for chain names", () => {
    const config = createMockChainConfig("ETHEREUM", 1);
    const listener = createChainListener(config);

    expect(listener).toBeInstanceOf(EthereumMempoolListener);
  });

  it("should throw error for unsupported chain", () => {
    const config = createMockChainConfig("unsupported", 999);

    expect(() => createChainListener(config)).toThrow("Unsupported chain: unsupported");
  });

  it("should create listeners for all enabled chains", () => {
    const configs: ChainConfig[] = [
      createMockChainConfig("ethereum", 1),
      createMockChainConfig("arbitrum", 42161),
      createMockChainConfig("optimism", 10),
      { ...createMockChainConfig("base", 8453), enabled: false }, // Disabled
    ];

    const listeners = createAllListeners(configs);

    expect(listeners.size).toBe(3); // Only enabled chains
    expect(listeners.has("ethereum")).toBe(true);
    expect(listeners.has("arbitrum")).toBe(true);
    expect(listeners.has("optimism")).toBe(true);
    expect(listeners.has("base")).toBe(false); // Disabled
  });

  it("should return empty map when no chains enabled", () => {
    const configs: ChainConfig[] = [
      { ...createMockChainConfig("ethereum", 1), enabled: false },
      { ...createMockChainConfig("arbitrum", 42161), enabled: false },
    ];

    const listeners = createAllListeners(configs);

    expect(listeners.size).toBe(0);
  });
});
