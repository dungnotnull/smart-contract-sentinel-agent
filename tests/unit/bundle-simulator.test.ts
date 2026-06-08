/**
 * Unit tests for Bundle Simulator
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

describe("BundleSimulator", () => {
  let simulator: any;
  let mockEstimateGas: any;
  let mockGetBlockNumber: any;
  let mockDestroy: any;
  let mockTransactionFrom: any;
  const TEST_RPC_URL = "https://eth.example.com/rpc";

  // Mock ethers module
  vi.mock("ethers", async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...(actual as any),
      JsonRpcProvider: vi.fn().mockImplementation(() => ({
        estimateGas: vi.fn(),
        getBlockNumber: vi.fn(),
        destroy: vi.fn(),
      })),
      Transaction: {
        from: vi.fn(),
      },
    };
  });

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Import after mocking
    const { BundleSimulator: BundleSimulatorClass } = await import("../../src/response/bundle-simulator");
    const ethersModule = await import("ethers");

    // Create simulator instance
    simulator = new BundleSimulatorClass(TEST_RPC_URL);

    // Get the provider that was created (last call)
    const mockCalls = (ethersModule as any).JsonRpcProvider.mock.calls;
    if (mockCalls.length > 0) {
      const providerInstance = (ethersModule as any).JsonRpcProvider.mock.results[(ethersModule as any).JsonRpcProvider.mock.results.length - 1]?.value;
      if (providerInstance) {
        mockEstimateGas = providerInstance.estimateGas;
        mockGetBlockNumber = providerInstance.getBlockNumber;
        mockDestroy = providerInstance.destroy;
        mockTransactionFrom = (ethersModule as any).Transaction.from;
      }
    }
  });

  describe("Constructor and Initialization", () => {
    it("should create instance with RPC URL", () => {
      expect(simulator).toBeDefined();
    });

    it("should initialize JsonRpcProvider with correct URL", async () => {
      const ethersModule = await import("ethers");
      expect((ethersModule as any).JsonRpcProvider).toHaveBeenCalledWith(TEST_RPC_URL);
    });
  });

  describe("getCurrentBlockNumber", () => {
    it("should return current block number", async () => {
      const mockBlockNumber = 12345;
      mockGetBlockNumber.mockResolvedValue(mockBlockNumber);

      const blockNumber = await simulator.getCurrentBlockNumber();

      expect(blockNumber).toBe(mockBlockNumber);
      expect(mockGetBlockNumber).toHaveBeenCalledTimes(1);
    });

    it("should throw error when provider fails", async () => {
      mockGetBlockNumber.mockRejectedValue(new Error("RPC connection failed"));

      await expect(simulator.getCurrentBlockNumber()).rejects.toThrow("Failed to get current block number");
    });
  });

  describe("simulateBundle", () => {
    const mockSignedTx1 = "0x02f8b0108405bd1b008505f5e1008302faf4940000000000000000000000000000000000001";
    const mockSignedTx2 = "0x02f8b0108405bd1b008505f5e1008302faf4940000000000000000000000000000000000002";
    const mockSignedTx3 = "0x02f80108405bd1b008505f5e1008302faf4940000000000000000000000000000000000003";

    beforeEach(() => {
      mockGetBlockNumber.mockResolvedValue(10000);
      mockTransactionFrom.mockImplementation((signedTx: string) => {
        if (signedTx.includes("0001")) {
          return {
            hash: "0xabc0001",
            to: "0x0000000000000000000000000000000000000001",
            from: "0x1234567890123456789012345678901234567890",
            data: "0x123456",
            value: 0n,
            gasLimit: 100000n,
            gasPrice: 1000000000n,
          };
        }
        if (signedTx.includes("0002")) {
          return {
            hash: "0xabc0002",
            to: "0x0000000000000000000000000000000000000002",
            from: "0x1234567890123456789012345678901234567890",
            data: "0x789abc",
            value: 1000000n,
            gasLimit: 150000n,
            gasPrice: 2000000000n,
          };
        }
        return {
          hash: "0xabc0003",
          to: "0x0000000000000000000000000000000000000003",
          from: "0x1234567890123456789012345678901234567890",
          data: "0xdef000",
          value: 0n,
          gasLimit: 200000n,
          gasPrice: 3000000000n,
        };
      });
    });

    it("should simulate successful bundle with multiple transactions", async () => {
      mockEstimateGas.mockResolvedValue(50000n);

      const result = await simulator.simulateBundle([mockSignedTx1, mockSignedTx2]);

      expect(result.success).toBe(true);
      expect(result.revertReason).toBeNull();
      expect(result.gasUsed).toBe(100000n);
      expect(result.estimatedBlockNumber).toBe(10001);
      expect(result.txResults).toHaveLength(2);
    });

    it("should simulate single transaction successfully", async () => {
      mockEstimateGas.mockResolvedValue(75000n);

      const result = await simulator.simulateBundle([mockSignedTx1]);

      expect(result.success).toBe(true);
      expect(result.gasUsed).toBe(75000n);
      expect(result.txResults).toHaveLength(1);
    });

    it("should stop simulation on first failing transaction", async () => {
      mockEstimateGas.mockResolvedValueOnce(50000n);
      mockEstimateGas.mockRejectedValueOnce(new Error("execution reverted: insufficient balance"));

      const result = await simulator.simulateBundle([mockSignedTx1, mockSignedTx2, mockSignedTx3]);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe("execution reverted: insufficient balance");
      expect(result.gasUsed).toBe(50000n);
      expect(result.txResults).toHaveLength(2);
      expect(result.txResults[0].success).toBe(true);
      expect(result.txResults[1].success).toBe(false);
    });

    it("should fail on first transaction error", async () => {
      mockEstimateGas.mockRejectedValue(new Error("out of gas"));

      const result = await simulator.simulateBundle([mockSignedTx1]);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe("out of gas");
      expect(result.gasUsed).toBe(0n);
    });

    it("should handle empty bundle array", async () => {
      const result = await simulator.simulateBundle([]);

      expect(result.success).toBe(true);
      expect(result.gasUsed).toBe(0n);
      expect(result.txResults).toHaveLength(0);
    });

    it("should parse revert reason from execution reverted error", async () => {
      const error = new Error('execution reverted: reason="Ownable: caller is not the owner"');
      mockEstimateGas.mockRejectedValue(error);

      const result = await simulator.simulateBundle([mockSignedTx1]);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe("execution reverted: Ownable: caller is not the owner");
    });

    it("should parse out of gas revert reason", async () => {
      mockEstimateGas.mockRejectedValue(new Error("Transaction execution ran out of gas"));

      const result = await simulator.simulateBundle([mockSignedTx1]);

      expect(result.revertReason).toBe("out of gas");
    });

    it("should parse insufficient funds revert reason", async () => {
      mockEstimateGas.mockRejectedValue(new Error("insufficient funds for transfer"));

      const result = await simulator.simulateBundle([mockSignedTx1]);

      expect(result.revertReason).toBe("insufficient funds");
    });

    it("should parse nonce errors", async () => {
      mockEstimateGas.mockRejectedValue(new Error("transaction nonce is too low"));

      const result = await simulator.simulateBundle([mockSignedTx1]);

      expect(result.revertReason).toBe("invalid nonce");
    });

    it("should handle non-Error error objects", async () => {
      mockEstimateGas.mockRejectedValue("string error message");

      const result = await simulator.simulateBundle([mockSignedTx1]);

      expect(result.revertReason).toBe("string error message");
    });

    it("should sum gas used correctly across multiple transactions", async () => {
      mockEstimateGas
        .mockResolvedValueOnce(45000n)
        .mockResolvedValueOnce(67000n)
        .mockResolvedValueOnce(23000n);

      const result = await simulator.simulateBundle([mockSignedTx1, mockSignedTx2, mockSignedTx3]);

      expect(result.success).toBe(true);
      expect(result.gasUsed).toBe(135000n);
    });
  });

  describe("close", () => {
    it("should close provider connection", async () => {
      mockDestroy.mockResolvedValue(undefined);

      await simulator.close();

      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it("should handle close errors gracefully", async () => {
      mockDestroy.mockRejectedValue(new Error("Provider close error"));

      await expect(simulator.close()).resolves.toBeUndefined();
    });
  });

  describe("Integration Scenarios", () => {
    const mockTx1 = "0x02f8b0108405bd1b008505f5e1008302faf4940000000000000000000000000000000000001";
    const mockTx2 = "0x02f8b0108405bd1b008505f5e1008302faf4940000000000000000000000000000000000002";
    const mockTx3 = "0x02f80108405bd1b008505f5e1008302faf4940000000000000000000000000000000000003";

    beforeEach(() => {
      mockGetBlockNumber.mockResolvedValue(20000);
      mockTransactionFrom.mockImplementation((signedTx: string) => ({
        hash: `0x${signedTx.slice(10, 20)}`,
        to: "0x0000000000000000000000000000000000000001",
        from: "0x1234567890123456789012345678901234567890",
        data: "0x",
        value: 0n,
        gasLimit: 100000n,
        gasPrice: 1000000000n,
      }));
    });

    it("should handle realistic multi-transaction bundle simulation", async () => {
      mockEstimateGas
        .mockResolvedValueOnce(21000n)
        .mockResolvedValueOnce(85000n)
        .mockResolvedValueOnce(21000n);

      const result = await simulator.simulateBundle([mockTx1, mockTx2, mockTx3]);

      expect(result.success).toBe(true);
      expect(result.gasUsed).toBe(127000n);
      expect(result.estimatedBlockNumber).toBe(20001);
      expect(result.txResults).toHaveLength(3);
    });

    it("should detect failure in middle of complex bundle", async () => {
      mockEstimateGas
        .mockResolvedValueOnce(21000n)
        .mockRejectedValueOnce(new Error("execution reverted: SafeMath: subtraction overflow"))
        .mockResolvedValueOnce(21000n);

      const result = await simulator.simulateBundle([mockTx1, mockTx2, mockTx3]);

      expect(result.success).toBe(false);
      expect(result.revertReason).toBe("execution reverted: SafeMath: subtraction overflow");
      expect(mockEstimateGas).toHaveBeenCalledTimes(2);
    });

    it("should handle bundle with varying gas costs", async () => {
      mockEstimateGas
        .mockResolvedValueOnce(45000n)
        .mockResolvedValueOnce(125000n)
        .mockResolvedValueOnce(67000n)
        .mockResolvedValueOnce(23000n);

      const result = await simulator.simulateBundle([mockTx1, mockTx2, mockTx3, mockTx1]);

      expect(result.success).toBe(true);
      expect(result.gasUsed).toBe(260000n);
      expect(result.txResults).toHaveLength(4);
    });
  });
});
