/**
 * SmartSentinel — Real-time, multi-chain autonomous defense agent
 * Entry point: CLI + daemon startup
 */

import { loadConfig } from "./core/config-loader.js";
import { logger } from "./utils/logger.js";
import { Sentinel } from "./core/sentinel.js";

const sentinel = new Sentinel();

async function main(): Promise<void> {
  logger.info("SmartSentinel starting...");
  logger.info(`Node environment: ${process.env.NODE_ENV ?? "development"}`);
  logger.info(`Auto-pause enabled: ${process.env.AUTO_PAUSE_ENABLED ?? "false"}`);
  logger.info(`Dry run mode: ${process.env.DRY_RUN ?? "true"}`);

  try {
    const config = await loadConfig();
    const chainNames = config.chains.filter((c) => c.enabled).map((c) => c.name);
    logger.info({ chains: chainNames, contracts: config.contracts.length }, "Configuration loaded successfully");

    // Start the sentinel daemon
    await sentinel.start();

    logger.info("SmartSentinel initialized. Press Ctrl+C to stop.");

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, "Received shutdown signal");
      await sentinel.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));

    // Prevent unhandled promise rejections from crashing
    process.on("unhandledRejection", (reason) => {
      logger.error({ err: reason }, "Unhandled promise rejection");
    });

  } catch (error) {
    logger.error({ err: error }, "Failed to start SmartSentinel");
    process.exit(1);
  }
}

main();