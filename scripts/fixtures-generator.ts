#!/usr/bin/env tsx
/**
 * Generate exploit fixtures from on-chain transaction data.
 *
 * This CLI tool allows you to:
 * - Fetch transaction data from blockchain
 * - Generate structured fixture JSON files
 * - Create test fixtures for exploit replay
 * - Document historical exploits for testing
 *
 * Usage:
 *   npm run fixtures-generator -- --tx-hash 0x... --name "my-exploit"
 *   npm run fixtures-generator -- --tx-hash 0x... --name beanstalk-2022 --description "Beanstalk Farms governance attack"
 *   npm run fixtures-generator -- --tx-hash 0x... --name euler-2023 --rpc-url https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY
 */

import { Command } from 'commander';
import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function color(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${colors.reset}`;
}

interface ExploitData {
  name: string;
  date: string;
  chain: string;
  blockNumber: number;
  attacker: string;
  targetContract: string;
  attackContract: string;
  description: string;
  tags: string[];
  transactions: Array<{
    hash: string;
    from: string;
    to: string;
    value: string;
    gasPrice: string;
    gasUsed: number;
    data: string;
    functionSelector: string;
    timestamp: number;
  }>;
  impact: {
    tvl_usd: number;
    drained_usd: number;
    drain_percentage: number;
    tokens?: string[];
    tokens_drained?: Record<string, string>;
    gas_cost_usd: number;
  };
  detectionSignals: Record<string, boolean>;
  replay_config: {
    fork_block: number;
    state_override: Record<string, unknown>;
    expected_simulation_result: {
      should_detect: boolean;
      min_threat_score: number;
      expected_drain_percentage: number;
      expected_action: string;
    };
  };
}

/**
 * Fetch transaction data from blockchain
 */
async function fetchTransactionData(
  txHash: string,
  rpcUrl: string
): Promise<{
  transaction: any;
  receipt: any;
  block: any;
}> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });

  console.log(color('blue', `Fetching transaction data for: ${txHash}`));

  const [transaction, receipt, block] = await Promise.all([
    client.getTransaction({ hash: txHash as `0x${string}` }),
    client.getTransactionReceipt({ hash: txHash as `0x${string}` }),
    client.getBlock({ blockNumber: receipt.blockNumber }),
  ]);

  if (!transaction || !receipt || !block) {
    throw new Error('Failed to fetch transaction data');
  }

  console.log(color('green', '✓ Transaction data fetched successfully'));

  return { transaction, receipt, block };
}

/**
 * Extract function selector from transaction data
 */
function extractFunctionSelector(data: string): string {
  if (!data || data.length < 10) return '0x00000000';
  return data.substring(0, 10);
}

/**
 * Analyze transaction to detect potential attack patterns
 */
function analyzeAttackPattern(
  txData: string,
  from: string,
  to: string,
  value: bigint
): {
  signals: Record<string, boolean>;
  tags: string[];
  suggestedAction: string;
  suggestedThreatScore: number;
} {
  const signals: Record<string, boolean> = {};
  const tags: string[] = [];

  // Analyze function selector for known attack patterns
  const selector = extractFunctionSelector(txData);

  // Common attack function selectors (simplified detection)
  const attackSelectors = [
    '0x22bd8f1b', // delegate
    '0xa2c0f35b', // withdraw
    '0x51dff989', // deposit
    '0x095ea7b3', // approve
    '0x2e1a7d4d', // withdrawWithTimeout
    '0x1a1c4439', // flashLoan
    '0x3b1d34a4', // execute
  ];

  if (attackSelectors.includes(selector)) {
    signals.suspicious_function = true;
    tags.push('suspicious-function');
  }

  // Check for flash loan patterns
  if (txData.includes('uniswap') || txData.includes('aave') || txData.includes('distribute')) {
    signals.flash_loan = true;
    tags.push('flash-loan');
  }

  // Check for governance interactions
  if (txData.includes('governor') || txData.includes('vote') || txData.includes('proposal')) {
    signals.governance_interaction = true;
    signals.governance_attack = true;
    tags.push('governance');
  }

  // Check for liquidation patterns
  if (txData.includes('liquidat') || txData.includes('repay') || txData.includes('collateral')) {
    signals.liquidation_cascade = true;
    tags.push('liquidation');
  }

  // Check for price manipulation
  if (txData.includes('swap') || txData.includes('price') || txData.includes('oracle')) {
    signals.price_manipulation = true;
    signals.pool_interaction = true;
    tags.push('price-manipulation');
  }

  // Check for large value transfers
  if (value > 0) {
    const valueEth = Number(value) / 1e18;
    if (valueEth > 1000) {
      signals.large_value_transfer = true;
      tags.push('large-transfer');
    }
  }

  // Check for drain patterns
  if (txData.includes('transfer') || txData.includes('withdraw') || txData.includes('sweep')) {
    signals.liquidity_drain = true;
    tags.push('liquidity-drain');
  }

  // Check for bad debt creation
  if (txData.includes('borrow') || txData.includes('repayBorrow') || txData.includes('liquidateBorrow')) {
    signals.bad_debt_creation = true;
    tags.push('bad-debt');
  }

  // If multiple signals detected, it's likely an attack
  const signalCount = Object.values(signals).filter(v => v).length;
  let suggestedAction = 'none';
  let suggestedThreatScore = 0.3;

  if (signalCount >= 3) {
    suggestedAction = 'pause';
    suggestedThreatScore = 0.85;
  } else if (signalCount >= 2) {
    suggestedAction = 'pause';
    suggestedThreatScore = 0.75;
  } else if (signalCount >= 1) {
    suggestedAction = 'alert';
    suggestedThreatScore = 0.60;
  }

  return {
    signals,
    tags: tags.length > 0 ? tags : ['unknown'],
    suggestedAction,
    suggestedThreatScore,
  };
}

/**
 * Generate fixture from transaction data
 */
async function generateFixture(
  txHash: string,
  name: string,
  description: string,
  rpcUrl: string,
  options: {
    targetContract?: string;
    attackContract?: string;
    tvlUsd?: number;
    drainedUsd?: number;
    tags?: string[];
  }
): Promise<ExploitData> {
  console.log(color('blue', `\nGenerating fixture for: ${name}`));

  const { transaction, receipt, block } = await fetchTransactionData(txHash, rpcUrl);

  // Analyze the attack pattern
  const analysis = analyzeAttackPattern(
    transaction.input as string,
    transaction.from,
    transaction.to,
    transaction.value
  );

  // Use provided data or defaults
  const targetContract = options.targetContract || transaction.to;
  const attackContract = options.attackContract || transaction.from;
  const tvlUsd = options.tvlUsd || 1000000; // Default $1M TVL
  const drainedUsd = options.drainedUsd || tvlUsd * 0.5; // Default 50% drain
  const drainPercentage = (drainedUsd / tvlUsd) * 100;

  // Estimate gas cost (rough calculation)
  const gasPrice = Number(transaction.gasPrice || 0n);
  const gasUsed = receipt.gasUsed;
  const gasCostEth = (gasPrice * gasUsed) / 1e18;
  const gasCostUsd = gasCostEth * 2000; // Assume $2000 ETH

  // Format timestamp
  const txDate = new Date(Number(block.timestamp) * 1000);
  const dateStr = txDate.toISOString().split('T')[0];

  // Build the fixture data
  const fixture: ExploitData = {
    name: `${name} Exploit`,
    date: dateStr,
    chain: 'ethereum',
    blockNumber: Number(block.number),
    attacker: transaction.from,
    targetContract,
    attackContract,
    description: description || `Historical exploit: ${name}`,
    tags: options.tags || analysis.tags,
    transactions: [
      {
        hash: transaction.hash,
        from: transaction.from,
        to: transaction.to,
        value: transaction.value.toString(),
        gasPrice: (transaction.gasPrice || 0n).toString(),
        gasUsed: receipt.gasUsed,
        data: transaction.input as string,
        functionSelector: extractFunctionSelector(transaction.input as string),
        timestamp: Number(block.timestamp),
      },
    ],
    impact: {
      tvl_usd: tvlUsd,
      drained_usd: drainedUsd,
      drain_percentage: drainPercentage,
      tokens: ['USDC', 'USDT'], // Default tokens
      tokens_drained: {
        USDC: (drainedUsd / 2).toString(),
        USDT: (drainedUsd / 2).toString(),
      },
      gas_cost_usd: gasCostUsd,
    },
    detectionSignals: analysis.signals,
    replay_config: {
      fork_block: Math.max(0, Number(block.number) - 10), // Fork 10 blocks before
      state_override: {},
      expected_simulation_result: {
        should_detect: true,
        min_threat_score: analysis.suggestedThreatScore,
        expected_drain_percentage: drainPercentage,
        expected_action: analysis.suggestedAction,
      },
    },
  };

  console.log(color('green', '✓ Fixture data generated successfully'));

  // Display fixture summary
  console.log(color('cyan', '\nFixture Summary:'));
  console.log(color('gray', '─'.repeat(50)));
  console.log(`Name: ${fixture.name}`);
  console.log(`Date: ${fixture.date}`);
  console.log(`Block: ${fixture.blockNumber}`);
  console.log(`Attacker: ${fixture.attacker}`);
  console.log(`Target: ${fixture.targetContract}`);
  console.log(`Description: ${fixture.description}`);
  console.log(`\nImpact:`);
  console.log(`  TVL: $${fixture.impact.tvl_usd.toLocaleString()}`);
  console.log(`  Drained: $${fixture.impact.drained_usd.toLocaleString()}`);
  console.log(`  Drain %: ${fixture.impact.drain_percentage.toFixed(1)}%`);
  console.log(`\nDetection Signals:`);
  Object.entries(fixture.detectionSignals).forEach(([signal, detected]) => {
    const icon = detected ? '✓' : '✗';
    console.log(`  ${icon} ${signal}`);
  });
  console.log(`\nExpected Results:`);
  console.log(`  Min Threat Score: ${fixture.replay_config.expected_simulation_result.min_threat_score * 100}%`);
  console.log(`  Action: ${fixture.replay_config.expected_simulation_result.expected_action}`);

  return fixture;
}

/**
 * Save fixture to file
 */
function saveFixture(name: string, fixture: ExploitData): void {
  // Try multiple path resolution approaches
  const possibleDirs = [
    join(__dirname, '../tests/integration/fixtures/exploits'),
    join(process.cwd(), 'tests/integration/fixtures/exploits'),
    join(process.cwd(), './tests/integration/fixtures/exploits'),
  ];

  let fixturesDir = possibleDirs[0]; // Default to first option

  for (const dir of possibleDirs) {
    try {
      mkdirSync(dir, { recursive: true });
      fixturesDir = dir;
      break;
    } catch (error) {
      // Try next directory
    }
  }

  const filePath = join(fixturesDir, `${name}.json`);
  const content = JSON.stringify(fixture, null, 2);

  writeFileSync(filePath, content, 'utf-8');

  console.log(color('green', `\n✓ Fixture saved to: ${filePath}`));
}

/**
 * Main CLI program
 */
const program = new Command();

program
  .name('fixtures-generator')
  .description('Generate exploit fixtures from on-chain transaction data')
  .version('1.0.0')
  .requiredOption('--tx-hash <hash>', 'Transaction hash to generate fixture from')
  .requiredOption('--name <name>', 'Name for the exploit fixture (e.g., beanstalk-2022)')
  .option('--description <text>', 'Description of the exploit', '')
  .option('--rpc-url <url>', 'RPC URL for blockchain queries', 'https://eth-mainnet.alchemyapi.io/v2/demo')
  .option('--target-contract <address>', 'Target contract address (optional)')
  .option('--attack-contract <address>', 'Attack contract address (optional)')
  .option('--tvl-usd <amount>', 'Total Value Locked in USD (optional)', '1000000')
  .option('--drained-usd <amount>', 'Amount drained in USD (optional)')
  .option('--tags <tags>', 'Comma-separated tags for the exploit (optional)')
  .parse(process.argv);

const options = program.opts();

async function main(): Promise<void> {
  console.log(color('bright', '\n╔═══════════════════════════════════════════════════════════════╗'));
  console.log(color('bright', '║           SmartSentinel Exploit Fixtures Generator           ║'));
  console.log(color('bright', '╚═══════════════════════════════════════════════════════════════╝\n'));

  try {
    // Parse options
    const tvlUsd = parseInt(options.tvlUsd);
    const drainedUsd = options.drainedUsd ? parseInt(options.drainedUsd) : undefined;
    const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined;

    // Generate fixture
    const fixture = await generateFixture(
      options.txHash,
      options.name,
      options.description,
      options.rpcUrl,
      {
        targetContract: options.targetContract,
        attackContract: options.attackContract,
        tvlUsd: isNaN(tvlUsd) ? undefined : tvlUsd,
        drainedUsd: drainedUsd,
        tags,
      }
    );

    // Save fixture
    saveFixture(options.name, fixture);

    console.log(color('green', '\n✓ Fixture generation completed successfully!\n'));

    console.log(color('gray', 'You can now replay this exploit with:'));
    console.log(color('cyan', `  npm run replay-exploit -- --exploit ${options.name}\n`));

  } catch (error) {
    console.error(color('red', `\n✗ Error generating fixture: ${error}`));
    console.error(color('yellow', '\nTroubleshooting:'));
    console.error(color('gray', '- Verify the transaction hash is correct'));
    console.error(color('gray', '- Check your RPC URL is valid and accessible'));
    console.error(color('gray', '- Ensure you have internet connectivity'));
    process.exit(1);
  }
}

main().catch(error => {
  console.error(color('red', `Fatal error: ${error}`));
  process.exit(1);
});
