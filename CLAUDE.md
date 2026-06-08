# CLAUDE.md — Agent Operating Manual for smart-contract-sentinel-agent

> This file is the **primary instruction set** for any AI agent (Claude Code, Cursor, or equivalent) working on this project. Read this file fully before taking any action in this repository.

---

## Project Identity

**Project Name:** SmartSentinel  
**Tagline:** A real-time, multi-chain autonomous defense agent that detects, simulates, and neutralizes smart contract attacks — from mempool to front-run response — before funds are drained  
**Language:** TypeScript (primary — agent core, blockchain interaction), Python (ML/DL pipeline — GNN vulnerability classifier)  
**License:** Apache 2.0  
**Target Chains:** Ethereum Mainnet, Arbitrum, Optimism, Base, Polygon, Solana (phase 2)  
**Architecture:** Block/mempool listener → Pre-filter → Simulation fork (Anvil) → ML scorer (GNN) → Decision engine → Front-run executor → Alert dispatcher

---

## What This Project Is

SmartSentinel is an autonomous, always-on defense agent for DeFi protocols. It solves a problem that static analysis tools (Slither, Mythril, Echidna) fundamentally cannot: **dynamic, runtime attack detection on live blockchain state**.

When an attacker submits a malicious transaction to the mempool, they typically have a 2–12 second window before it is confirmed. SmartSentinel operates entirely within this window:

1. **Listens** to the public mempool via WebSocket (Ethereum) and private relays (Flashbots, Jito on Solana)
2. **Pre-filters** suspicious transactions using fast heuristics (function selector matching, unusual gas, whale wallet flags)
3. **Simulates** flagged transactions against a local Anvil fork of mainnet state to measure liquidity drain and state changes
4. **Scores** them with a GNN-based classifier trained on bytecode CFG + opcode patterns of known exploits
5. **Decides** — if threat score > threshold: fires a front-run bundle (via Flashbots private relay) to pause the target contract
6. **Alerts** protocol guardian multisig + Telegram/PagerDuty with a full forensic report

The system builds on research from FlashGuard (ACM CODASPY 2025), Forta Network's ML detection bots, and GNN-based vulnerability classifiers (BC-GNN, DA-GNN, G-Scan). It does **not** reinvent detection from scratch — it orchestrates existing models and adds the autonomous response layer.

---

## Core Principles for the Agent

### 1. Speed Is the Architecture
The entire detection-to-response pipeline must complete in < 3 seconds (Ethereum block time ~12s; attacker advantage window ~2-8s). Any module that adds latency without proportional accuracy gain must be cut. Profile before adding features.

### 2. Simulation Before Action — Always
The front-run executor **never** fires without a completed simulation confirming a drain > `DRAIN_THRESHOLD_PCT` (default: 5% of monitored TVL). A false positive that unnecessarily pauses a live DeFi protocol is a serious incident — it disrupts users and destroys trust. Simulation is the gate, not an optional step.

### 3. ML Scores Advisory, Not Dictatorial
The GNN classifier provides a threat score (0.0–1.0). It is one input into the decision engine — not the sole trigger. The decision engine requires: GNN score > 0.75 **AND** simulation drain > threshold **AND** at least one heuristic flag. No single signal can alone trigger a pause action.

### 4. Private Relay for Response — No Public Mempool
All front-run response transactions must be sent via Flashbots `eth_sendBundle` (Ethereum) or Jito's block engine (Solana). Never submit defensive transactions to the public mempool — they will be visible and can be sandwiched or blocked by a sophisticated attacker.

### 5. Monitored Contracts Are Explicitly Allowlisted
SmartSentinel only defends contracts in `config/monitored-contracts.yml`. It never autonomously pauses a contract not on this list. Adding a contract to the list requires a human review step — agents do not self-modify this file.

### 6. Append-Only Forensic Log
`data/incident-log.db` (SQLite) stores every simulation run, decision, and action taken. It is **append-only**. Never delete or update rows. The audit trail is legally and operationally critical if an incident is contested.

### 7. GNN Model Is a Versioned Asset
The trained GNN model lives in `models/gnn-vuln-classifier/`. Any retraining must increment the semantic version in `models/gnn-vuln-classifier/model-card.json`. Never overwrite the current production model file — archive it first. Rollback must be possible within 30 seconds.

### 8. Chain-Specific RPC Pools, Never Single Points of Failure
All chain connections use a pool of at least 3 RPC endpoints (Alchemy, Infura, QuickNode) per chain. If the primary RPC drops, failover is automatic within 500ms. A sentinel that loses its blockchain connection silently is worse than no sentinel at all — it must alert immediately on connection loss.

---

## Directory Structure

```
smart-contract-sentinel-agent/
├── CLAUDE.md                                    # This file
├── PROJECT-DETAIL.md                            # Full architecture spec
├── PROJECT-DEVELOPMENT-PHASE-TRACKING.md        # Sprint tracker
├── SECOND-KNOWLEDGE-BRAIN.md                    # Self-improving knowledge corpus
│
├── src/
│   ├── main.ts                                  # Entry point — CLI + daemon startup
│   ├── core/
│   │   ├── sentinel.ts                          # Main orchestrator: wires all modules
│   │   ├── decision-engine.ts                   # Multi-signal threat decision (AND logic)
│   │   └── config-loader.ts                     # Load + validate config/monitored-contracts.yml
│   │
│   ├── listeners/
│   │   ├── base.ts                              # Abstract ChainListener interface
│   │   ├── ethereum-mempool.ts                  # WebSocket mempool subscription (eth_subscribe)
│   │   ├── flashbots-relay.ts                   # Flashbots MEV-Share event stream
│   │   └── rpc-pool.ts                          # Multi-RPC failover pool per chain
│   │
│   ├── filters/
│   │   ├── pre-filter.ts                        # Fast heuristic filter (< 5ms target)
│   │   ├── function-selector.ts                 # Match known attack selectors (4-byte DB)
│   │   ├── whale-tracker.ts                     # Flag wallets in known-attacker registry
│   │   └── gas-anomaly.ts                       # Flag abnormal gas price/limit patterns
│   │
│   ├── simulation/
│   │   ├── anvil-fork.ts                        # Spawn + manage local Anvil fork processes
│   │   ├── tx-simulator.ts                      # Submit tx to fork, measure state delta
│   │   ├── drain-calculator.ts                  # Compute % TVL drain from state changes
│   │   └── simulation-pool.ts                   # Pool of warm Anvil forks for latency
│   │
│   ├── ml/
│   │   ├── gnn-client.ts                        # TypeScript client → Python GNN inference server
│   │   ├── feature-extractor.ts                 # Bytecode → CFG + opcode features for GNN
│   │   └── threat-scorer.ts                     # Normalize GNN output → 0.0–1.0 score
│   │
│   ├── response/
│   │   ├── front-runner.ts                      # Build + submit Flashbots bundle for pause tx
│   │   ├── pause-builder.ts                     # Encode `pause()` calldata for target contract
│   │   └── jito-submitter.ts                    # Solana Jito bundle submission (Phase 2)
│   │
│   ├── alerts/
│   │   ├── dispatcher.ts                        # Route alerts by severity
│   │   ├── telegram.ts                          # Telegram bot alert channel
│   │   ├── pagerduty.ts                         # PagerDuty on-call escalation
│   │   ├── slack.ts                             # Slack webhook
│   │   └── forensic-reporter.ts                 # Generate full incident report (Markdown)
│   │
│   └── storage/
│       ├── incident-log.ts                      # Append-only SQLite writer
│       └── known-attacker-registry.ts           # Cross-chain attacker wallet index
│
├── ml-pipeline/                                 # Python — GNN training + serving
│   ├── requirements.txt
│   ├── serve.py                                 # FastAPI inference server (gRPC optional)
│   ├── train.py                                 # Training entrypoint
│   ├── models/
│   │   ├── gnn_classifier.py                    # DA-GNN / BC-GNN architecture (PyTorch + PyG)
│   │   └── feature_extractor.py                 # Bytecode → CFG + opcode graph builder
│   ├── data/
│   │   ├── datasets.py                          # Load SmartBugs, SWC Registry, custom labels
│   │   └── augmentation.py                      # Synthetic attack variant generation
│   └── eval/
│       └── benchmark.py                         # Eval on SmartBugs benchmark + custom test set
│
├── config/
│   ├── monitored-contracts.yml                  # ALLOWLIST of contracts to defend
│   ├── thresholds.yml                           # GNN score, drain %, gas anomaly thresholds
│   └── chains.yml                               # RPC pool config per chain
│
├── models/
│   └── gnn-vuln-classifier/
│       ├── model-card.json                      # Version, training data, accuracy metrics
│       ├── model-v1.0.0.pt                      # Versioned model weights
│       └── model-v1.0.0.onnx                    # ONNX export for fast TypeScript inference
│
├── data/
│   ├── incident-log.db                          # Append-only SQLite incident log
│   ├── known-attackers.json                     # Flagged wallet addresses registry
│   └── 4byte-selectors.json                     # Known attack function selectors DB
│
├── tests/
│   ├── unit/
│   ├── integration/
│   │   ├── simulation/                          # Tests using forked Anvil — replay known hacks
│   │   └── ml/                                  # GNN inference tests with fixture bytecodes
│   └── fixtures/
│       ├── exploits/                            # Historical exploit transaction replays
│       └── bytecodes/                           # Labeled malicious/benign bytecode samples
│
├── scripts/
│   ├── replay-exploit.ts                        # Replay a historical exploit through the pipeline
│   ├── add-monitored-contract.ts                # Human-review CLI for adding contracts
│   ├── retrain-gnn.py                           # Trigger GNN retraining with new labeled data
│   └── crawl-knowledge.py                       # Manual knowledge brain update
│
└── docs/
    ├── threat-taxonomy.md                       # Categorized attack patterns monitored
    ├── chain-setup.md                           # RPC + Anvil setup per chain
    └── incident-response-runbook.md             # Human steps after a sentinel fires
```

---

## Key Commands

```bash
# Setup
npm install && pip install -r ml-pipeline/requirements.txt --break-system-packages
cp config/chains.example.yml config/chains.yml  # Fill in RPC endpoints
cp config/monitored-contracts.example.yml config/monitored-contracts.yml

# Run sentinel
npm run dev                    # Development mode with verbose logging
npm run start                  # Production daemon
npm run start -- --chain ethereum --dry-run  # Monitor without firing responses

# ML pipeline
python ml-pipeline/serve.py    # Start GNN inference server (port 8765)
python ml-pipeline/train.py    # Full training run
python ml-pipeline/eval/benchmark.py  # Evaluate model on SmartBugs dataset

# Testing
npm test                       # All unit + integration tests
npm run test:replay -- --exploit beanstalk-2022  # Replay a specific historical exploit
npm run test:simulation        # Simulation accuracy tests (requires Anvil)

# Operations
npm run replay-exploit         # Simulate an exploit end-to-end (dry run)
python scripts/retrain-gnn.py  # Retrain GNN with latest labeled data
python scripts/crawl-knowledge.py  # Update knowledge brain

# Monitoring
npm run status                 # Show sentinel health: RPC, GNN server, Anvil pool
npm run incident-log           # Print recent incidents from SQLite
```

---

## Monitored Contract Config Format

```yaml
# config/monitored-contracts.yml
contracts:
  - name: "Aave V3 Pool"
    chain: ethereum
    address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
    pause_method: "setPoolPause(bool)"       # Must be callable by guardian
    guardian_address: "0x..."               # Multisig that owns pause rights
    guardian_private_key_env: "AAVE_GUARDIAN_KEY"
    tvl_usd: 5000000000                     # Used to compute drain % threshold
    drain_threshold_pct: 3.0               # Pause if > 3% TVL drained in sim
    gnn_threshold: 0.80                    # Minimum GNN score to consider
    notify:
      telegram_chat_id: "-100..."
      pagerduty_service_key_env: "PD_AAVE_KEY"
    added_by: "human-review"               # Agents cannot set this field
    added_at: "2026-05-31"
```

---

## Forbidden Actions

- **Never** fire a front-run response without a completed Anvil simulation confirming drain > threshold
- **Never** add a contract to `monitored-contracts.yml` autonomously — human review required
- **Never** submit defensive transactions via the public mempool — Flashbots / Jito private relay only
- **Never** delete or update rows in `data/incident-log.db`
- **Never** overwrite a production model file — archive with version suffix before replacing
- **Never** use a single RPC endpoint — always the failover pool
- **Never** log private keys, bearer tokens, or guardian wallet mnemonics anywhere (files, stdout, DB)
- **Never** trigger a pause on a chain other than the chain the suspicious transaction was detected on

---

## When in Doubt

1. If latency is the question: favor speed for filtering stages, favor accuracy for decision and action stages.
2. If a threshold is unclear: use conservative (higher) thresholds — false negatives lose money, false positives disrupt users.
3. If the GNN server is unreachable: fall back to simulation-only mode with elevated drain threshold (1% vs 3%). Log the degraded mode.
4. If a chain's RPC pool is fully down: halt monitoring for that chain, alert immediately, do NOT silently fail.
5. If a simulation result is ambiguous (drain 2-4% near threshold): alert the guardian human without auto-pausing. The human decides.
