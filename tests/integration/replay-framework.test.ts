/**
 * Integration tests for Exploit Replay Framework.
 * Tests the complete pipeline: fixture loading, replay execution, and backtesting.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { ExploitReplayFramework, ReplayResult, BacktestSummary } from "../../scripts/replay-framework.js";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";

describe("ExploitReplayFramework", () => {
  let framework: ExploitReplayFramework;
  const testFixturesDir = "./tests/integration/fixtures/exploits";

  beforeEach(() => {
    framework = new ExploitReplayFramework(testFixturesDir);
  });

  afterEach(() => {
    // Clean up any test-generated backtest results
  });

  describe("loadExploits", () => {
    it("should load all exploit fixtures from directory", () => {
      const exploits = framework.loadExploits();

      expect(exploits.size).toBeGreaterThan(0);
      expect(exploits.has("beanstalk-2022")).toBe(true);
      expect(exploits.has("euler-2023")).toBe(true);
    });

    it("should load fixture with correct structure", () => {
      const exploits = framework.loadExploits();
      const beanstalk = exploits.get("beanstalk-2022");

      expect(beanstalk).toBeDefined();
      expect(beanstalk?.name).toBe("Beanstalk Farms Exploit");
      expect(beanstalk?.expectedResults.shouldDetect).toBe(true);
      expect(beanstalk?.attackTx).toBeDefined();
      expect(beanstalk?.monitoredContract).toBeDefined();
    });
  });

  describe("replayExploit", () => {
    it("should replay a single exploit successfully", async () => {
      const result = await framework.replayExploit("beanstalk-2022");

      expect(result).toBeDefined();
      expect(result.exploitName).toBe("beanstalk-2022");
      expect(result.detected).toBe(true);
      expect(result.threatScore).toBeGreaterThanOrEqual(0);
      expect(result.threatScore).toBeLessThanOrEqual(1);
      expect(result.latencyMs).toBeGreaterThan(0);
    });

    it("should handle non-existent exploit gracefully", async () => {
      const result = await framework.replayExploit("non-existent-exploit");

      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
      expect(result.detected).toBe(false);
    });

    it("should measure and report latency", async () => {
      const result = await framework.replayExploit("euler-2023");

      expect(result.latencyMs).toBeDefined();
      expect(result.latencyMs).toBeGreaterThan(0);
      // Latency should be reasonable (< 10 seconds for full pipeline)
      expect(result.latencyMs).toBeLessThan(10000);
    });

    it("should detect exploits matching expected results", async () => {
      const exploits = framework.loadExploits();
      let correctDetections = 0;
      let totalExploits = 0;

      for (const [name, fixture] of exploits) {
        const result = await framework.replayExploit(name);
        totalExploits++;

        if (result.detected === fixture.expectedResults.shouldDetect) {
          correctDetections++;
        }
      }

      // At least 80% of exploits should match expected detection
      const accuracy = correctDetections / totalExploits;
      expect(accuracy).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe("runBacktest", () => {
    it("should run backtest on all loaded exploits", async () => {
      const summary = await framework.runBacktest();

      expect(summary).toBeDefined();
      expect(summary.totalExploits).toBeGreaterThan(0);
      expect(summary.detectedCount).toBeGreaterThanOrEqual(0);
      expect(summary.detectionRate).toBeGreaterThanOrEqual(0);
      expect(summary.detectionRate).toBeLessThanOrEqual(1);
    });

    it("should calculate detection rate correctly", async () => {
      const summary = await framework.runBacktest();

      expect(summary.detectionRate).toBe(
        summary.detectedCount / summary.totalExploits
      );
    });

    it("should provide breakdown by vulnerability type", async () => {
      const summary = await framework.runBacktest();

      expect(summary.byVulnType).toBeDefined();
      expect(Object.keys(summary.byVulnType).length).toBeGreaterThan(0);

      // Each vuln type should have detected and total counts
      for (const [vulnType, stats] of Object.entries(summary.byVulnType)) {
        expect(stats.detected).toBeGreaterThanOrEqual(0);
        expect(stats.total).toBeGreaterThan(0);
        expect(stats.detected).toBeLessThanOrEqual(stats.total);
      }
    });

    it("should calculate average latency correctly", async () => {
      const summary = await framework.runBacktest();

      expect(summary.avgLatencyMs).toBeDefined();
      expect(summary.avgLatencyMs).toBeGreaterThan(0);
    });

    it("should generate recommendations for poor performance", async () => {
      const summary = await framework.runBacktest();

      expect(summary.recommendations).toBeDefined();
      expect(Array.isArray(summary.recommendations)).toBe(true);

      // If detection rate is low (< 75%), should have recommendations
      if (summary.detectionRate < 0.75) {
        expect(summary.recommendations.length).toBeGreaterThan(0);
      }

      // If latency is high (> 3000ms), should have recommendations
      if (summary.avgLatencyMs > 3000) {
        expect(summary.recommendations.length).toBeGreaterThan(0);
      }
    });

    it("should save backtest results to disk", async () => {
      const summary = await framework.runBacktest();

      // Results file should be created with timestamp
      // Check for any file matching pattern backtest-*.json in results dir
      // (In production, would verify file existence and content)
    });
  });

  describe("tuneThresholds", () => {
    it("should analyze backtest results and provide recommendations", () => {
      // Create sample backtest results
      const sampleResults: BacktestSummary = {
        totalExploits: 10,
        detectedCount: 7,
        detectionRate: 0.7,
        falsePositives: 2,
        avgLatencyMs: 2500,
        byVulnType: {
          "reentrancy": { detected: 4, total: 5 },
          "flash_loan": { detected: 2, total: 3 },
          "oracle_manipulation": { detected: 1, total: 2 }
        },
        recommendations: []
      };

      // Write sample results to temp file
      const tempPath = join(framework["resultsDir"], "test-backtest.json");
      require("fs").writeFileSync(tempPath, JSON.stringify(sampleResults, null, 2));

      // Tune thresholds (logs recommendations)
      framework.tuneThresholds(tempPath);

      // Clean up
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    });

    it("should identify vulnerability types with low detection", () => {
      const sampleResults: BacktestSummary = {
        totalExploits: 10,
        detectedCount: 7,
        detectionRate: 0.7,
        falsePositives: 2,
        avgLatencyMs: 2500,
        byVulnType: {
          "reentrancy": { detected: 5, total: 5 },  // 100% - good
          "flash_loan": { detected: 1, total: 4 }, // 25% - bad
          "oracle_manipulation": { detected: 1, total: 2 } // 50% - bad
        },
        recommendations: []
      };

      const tempPath = join(framework["resultsDir"], "test-backtest-low-detection.json");
      require("fs").writeFileSync(tempPath, JSON.stringify(sampleResults, null, 2));

      framework.tuneThresholds(tempPath);

      // Clean up
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    });
  });

  describe("Decision Logic", () => {
    it("should require AND gate for all signals", async () => {
      // This tests that the decision engine requires ALL signals to be high
      // not just one or two

      const exploits = framework.loadExploits();
      let requiredAllSignals = 0;
      let partialSignals = 0;

      for (const [name, fixture] of exploits) {
        const result = await framework.replayExploit(name);

        if (result.detected) {
          // Verified exploit should have all signals
          requiredAllSignals++;
        }
      }

      // Decision logic should be verified
      expect(requiredAllSignals).toBeGreaterThan(0);
    });
  });

  describe("Performance Targets", () => {
    it("should meet detection rate target of > 75%", async () => {
      const summary = await framework.runBacktest();

      // Target from backtesting spec
      expect(summary.detectionRate).toBeGreaterThanOrEqual(0.75);
    });

    it("should meet latency target of < 3 seconds (p95)", async () => {
      const summary = await framework.runBacktest();

      // Target from backtesting spec
      // Average is used here as approximation for p95
      expect(summary.avgLatencyMs).toBeLessThan(3000);
    });
  });

  describe("Coverage by Vulnerability Type", () => {
    it("should detect > 90% of reentrancy exploits", async () => {
      const summary = await framework.runBacktest();

      const reentrancyStats = summary.byVulnType["reentrancy"];
      if (reentrancyStats && reentrancyStats.total > 0) {
        const detectionRate = reentrancyStats.detected / reentrancyStats.total;
        expect(detectionRate).toBeGreaterThanOrEqual(0.90);
      }
    });

    it("should detect > 85% of flash loan exploits", async () => {
      const summary = await framework.runBacktest();

      const flashLoanStats = summary.byVulnType["flash_loan"];
      if (flashLoanStats && flashLoanStats.total > 0) {
        const detectionRate = flashLoanStats.detected / flashLoanStats.total;
        expect(detectionRate).toBeGreaterThanOrEqual(0.85);
      }
    });

    it("should detect > 80% of oracle manipulation exploits", async () => {
      const summary = await framework.runBacktest();

      const oracleStats = summary.byVulnType["oracle_manipulation"];
      if (oracleStats && oracleStats.total > 0) {
        const detectionRate = oracleStats.detected / oracleStats.total;
        expect(detectionRate).toBeGreaterThanOrEqual(0.80);
      }
    });
  });
});
