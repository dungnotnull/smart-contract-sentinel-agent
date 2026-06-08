import { beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';

/**
 * Integration test setup
 *
 * This file handles global test configuration for integration tests:
 * - Anvil fork pool initialization
 * - GNN server availability checks
 * - Test environment setup
 */

let anvilProcesses: ChildProcess[] = [];

interface TestConfig {
  anvilForkUrl: string;
  gnnsServerUrl: string;
  mockRpcUrl: string;
  testPrivateKey: string;
  testContracts: {
    beanstalk: string;
    euler: string;
    saddle: string;
  };
}

export const testConfig: TestConfig = {
  // Use local Anvil fork for testing
  anvilForkUrl: process.env.ANVIL_FORK_URL || 'http://localhost:8545',

  // GNN inference server
  gnnsServerUrl: process.env.GNN_SERVER_URL || 'http://localhost:8765',

  // Mock RPC for tests that don't need real blockchain data
  mockRpcUrl: process.env.MOCK_RPC_URL || 'http://localhost:8546',

  // Test account (from Anvil's default accounts)
  testPrivateKey: process.env.TEST_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',

  // Historical exploit contract addresses
  testContracts: {
    beanstalk: '0x1F7322EF0CC65649aBA49A68e119436bb9F8B3D3', // Beanstalk Farms
    euler: '0x3088C81D0ED971A099Aa039b35F1E7363A2b5C3C', // Euler Finance
    saddle: '0xfE45AdA8bc2709A797Bd464186E38f6E6f8781E8', // Saddle Finance
  },
};

/**
 * Setup before all integration tests
 */
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce noise in test output

  // Verify Anvil is available (if tests require it)
  const anvilAvailable = await checkServiceAvailable(testConfig.anvilForkUrl);
  if (!anvilAvailable) {
    console.warn('⚠️  Anvil not available. Some integration tests may fail.');
    console.warn('   Start Anvil with: anvil --fork-url https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY');
  }

  // Verify GNN server is available (if tests require it)
  const gnnAvailable = await checkServiceAvailable(testConfig.gnnsServerUrl);
  if (!gnnAvailable) {
    console.warn('⚠️  GNN server not available. ML tests will be skipped.');
    console.warn('   Start GNN server with: python ml-pipeline/serve.py');
  }
});

/**
 * Cleanup after all integration tests
 */
afterAll(() => {
  // Clean up any Anvil processes we started
  anvilProcesses.forEach(proc => {
    if (!proc.killed) {
      proc.kill();
    }
  });
  anvilProcesses = [];
});

/**
 * Check if a service is available at the given URL
 */
async function checkServiceAvailable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Spawn a new Anvil fork for testing
 */
export function spawnAnvilFork(forkUrl?: string, port?: number): ChildProcess {
  const args = [
    '--host', '127.0.0.1',
    '--port', String(port || 8545),
    '--block-time', '1', // Faster block time for testing
    '--chain-id', '1',
  ];

  if (forkUrl) {
    args.push('--fork-url', forkUrl);
  }

  const anvil = spawn('anvil', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  anvilProcesses.push(anvil);
  return anvil;
}

/**
 * Sleep utility for tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
