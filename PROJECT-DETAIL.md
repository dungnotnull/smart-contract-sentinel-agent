# PROJECT-DETAIL.md — SmartSentinel Full Architecture & Design Specification

> Version: 0.1.0-draft  
> Last Updated: 2026-05-31  
> Status: Pre-development, specification phase

---

## 1. Executive Summary

### Problem Statement

The DeFi ecosystem lost an estimated **$3.8 billion to smart contract exploits in 2024–2025**. A reentrancy attack in March 2025 drained $47 million from a major protocol in under 90 seconds — despite three separate audit firms having reviewed the code. In March 2026, MEV bots extracted $44 million from a single Aave transaction. In 2025 alone, Flashbots estimates over $900 million in MEV extraction across major chains.

The fundamental problem: **static analysis operates on code at rest; attacks happen at runtime**. Tools like Slither, Mythril, and Echidna are essential but insufficient. They cannot catch:
- Logic vulnerabilities that only manifest when interacting with live protocol state (pool balances, oracle prices, liquidity ratios)
- Flash-loan-amplified attacks where the attacker borrows billions, manipulates state, and repays — all within a single atomic transaction
- Reentrancy across multiple contracts (cross-contract reentrancy) that single-contract analysis misses
- Zero-day exploits of novel composability patterns

**The window that defenders have:** On Ethereum, a malicious transaction sits in the public mempool for typically 2–12 seconds before block inclusion. FlashGuard (ACM CODASPY 2025) demonstrated that this window is exploitable for defense — by detecting the transaction signature and disrupting the attack's atomicity before it lands. SmartSentinel systematizes this into a production-grade, multi-chain autonomous agent.

### Solution Summary

SmartSentinel is a **defense-in-depth runtime agent** that:
1. Monitors the public mempool and private relay (Flashbots MEV-Share) for suspicious pending transactions
2. Runs 3-layer filtering (heuristic → simulation → ML) in < 3 seconds end-to-end
3. When threat is confirmed: submits a higher-gas Flashbots bundle to execute a `pause()` call on the targeted contract before the attack lands
4. Dispatches a full forensic alert to human guardians for post-incident review

### Competitive Differentiation

| Feature | Forta Network | OpenZeppelin Defender | Tenderly Alerts | **SmartSentinel** |
|---|---|---|---|---|
| Mempool monitoring | ✅ | ✅ Partial | ❌ Post-tx | ✅ |
| Local fork simulation | ✅ Ganache | ❌ | ✅ Cloud | ✅ Anvil (faster) |
| ML-based scoring | ✅ Opcode classifier | ❌ | ❌ | ✅ GNN on CFG |
| Automated front-run response | ❌ Alert only | ❌ Alert only | ❌ | ✅ Flashbots bundle |
| Open source | ✅ Partial | ❌ SaaS | ❌ SaaS | ✅ Full |
| Self-hosted | ✅ | ❌ | ❌ | ✅ |
| Solana support | ✅ | ✅ | Partial | ✅ Phase 2 (Jito) |
| Self-improving knowledge | ❌ | ❌ | ❌ | ✅ |
| Multi-signal decision gate | ❌ | ❌ | ❌ | ✅ AND(heuristic, sim, ML) |

---

## 2. Overview & Key Improvements on the Original Idea

### Original Idea (Strong Foundations)
The original concept correctly identifies the core workflow: mempool listening → simulation → front-run response. This is directionally correct and backed by FlashGuard research.

### Improvements & Additions

**A. Three-layer filter (not one):** Feeding every mempool transaction directly to Anvil simulation would be computationally impossible (Ethereum sees ~15 txs/second). A fast pre-filter (< 5ms, pure heuristics) dramatically reduces the simulation load to only genuinely suspicious transactions.

**B. ML scoring as third layer (GNN on bytecode CFG):** Research (BC-GNN, DA-GNN, G-Scan, 2024-2025) shows GNN classifiers operating on Control Flow Graphs derived from bytecode achieve 93-99% F1 on known vulnerability types. This adds a learned signal orthogonal to simulation, catching attack *patterns* that may not trigger a simulation drain but indicate a novel attack setup.

**C. Private relay for response:** Submitting a defensive transaction to the public mempool is dangerous — a sophisticated attacker can detect it and counter. Flashbots `eth_sendBundle` bypasses the public mempool entirely. The defensive pause tx and the attack tx race at the builder level.

**D. Warm Anvil fork pool:** Forking mainnet on demand takes 2-5 seconds. A pool of pre-warmed Anvil forks (refreshed every block) reduces simulation latency to ~200ms, making the 3-second total budget achievable.

**E. Flashbots MEV-Share integration:** The public mempool only sees ~60% of Ethereum transactions. MEV-Share gives partial order-flow visibility into private transactions, significantly expanding detection coverage without requiring protocol-level changes.

**F. Solana-specific architecture (Phase 2):** Solana has no public mempool (transactions go directly to leaders). On Solana, defense works via Jito bundles — the agent watches for on-chain state anomalies in the first execution steps and submits a competing bundle to validators via Jito's block engine.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         INGESTION LAYER                                 │
│                                                                         │
│  ┌─────────────────────┐    ┌──────────────────────┐                  │
│  │  Ethereum Mempool    │    │  Flashbots MEV-Share  │                  │
│  │  WebSocket           │    │  Event Stream         │                  │
│  │  eth_subscribe       │    │  (private order flow) │                  │
│  └──────────┬──────────┘    └──────────┬───────────┘                  │
│             └──────────────────────────┘                               │
│                          RPC Failover Pool                              │
│                  (Alchemy → Infura → QuickNode)                        │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ pending tx stream
                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       PRE-FILTER (< 5ms target)                        │
│                                                                         │
│  ① Function selector match (4-byte DB of known attack patterns)        │
│  ② Target address in monitored-contracts.yml?                          │
│  ③ Caller in known-attacker-registry?                                  │
│  ④ Gas anomaly? (>95th percentile for this contract)                   │
│  ⑤ Unusual call depth / value patterns?                                │
│                                                                         │
│  PASS → Simulation queue    FAIL → Discard (log count only)            │
└────────────────────────────┬───────────────────────────────────────────┘
                             │ ~1-3% of transactions
                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    SIMULATION LAYER (200ms–1s target)                  │
│                                                                         │
│  Anvil Fork Pool (pre-warmed, 1 fork per CPU core)                     │
│  ┌──────────────────────────────────────────────────────────┐          │
│  │  1. Submit pending tx to warm fork of current block      │          │
│  │  2. Capture state delta: token balances, liquidity       │          │
│  │  3. Compute drain% = (ΔprotocolValue / TVL) × 100       │          │
│  │  4. Detect: reentrancy depth, oracle manipulation flag   │          │
│  └──────────────────────────────────────────────────────────┘          │
│                                                                         │
│  drain% > threshold → escalate to ML layer                             │
│  drain% ≤ threshold → discard (log simulation result)                  │
└────────────────────────────┬───────────────────────────────────────────┘
                             │ drain confirmed
                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     ML SCORING LAYER (50–200ms)                        │
│                                                                         │
│  Python GNN inference server (FastAPI, port 8765)                      │
│  ┌──────────────────────────────────────────────────────────┐          │
│  │  Input: bytecode of contracts involved in tx             │          │
│  │    → disassemble → extract CFG + opcode sequence         │          │
│  │    → build heterogeneous graph (nodes=blocks, edges=flow)│          │
│  │    → DA-GNN / BC-GNN inference                           │          │
│  │  Output: threat_score [0.0–1.0] + vulnerability_type     │          │
│  └──────────────────────────────────────────────────────────┘          │
└────────────────────────────┬───────────────────────────────────────────┘
                             │ threat_score + sim_result
                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     DECISION ENGINE                                     │
│                                                                         │
│  PAUSE if ALL of:                                                       │
│    gnn_score    > config.gnn_threshold      (default: 0.75)            │
│    drain_pct    > config.drain_threshold    (default: 3%)              │
│    heuristic_flags ≥ 1                                                  │
│                                                                         │
│  ALERT-ONLY if ANY of the above but not all:                           │
│    → Send URGENT alert to guardian, no auto-pause                      │
│                                                                         │
│  IGNORE if none:                                                        │
│    → Log to incident-log.db (for model retraining data)                │
└──────────────────┬───────────────────────────┬─────────────────────────┘
                   │ PAUSE decision             │ ALERT decision
                   ▼                            ▼
┌──────────────────────────┐      ┌─────────────────────────────────────┐
│   RESPONSE EXECUTOR       │      │         ALERT DISPATCHER            │
│                           │      │                                     │
│  1. Encode pause() call   │      │  🔴 URGENT → PagerDuty + Telegram  │
│  2. Sign with guardian pk │      │  🟡 WARNING → Telegram + Slack     │
│  3. Bundle: [pause_tx]    │      │  📋 Forensic report (Markdown)     │
│  4. eth_sendBundle via    │      │  📊 Incident log DB entry          │
│     Flashbots private     │      └─────────────────────────────────────┘
│     relay (higher gas)    │
│  5. Confirm inclusion     │
│  6. Alert: "PAUSED"       │
└──────────────────────────┘
```

---

## 4. Pre-Filter Module — Detailed Design

**Goal:** Reduce 15 tx/sec Ethereum mempool to < 0.5 tx/sec for simulation. Must complete in < 5ms per transaction.

### 4.1 Function Selector Database (`data/4byte-selectors.json`)

Known attack entry-point function selectors (4-byte signatures). Pre-populated from:
- Historical exploit transaction analysis (Rekt.news, DeFiHackLabs database)
- FlashGuard's selector taxonomy
- Custom: any function calling `flashLoan()`, `swap()`, `borrow()` on external contracts from within the same tx

```typescript
const SUSPICIOUS_SELECTORS = new Set([
  "0x5c11d795",  // swapExactTokensForTokensSupportingFeeOnTransferTokens
  "0x12aa3caf",  // executeMetaTransaction (common in MEV bots)
  // ... 200+ entries, updated from exploit database
]);

function selectorMatch(tx: PendingTx): boolean {
  const selector = tx.data.slice(0, 10);
  return SUSPICIOUS_SELECTORS.has(selector);
}
```

### 4.2 Gas Anomaly Detection

```typescript
interface GasBaseline {
  contractAddress: string;
  p95GasLimit: bigint;  // 95th percentile of last 1000 txs to this contract
  p95GasPrice: bigint;
}

function isGasAnomalous(tx: PendingTx, baseline: GasBaseline): boolean {
  return (
    tx.gasLimit > baseline.p95GasLimit * 2n ||  // >2x normal gas limit
    tx.maxFeePerGas > baseline.p95GasPrice * 3n  // >3x normal gas price (urgency signal)
  );
}
```

---

## 5. Simulation Engine — Detailed Design

### 5.1 Anvil Fork Pool

**Problem:** Forking mainnet on demand = 2-5 second latency. Unacceptable.  
**Solution:** Maintain a pool of N pre-warmed Anvil forks, each representing the current head block. Refresh on every new block.

```typescript
class AnvilForkPool {
  private forks: AnvilInstance[] = [];
  private readonly POOL_SIZE = Math.max(os.cpus().length, 4);
  
  async acquire(): Promise<AnvilInstance> {
    // Lease a warm fork; if all busy, spawn an emergency fork
    return this.forks.find(f => !f.busy) ?? await this.spawnFork();
  }
  
  async onNewBlock(blockNumber: bigint): Promise<void> {
    // Refresh all idle forks to new head
    await Promise.all(
      this.forks
        .filter(f => !f.busy)
        .map(f => f.reset(blockNumber))
    );
  }
}
```

### 5.2 State Delta Analysis

After executing the tx in fork, measure:

```typescript
interface SimulationResult {
  txHash: string;
  gasUsed: bigint;
  reverted: boolean;
  
  // Key drain signals
  tvlDeltaPct: number;          // % change in monitored contract TVL
  tokenFlows: TokenFlow[];       // All ERC20/ETH transfers
  liquidityDelta: number;        // AMM pool liquidity change %
  oraclePriceDelta: number;      // Oracle price manipulation %
  
  // Reentrancy signal
  maxCallDepth: number;          // Reentrancy = depth > expected
  crossContractReentrant: boolean;
  
  // Flash loan signal
  flashLoanDetected: boolean;
  flashLoanAmount: bigint;
  flashLoanProvider: string;
}
```

---

## 6. ML Scoring Layer — GNN Classifier

### 6.1 Model Architecture

Based on **DA-GNN** (Dual Attention Graph Neural Network, ScienceDirect 2024) and **BC-GNN** (bytecode-based GNN, IEEE 2024) — both operate on bytecode, not source code. Source code is often unavailable for newly deployed attacker contracts.

**Input representation:**
1. Disassemble bytecode → opcode sequence
2. Build **Control Flow Graph (CFG):** nodes = basic blocks, edges = execution flow
3. Build **Opcode sequence graph:** GRU encodes semantic embedding of each block
4. Combine into heterogeneous graph → DA-GNN's dual attention mechanism

**Why GNN over simpler classifiers (per research):**
- GNNs capture structural patterns (reentrancy = cyclic call pattern in CFG)
- Outperforms sequence models (LSTM, BERT on opcodes) because attack patterns are structural, not sequential
- G-Scan achieves 93.02% F1 at contract level, 93.69% at line level — acceptable false positive rates

**Existing models to use from HuggingFace / literature:**
- Start with pre-trained weights from **SmartBugs** benchmark training runs (public dataset + model weights available via Papers With Code)
- Fine-tune on domain-specific exploit dataset (DeFiHackLabs: 400+ labeled exploit contracts)
- Do NOT train from scratch — leverage existing GNN architectures (PyTorch Geometric `GATConv`, `GCNConv`)

```python
# ml-pipeline/models/gnn_classifier.py
import torch
import torch.nn.functional as F
from torch_geometric.nn import GATConv, global_mean_pool

class VulnerabilityGNN(torch.nn.Module):
    """
    DA-GNN inspired dual-attention GNN for smart contract vulnerability detection.
    Input: heterogeneous graph of CFG + opcode blocks from bytecode disassembly.
    Output: threat_score (0.0–1.0) + vulnerability_type (reentrancy/flashloan/oracle/other)
    """
    def __init__(self, in_channels: int, hidden: int = 128, num_classes: int = 5):
        super().__init__()
        # CFG-level attention
        self.cfg_conv1 = GATConv(in_channels, hidden, heads=4, concat=False)
        self.cfg_conv2 = GATConv(hidden, hidden, heads=4, concat=False)
        # Opcode block semantic embedding
        self.opcode_gru = torch.nn.GRU(in_channels, hidden, batch_first=True)
        # Dual fusion + classification head
        self.classifier = torch.nn.Linear(hidden * 2, num_classes)
        self.threat_head = torch.nn.Linear(hidden * 2, 1)
    
    def forward(self, cfg_data, opcode_seq):
        # CFG branch
        cfg_x = F.elu(self.cfg_conv1(cfg_data.x, cfg_data.edge_index))
        cfg_x = self.cfg_conv2(cfg_x, cfg_data.edge_index)
        cfg_pooled = global_mean_pool(cfg_x, cfg_data.batch)
        
        # Opcode branch
        _, opcode_hidden = self.opcode_gru(opcode_seq)
        opcode_emb = opcode_hidden.squeeze(0)
        
        # Dual fusion
        fused = torch.cat([cfg_pooled, opcode_emb], dim=-1)
        
        return {
            "threat_score": torch.sigmoid(self.threat_head(fused)).squeeze(-1),
            "vuln_type": self.classifier(fused),
        }
```

### 6.2 Training Data

| Dataset | Size | Source |
|---|---|---|
| SmartBugs | 47,587 contracts | github.com/smartbugs/smartbugs |
| DeFiHackLabs exploits | 400+ labeled exploits | github.com/SunWeb3Sec/DeFiHackLabs |
| Etherscan verified (benign) | ~130,000 contracts | Forta ML blog methodology |
| Custom: pending-tx derived | Growing | Incidents flagged by SmartSentinel |

**Training pipeline:**
1. Disassemble bytecode → CFG using `pyevmasm` + `ethpwn`
2. Label: exploit contracts = 1, verified contracts = 0
3. Train DA-GNN with PyTorch + PyTorch Geometric
4. Export to ONNX for fast TypeScript-side inference (optional; use Python server initially)
5. Target: F1 > 0.90 on held-out exploit test set

### 6.3 Inference Server

```python
# ml-pipeline/serve.py — FastAPI inference endpoint
@app.post("/score")
async def score_bytecode(request: ScoringRequest) -> ScoringResponse:
    """
    Input: {bytecode: "0x...", tx_hash: "0x..."}
    Output: {threat_score: 0.87, vuln_type: "flash_loan", latency_ms: 45}
    """
```

---

## 7. Response Executor — Front-Run via Flashbots

### 7.1 The Race Condition

When SmartSentinel identifies a threat at time T:
- The attack tx was broadcast at T - Δ (mempool observation latency)
- Block inclusion = T + (12s - block_position × avg_tx_time)
- SmartSentinel must submit and have its pause tx included **before** the attack tx

**Strategy:** Submit via Flashbots `eth_sendBundle` with:
- `maxPriorityFeePerGas` = `attackTx.maxPriorityFeePerGas × 1.15` (outbid by 15%)
- `blockNumber` = `currentBlock + 1` (target the next block)
- Bundle: `[pause_tx]` only — keep it simple, maximally fast

### 7.2 Pause Transaction

```typescript
async function buildPauseTx(
  contract: MonitoredContract,
  attackTx: PendingTx,
): Promise<TransactionRequest> {
  const iface = new ethers.Interface([`function ${contract.pauseMethod}`]);
  const data = iface.encodeFunctionData("setPoolPause", [true]);
  
  return {
    to: contract.address,
    from: contract.guardianAddress,
    data,
    // Outbid the attack tx by 15% to win block ordering
    maxPriorityFeePerGas: (attackTx.maxPriorityFeePerGas * 115n) / 100n,
    maxFeePerGas: (attackTx.maxFeePerGas * 115n) / 100n,
    gasLimit: 200_000n,  // Conservative; pause() should be cheap
  };
}
```

### 7.3 Limitations & Honest Assessment

**When front-running works:**
- Attacker used the public mempool (common for less sophisticated attacks)
- Block builder includes bundles fairly (Flashbots MEV-Share)

**When it may not work:**
- Sophisticated attacker uses private relay (Flashbots Protect) — their tx never enters public mempool. SmartSentinel cannot detect it until on-chain. **Mitigation:** Flashbots MEV-Share partial visibility + on-chain state monitoring for early detection.
- Attacker bribes the block builder directly — their tx gets priority regardless of gas. **Mitigation:** This is rare and mitigated by monitoring MEV-Share hints.
- On Solana: no public mempool exists. Jito bundles are the defense mechanism. **Phase 2.**

---

## 8. Alert Forensic Report Format

Every incident (threat detected, regardless of action taken) generates:

```
🚨 SmartSentinel Incident Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ID: INC-2026-0531-0042
Time: 2026-05-31T14:23:11.847Z UTC
Chain: Ethereum Mainnet
Severity: CRITICAL — AUTO-PAUSE FIRED

TARGET CONTRACT
  Name:    Aave V3 Pool
  Address: 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2
  TVL:     $5.12B at detection time

ATTACK TRANSACTION
  Hash:    0xabcd...1234 (pending)
  From:    0xdead...beef (⚠️ known attacker registry)
  Selector: 0x5c11d795 (swapExactTokens variant)
  Gas:     4,200,000 (p95 baseline: 890,000 — 4.7× anomaly)

SIMULATION RESULT
  TVL Drain:         8.3% ($424M simulated drain)
  Flash Loan:        YES — $2.1B from Balancer
  Reentrancy Depth:  4 (baseline: 1)
  Oracle Delta:      +340% WBTC/USDC manipulation

ML CLASSIFICATION
  GNN Threat Score:  0.94 / 1.00
  Vulnerability Type: Flash Loan + Oracle Manipulation

DECISION
  Heuristic flags: 3/5 ✅
  Drain threshold: 8.3% > 3.0% ✅
  GNN score: 0.94 > 0.75 ✅
  → PAUSE TRIGGERED

RESPONSE
  Pause tx:    0xbeef...cafe
  Bundle sent: 2026-05-31T14:23:13.201Z (1.354s after detection)
  Included in: Block 22,847,391 ✅
  Attack tx:   EXCLUDED from block ✅

TIMELINE
  T+0ms:    Mempool detection
  T+182ms:  Pre-filter PASS
  T+547ms:  Simulation complete
  T+612ms:  GNN score received
  T+634ms:  Decision: PAUSE
  T+1354ms: Flashbots bundle confirmed

NEXT STEPS FOR HUMAN REVIEW
  1. Verify protocol state on Etherscan
  2. Decide whether to unpause (contact: Aave Guardian Multisig)
  3. File incident with SEAL911 if novel attack pattern
  4. Add attacker address to known-attacker-registry
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 9. Technical Stack

| Component | Technology | Rationale |
|---|---|---|
| Primary language | TypeScript 5.x | Type safety; viem/ethers ecosystem; matches Foundry/Hardhat tooling |
| ML pipeline | Python 3.12 + PyTorch + PyTorch Geometric | GNN research implementations; PyG has GATConv, GCNConv ready |
| Chain interaction | viem (primary), ethers.js (fallback) | viem is faster, tree-shakeable; ethers for Flashbots SDK compat |
| Local simulation | Foundry Anvil | 10-100× faster than Ganache; EVM-accurate; supports `eth_call` with state override |
| Bytecode disassembly | pyevmasm (Python) | Best-supported EVM disassembler; outputs structured opcode list |
| Flashbots integration | @flashbots/ethers-provider-bundle | Official Flashbots SDK for bundle submission |
| ML inference server | FastAPI + uvicorn | Async, fast, OpenAPI auto-docs; easy TypeScript client |
| GNN model | PyTorch Geometric (GATConv) | DA-GNN and BC-GNN architectures; extensive prebuilt layers |
| Storage (incidents) | SQLite (better-sqlite3) | Append-only; zero-config; sufficient for single-instance |
| Config | YAML + zod validation | Human-readable; strongly validated at startup |
| Alerts | Telegram Bot API, PagerDuty SDK | Immediate ops notification channels |
| Testing | Vitest (TS) + pytest (Python) | Fast, ESM-native for TS; standard Python |
| CI | GitHub Actions | Build → lint → test → model eval |

---

## 10. ML/DL Component Summary

### What we use (NOT reinventing):
- **DA-GNN architecture** (ScienceDirect 2024) — dual attention on CFG + opcode GRU
- **BC-GNN methodology** (IEEE 2024) — CFG + DFG combined heterogeneous graph
- **SmartBugs dataset** — 47,587 labeled contracts for training
- **DeFiHackLabs** — 400+ labeled exploit contracts for fine-tuning
- **PyTorch Geometric** — `GATConv`, `global_mean_pool`, `HeteroData` built-in
- **pyevmasm** — bytecode → opcode disassembly (existing library)

### What is custom:
- The feature extraction pipeline: bytecode → heterogeneous graph (CFG + opcode) specific to our inference latency requirements
- Training on the DeFiHackLabs + live incident corpus (new labeled data from SmartSentinel's own operation)
- ONNX export optimization for < 100ms inference budget

### When to use ML vs. rule-based:
- **GNN (ML):** classifying bytecode of newly-deployed attacker contracts — structural pattern recognition that rule-based selectors cannot capture
- **Rule-based:** function selector matching, gas anomaly, whale wallet tracking — deterministic, < 1ms, no false negatives on known patterns
- **Simulation:** ground truth for economic impact — neither ML nor rules can quantify actual drain without execution

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| False positive pauses live protocol | Medium | CRITICAL | Triple-gate decision (heuristic + sim + ML); conservative thresholds; alert-only mode by default |
| Attacker uses private mempool (Flashbots Protect) | High | High | MEV-Share partial hints + on-chain early state detection; Solana Jito in Phase 2 |
| Anvil simulation lags > 3s block time | Medium | High | Warm fork pool; simulation timeout = 2s; fall back to alert-only if exceeded |
| GNN false positive rate too high | Medium | High | Start with conservative threshold (0.80); track false positive rate in incident log; tune quarterly |
| RPC provider outage | Medium | High | 3-provider failover pool per chain; alert immediately on pool failure |
| Guardian private key compromise | Low | CRITICAL | Hardware wallet (Ledger) for guardian; never store key in plaintext; use `guardian_private_key_env` pattern |
| Attacker learns sentinel's pause selector and crafts a bypass | Low | High | Response tx uses private relay; consider commitment scheme for pause mechanism in future |
| Model becomes stale as new attack patterns emerge | High | Medium | Retrain monthly with new DeFiHackLabs incidents; self-improving knowledge brain crawls new research |
| Gas war lost (attacker outbids pause tx) | Medium | Medium | 15% gas premium in pause bundle; for critical protocols, consider pre-authorized guardian multicall |
| Cross-chain attack (bridging exploit) | Low | High | Phase 3: cross-chain state correlation; Phase 1 handles single-chain only |
| Solana no mempool — detection too late | High (Solana) | High | Solana-specific: monitor on-chain state in first tx steps + Jito bundle response (Phase 2) |
