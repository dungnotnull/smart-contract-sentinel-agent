/**
 * AnvilInstance — Manages a single Anvil fork process.
 * Spawns, resets, health-checks, and kills an Anvil instance.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { logger } from "../utils/logger.js";
import { getAvailablePort } from "../utils/port.js";

export interface AnvilInstance {
  port: number;
  busy: boolean;
  process: ChildProcess;
  forkUrl: string;
}

let anvilPath = "anvil";

/** Set custom Anvil binary path */
export function setAnvilPath(path: string): void {
  anvilPath = path;
}

/** Spawn a new Anvil fork instance */
export async function spawnFork(forkUrl: string): Promise<AnvilInstance> {
  const port = await getAvailablePort();

  return new Promise((resolve, reject) => {
    const proc = spawn(anvilPath, [
      "--fork-url", forkUrl,
      "--port", String(port),
      "--silent",
    ], {
      stdio: "pipe",
      env: { ...process.env },
    });

    proc.on("error", (err) => {
      logger.error({ port, forkUrl, err }, "Anvil spawn failed");
      reject(err);
    });

    // Wait for Anvil to be ready (it prints "Listening on" when ready)
    const timeout = setTimeout(() => {
      logger.warn({ port, forkUrl }, "Anvil startup timeout — assuming ready");
      resolve({ port, busy: true, process: proc, forkUrl });
    }, 5000);

    proc.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      if (output.includes("Listening on") || output.includes("started")) {
        clearTimeout(timeout);
        resolve({ port, busy: true, process: proc, forkUrl });
      }
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0 && code !== null) {
        logger.error({ port, forkUrl, exitCode: code }, "Anvil process exited unexpectedly");
        reject(new Error(`Anvil exited with code ${code}`));
      }
    });
  });
}

/** Reset an Anvil fork to a specific block number */
export async function resetFork(instance: AnvilInstance, blockNumber: bigint): Promise<void> {
  try {
    const response = await fetch(`http://127.0.0.1:${instance.port}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "anvil_reset",
        params: [{ forking: { jsonRpcUrl: instance.forkUrl, blockNumber: Number(blockNumber) } }],
        id: 1,
      }),
    });
    await response.json();
    logger.debug({ port: instance.port, blockNumber: blockNumber.toString() }, "Anvil fork reset");
  } catch (error) {
    logger.error({ port: instance.port, blockNumber: blockNumber.toString(), err: error }, "Anvil fork reset failed");
  }
}

/** Kill an Anvil fork process */
export function killFork(instance: AnvilInstance): void {
  instance.process.kill("SIGTERM");
  instance.busy = false;
  logger.debug({ port: instance.port }, "Anvil fork killed");
}

/** Check if an Anvil fork is healthy */
export async function isHealthy(instance: AnvilInstance): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${instance.port}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
    });
    const data = await response.json() as { result?: string };
    return data.result !== undefined;
  } catch {
    return false;
  }
}