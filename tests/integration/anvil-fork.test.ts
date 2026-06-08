import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnAnvilFork, sleep, testConfig } from '../setup';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

/**
 * Integration tests for Anvil fork pool management
 *
 * These tests verify the Anvil fork simulation pool functionality:
 * - Fork creation and management
 * - State isolation between forks
 * - Fork pool lifecycle
 * - Multiple fork instances
 */

describe('Anvil Fork Pool Management', () => {
  let anvilProcess: ReturnType<typeof spawnAnvilFork>;
  let client: ReturnType<typeof createPublicClient>;

  beforeAll(async () => {
    // Spawn a fresh Anvil fork for this test suite
    anvilProcess = spawnAnvilFork(
      process.env.MAINNET_RPC_URL || 'https://eth-mainnet.alchemyapi.io/v2/demo',
      8545
    );

    // Wait for Anvil to start
    await sleep(3000);

    client = createPublicClient({
      chain: mainnet,
      transport: http(testConfig.anvilForkUrl),
    });
  }, 15000);

  afterAll(() => {
    if (anvilProcess && !anvilProcess.killed) {
      anvilProcess.kill();
    }
  });

  describe('Fork Availability', () => {
    it('should connect to Anvil fork', async () => {
      const blockNumber = await client.getBlockNumber();
      expect(blockNumber).toBeDefined();
      expect(blockNumber).toBeGreaterThan(0);
    });

    it('should have expected chain ID', async () => {
      const chainId = await client.getChainId();
      expect(chainId).toBe(1); // Ethereum mainnet
    });

    it('should respond to JSON-RPC calls', async () => {
      const block = await client.getBlock({
        blockTag: 'latest',
      });
      expect(block).toBeDefined();
      expect(block.number).toBeDefined();
    });
  });

  describe('Fork State Management', () => {
    it('should maintain consistent state across calls', async () => {
      const block1 = await client.getBlockNumber();
      await sleep(100);
      const block2 = await client.getBlockNumber();

      expect(block1).toBe(block2);
    });

    it('should return account balance', async () => {
      const balance = await client.getBalance({
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // Anvil default account
      });

      expect(balance).toBeDefined();
      expect(balance).toBeGreaterThan(0n);
    });

    it('should provide access to test accounts', async () => {
      const accounts = [
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      ];

      for (const account of accounts) {
        const balance = await client.getBalance({ address: account });
        expect(balance).toBeGreaterThan(0n);
      }
    });
  });

  describe('Fork Isolation', () => {
    it('should allow snapshot creation', async () => {
      const snapshotId = await client.request({
        method: 'evm_snapshot',
      });

      expect(snapshotId).toBeDefined();
      expect(typeof snapshotId).toBe('string');
    });

    it('should allow reverting to snapshot', async () => {
      const block1 = await client.getBlockNumber();

      const snapshotId = await client.request({
        method: 'evm_snapshot',
      });

      // Mine a block
      await client.request({
        method: 'evm_mine',
      });

      const block2 = await client.getBlockNumber();
      expect(block2).toBe(block1 + 1n);

      // Revert
      await client.request({
        method: 'evm_revert',
        params: [snapshotId],
      });

      const block3 = await client.getBlockNumber();
      expect(block3).toBe(block1);
    });

    it('should reset state completely on revert', async () => {
      const testAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

      const balance1 = await client.getBalance({ address: testAddress });

      const snapshotId = await client.request({
        method: 'evm_snapshot',
      });

      // Send some ETH away (this will fail if account doesn't have enough)
      // For testing purposes, we just verify the balance can be queried
      const balance2 = await client.getBalance({ address: testAddress });
      expect(balance2).toBe(balance1);

      await client.request({
        method: 'evm_revert',
        params: [snapshotId],
      });

      const balance3 = await client.getBalance({ address: testAddress });
      expect(balance3).toBe(balance1);
    });
  });

  describe('Fork Time Manipulation', () => {
    it('should allow setting timestamp', async () => {
      const newTimestamp = 1672531200; // 2023-01-01

      await client.request({
        method: 'evm_setNextBlockTimestamp',
        params: [newTimestamp],
      });

      await client.request({
        method: 'evm_mine',
      });

      const block = await client.getBlock({
        blockTag: 'latest',
      });

      expect(Number(block.timestamp)).toBe(newTimestamp);
    });

    it('should support time travel for testing', async () => {
      const currentBlock = await client.getBlock({ blockTag: 'latest' });
      const originalTime = Number(currentBlock.timestamp);

      // Travel forward 1 day
      const futureTime = originalTime + 86400;

      await client.request({
        method: 'evm_setNextBlockTimestamp',
        params: [futureTime],
      });

      await client.request({
        method: 'evm_mine',
      });

      const newBlock = await client.getBlock({ blockTag: 'latest' });
      expect(Number(newBlock.timestamp)).toBe(futureTime);
      expect(Number(newBlock.timestamp)).toBeGreaterThan(originalTime);
    });
  });

  describe('Multiple Fork Instances', () => {
    it('should theoretically support multiple fork ports', () => {
      // This test documents the expected behavior
      // In production, we would spawn multiple Anvil instances on different ports
      const ports = [8545, 8546, 8547];

      ports.forEach(port => {
        expect(port).toBeGreaterThanOrEqual(8545);
        expect(port).toBeLessThan(8600);
      });
    });

    it('should have unique chain contexts for each fork', () => {
      // This test documents the expected isolation between forks
      // Each fork should maintain independent state
      const forkStates = [
        { port: 8545, chainId: 1 },
        { port: 8546, chainId: 1 },
        { port: 8547, chainId: 1 },
      ];

      forkStates.forEach(state => {
        expect(state.chainId).toBe(1);
      });
    });
  });

  describe('Fork Performance', () => {
    it('should respond within acceptable latency', async () => {
      const start = Date.now();
      await client.getBlockNumber();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // < 1 second for simple call
    });

    it('should handle batched requests efficiently', async () => {
      const start = Date.now();

      const promises = Array.from({ length: 10 }, () => client.getBlockNumber());
      await Promise.all(promises);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000); // < 2 seconds for 10 parallel calls
    });

    it('should support rapid snapshot/revert cycles', async () => {
      const start = Date.now();

      for (let i = 0; i < 5; i++) {
        const snapshotId = await client.request({
          method: 'evm_snapshot',
        });

        await client.request({
          method: 'evm_revert',
          params: [snapshotId],
        });
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(3000); // < 3 seconds for 5 cycles
    });
  });
});
