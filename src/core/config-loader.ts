import { z } from "zod";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { resolve } from "node:path";
import { logger } from "../utils/logger.js";

// --- Zod Schemas ---

export const RpcEndpointSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  wsUrl: z.string().url().optional(),
});

export const ChainConfigSchema = z.object({
  name: z.string().min(1),
  chainId: z.number().positive(),
  rpcEndpoints: z.array(RpcEndpointSchema).min(3, "At least 3 RPC endpoints required per chain"),
  sequencerUrl: z.string().url().optional(), // For Arbitrum and other L2s with sequencers
  nativeToken: z.string().min(1),
  flashbotsRelay: z.string().url().optional(),
  enabled: z.boolean().default(true),
  blockTime: z.number().positive().optional(), // Average block time in seconds
  pauseMethod: z.string().optional(), // Default pause method for this chain
});

const ChainsSchema = z.object({
  chains: z.array(ChainConfigSchema).min(1),
});

export const ThresholdsSchema = z.object({
  gnn: z.object({
    threatThreshold: z.number().min(0).max(1).default(0.75),
    requestTimeoutMs: z.number().positive().default(200),
  }),
  simulation: z.object({
    drainThresholdPct: z.number().min(0).max(100).default(3),
    timeoutMs: z.number().positive().default(2000),
    oracleDeltaThresholdPct: z.number().min(0).default(50),
  }),
  preFilter: z.object({
    gasAnomalyMultiplier: z.number().positive().default(2),
    gasPriceAnomalyMultiplier: z.number().positive().default(3),
  }),
  response: z.object({
    gasPremiumPct: z.number().positive().default(15),
    maxRetryBlocks: z.number().positive().default(2),
  }),
});

export const MonitoredContractSchema = z.object({
  name: z.string().min(1),
  chain: z.string().min(1),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  pauseMethod: z.string().min(1),
  guardianAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  guardianPrivateKeyEnv: z.string().min(1),
  tvlUsd: z.number().positive(),
  drainThresholdPct: z.number().min(0).max(100).default(3),
  gnnThreshold: z.number().min(0).max(1).default(0.8),
  notify: z.object({
    telegramChatId: z.string().optional(),
    pagerdutyServiceKeyEnv: z.string().optional(),
  }),
  addedBy: z.literal("human-review"),
  addedAt: z.string(),
});

const MonitoredContractsSchema = z.object({
  contracts: z.array(MonitoredContractSchema),
});

// --- Derived Types ---

export type RpcEndpoint = z.infer<typeof RpcEndpointSchema>;
export type ChainConfig = z.infer<typeof ChainConfigSchema>;
export type Thresholds = z.infer<typeof ThresholdsSchema>;
export type MonitoredContract = z.infer<typeof MonitoredContractSchema>;

export interface SmartSentinelConfig {
  chains: ChainConfig[];
  thresholds: Thresholds;
  contracts: MonitoredContract[];
}

// --- Load Helpers ---

function loadYamlFile(filePath: string, label: string): unknown {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return parseYaml(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load ${label} config from ${filePath}: ${msg}`);
  }
}

export async function loadConfig(configDir?: string): Promise<SmartSentinelConfig> {
  const dir = configDir ?? resolve(process.cwd(), "config");

  logger.info({ configDir: dir }, "Loading configuration");

  const chainsRaw = loadYamlFile(resolve(dir, "chains.yml"), "chains");
  const chainsResult = ChainsSchema.safeParse(chainsRaw);
  if (!chainsResult.success) {
    const errors = chainsResult.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid chains.yml:\n${errors}`);
  }

  const thresholdsRaw = loadYamlFile(resolve(dir, "thresholds.yml"), "thresholds");
  const thresholdsResult = ThresholdsSchema.safeParse(thresholdsRaw);
  if (!thresholdsResult.success) {
    const errors = thresholdsResult.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid thresholds.yml:\n${errors}`);
  }

  const contractsRaw = loadYamlFile(resolve(dir, "monitored-contracts.yml"), "monitored-contracts");
  const contractsResult = MonitoredContractsSchema.safeParse(contractsRaw);
  if (!contractsResult.success) {
    const errors = contractsResult.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid monitored-contracts.yml:\n${errors}`);
  }

  const chains = chainsResult.data.chains;
  const thresholds = thresholdsResult.data;
  const contracts = contractsResult.data.contracts;

  for (const contract of contracts) {
    if (!chains.some((c) => c.name === contract.chain)) {
      throw new Error(
        `Monitored contract "${contract.name}" references unknown chain "${contract.chain}"`,
      );
    }
  }

  logger.info(
    {
      chainCount: chains.length,
      contractCount: contracts.length,
      gnnThreshold: thresholds.gnn.threatThreshold,
    },
    "Configuration loaded and validated successfully",
  );

  return { chains, thresholds, contracts };
}