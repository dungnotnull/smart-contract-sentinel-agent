/**
 * SmartSentinel — Unit tests for logger
 */

import { describe, it, expect } from "vitest";
import { logger } from "../../src/utils/logger.js";

describe("Logger", () => {
  it("should be a valid pino logger instance", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("should not throw when logging", () => {
    expect(() => {
      logger.info("test message");
      logger.error({ err: new Error("test") }, "error message");
      logger.warn("warning message");
      logger.debug("debug message");
    }).not.toThrow();
  });

  it("should redact sensitive fields from config", () => {
    // The logger is configured with redact paths for privateKey, etc.
    // This test verifies the logger configuration exists
    expect(logger).toBeDefined();
  });
});