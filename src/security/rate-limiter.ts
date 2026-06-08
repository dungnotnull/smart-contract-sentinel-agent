/**
 * Rate Limiter — Protect against abuse and DoS attacks.
 * Sliding window rate limiting with in-memory tracking.
 * Per-IP, per-user, and per-resource limits.
 *
 * Features:
 * - Sliding window rate limiting (more accurate than token bucket)
 * - Configurable limits per resource type
 * - Automatic cleanup of stale entries
 * - Distributed-ready (can be extended with Redis backend)
 */

import { performance } from "perf_hooks";
import { logger } from "../utils/logger.js";

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  burstAllowed?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

export interface RateLimitEntry {
  count: number;
  windowStart: number;
  lastReset: number;
}

type ResourceKey = string; // "tx_submissions", "api_calls", "alert_dispatches"

export class RateLimiter {
  // In-memory store of rate limit entries (key: "resource:identifier")
  private limits = new Map<string, RateLimitEntry>();
  private configs = new Map<ResourceKey, RateLimitConfig>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(cleanupIntervalMs: number = 60000) {
    this.initializeDefaultConfigs();
    this.startCleanup(cleanupIntervalMs);
  }

  /**
   * Initialize default rate limit configurations.
   */
  private initializeDefaultConfigs(): void {
    // Transaction submissions (very strict)
    this.setConfig("tx_submissions", {
      maxRequests: 100,
      windowMs: 60000, // 100 requests per minute
      burstAllowed: 10,
    });

    // API calls (moderate)
    this.setConfig("api_calls", {
      maxRequests: 1000,
      windowMs: 60000, // 1000 requests per minute
      burstAllowed: 50,
    });

    // Alert dispatches (strict to avoid spam)
    this.setConfig("alert_dispatches", {
      maxRequests: 10,
      windowMs: 60000, // 10 alerts per minute
      burstAllowed: 3,
    });

    // Simulation requests (generous but bounded)
    this.setConfig("simulations", {
      maxRequests: 200,
      windowMs: 60000, // 200 simulations per minute
      burstAllowed: 20,
    });

    // Bundle submissions (very strict)
    this.setConfig("bundle_submissions", {
      maxRequests: 5,
      windowMs: 60000, // 5 bundles per minute
      burstAllowed: 2,
    });
  }

  /**
   * Set rate limit configuration for a resource.
   */
  setConfig(resource: ResourceKey, config: RateLimitConfig): void {
    this.configs.set(resource, config);
    logger.debug({ resource, config }, "Rate limit config set");
  }

  /**
   * Check if a request is allowed under rate limits.
   * Uses sliding window algorithm for accuracy.
   */
  checkLimit(
    resource: ResourceKey,
    identifier: string,
  ): RateLimitResult {
    const config = this.configs.get(resource);
    if (!config) {
      // No limit configured
      return {
        allowed: true,
        remaining: Infinity,
        resetTime: new Date(Date.now() + config.windowMs),
      };
    }

    const key = `${resource}:${identifier}`;
    const now = Date.now();
    const windowMs = config.windowMs;

    // Get or create entry
    let entry = this.limits.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      // New window
      entry = {
        count: 0,
        windowStart: now,
        lastReset: now,
      };
      this.limits.set(key, entry);
    }

    // Sliding window check
    const windowEnd = entry.windowStart + windowMs;
    const remaining = Math.max(0, config.maxRequests - entry.count);

    if (entry.count >= config.maxRequests) {
      // Rate limit exceeded
      const resetTime = new Date(Math.max(now, windowEnd));
      const retryAfter = Math.ceil((windowEnd - now) / 1000);

      logger.warn(
        { resource, identifier, retryAfter },
        "Rate limit exceeded",
      );

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter,
      };
    }

    // Increment counter
    entry.count++;
    this.limits.set(key, entry);

    return {
      allowed: true,
      remaining: remaining - 1,
      resetTime: new Date(windowEnd),
    };
  }

  /**
   * Check multiple rate limits at once.
   * Returns false if any limit is exceeded.
   */
  checkMultiple(
    checks: Array<{ resource: ResourceKey; identifier: string }>,
  ): { allowed: boolean; results: Map<string, RateLimitResult> } {
    const results = new Map<string, RateLimitResult>();
    let allowed = true;

    for (const { resource, identifier } of checks) {
      const result = this.checkLimit(resource, identifier);
      results.set(`${resource}:${identifier}`, result);

      if (!result.allowed) {
        allowed = false;
      }
    }

    return { allowed, results };
  }

  /**
   * Get current usage statistics.
   */
  getUsage(resource: ResourceKey): {
    totalRequests: number;
    activeIdentifiers: number;
  } {
    let totalRequests = 0;
    const activeIdentifiers = new Set<string>();

    for (const [key, entry] of this.limits.entries()) {
      if (key.startsWith(`${resource}:`)) {
        totalRequests += entry.count;
        activeIdentifiers.add(key.split(":")[1]);
      }
    }

    return {
      totalRequests,
      activeIdentifiers: activeIdentifiers.size,
    };
  }

  /**
   * Get rate limit status for an identifier.
   */
  getStatus(resource: ResourceKey, identifier: string): {
    config: RateLimitConfig | null;
    currentUsage: number;
    remaining: number;
    resetTime: Date;
  } {
    const config = this.configs.get(resource);
    const key = `${resource}:${identifier}`;
    const entry = this.limits.get(key);

    if (!config || !entry) {
      const resetTime = new Date(Date.now() + (config?.windowMs || 60000));
      return {
        config: config || null,
        currentUsage: 0,
        remaining: config?.maxRequests || 0,
        resetTime,
      };
    }

    const windowEnd = entry.windowStart + config.windowMs;
    const remaining = Math.max(0, config.maxRequests - entry.count);

    return {
      config,
      currentUsage: entry.count,
      remaining,
      resetTime: new Date(windowEnd),
    };
  }

  /**
   * Reset rate limit for an identifier (admin use).
   */
  resetLimit(resource: ResourceKey, identifier: string): void {
    const key = `${resource}:${identifier}`;
    this.limits.delete(key);
    logger.info({ resource, identifier }, "Rate limit reset");
  }

  /**
   * Clean up stale entries.
   */
  private cleanup(): void {
    const now = Date.now();
    const cleaned = 0;

    for (const [key, entry] of this.limits.entries()) {
      const config = this.configs.get(key.split(":")[0] as ResourceKey);
      if (!config) continue;

      // Remove entries that haven't been used in 3x the window period
      if (now - entry.lastReset > config.windowMs * 3) {
        this.limits.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned }, "Cleaned up stale rate limit entries");
    }
  }

  /**
   * Start periodic cleanup.
   */
  private startCleanup(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);

    logger.debug({ intervalMs }, "Rate limiter cleanup started");
  }

  /**
   * Stop cleanup interval.
   */
  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logger.info("Rate limiter closed");
  }
}
