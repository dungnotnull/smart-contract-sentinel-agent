# SmartSentinel

> **Real-time, multi-chain autonomous defense agent that detects, simulates, and neutralizes smart contract attacks — from mempool to front-run response**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js->=20.0.0-green)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.12+-yellow)](https://www.python.org/)

---

## Overview

SmartSentinel is an autonomous, always-on defense agent for DeFi protocols. It solves a fundamental problem that static analysis tools (Slither, Mythril, Echidna) cannot address: **dynamic, runtime attack detection on live blockchain state**.

When an attacker submits a malicious transaction to the mempool, they typically have a **2–12 second window** before confirmation. SmartSentinel operates entirely within this critical window:

1. **Listens** to the public mempool via WebSocket and private relays (Flashbots, Jito)
2. **Pre-filters** suspicious transactions using fast heuristics (< 5ms)
3. **Simulates** flagged transactions against a local Anvil fork to measure liquidity drain
4. **Scores** them with a GNN-based classifier trained on known exploit patterns
5. **Decides** — if threat score > threshold: fires a front-run bundle to pause the target contract
6. **Alerts** protocol guardians with full forensic reports

### Current Status: **v0.2.0 — Beta Ready (~80% Production Ready)**

✅ **Implemented:**
- Full mempool listening layer (Ethereum + MEV-Share)
- 3-layer pre-filter with function selectors, gas anomaly, whale tracking
- Anvil simulation engine with fork pool and drain calculation
- GNN ML pipeline with DA-GNN architecture (inference server + client)
- Decision engine with multi-signal threat evaluation
- Alert system (Telegram, PagerDuty, Slack) with forensic reporting
- Flashbots front-run response with gas escalation
- Append-only SQLite incident logging
- Comprehensive test suite (unit + integration)
- Exploit replay validation framework

⚠️ **Required for Production:**
- Trained GNN model weights (currently using placeholder)
- Mainnet RPC credentials (Alchemy, Infura, QuickNode)
- Guardian wallet private keys (for pause transactions)
- Production monitoring deployment

---

## Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **Python** >= 3.12
- **Anvil** (Foundry toolchain)
- **Git**

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/smart-contract-sentinel-agent.git
cd smart-contract-sentinel-agent

# Install TypeScript dependencies
npm install

# Install Python ML dependencies
pip install -r ml-pipeline/requirements.txt --break-system-packages

# Verify Anvil installation
anvil --version

# Copy example configurations
cp config/chains.example.yml config/chains.yml
cp config/monitored-contracts.example.yml config/monitored-contracts.yml
cp config/thresholds.example.yml config/thresholds.yml
```

### Configuration

Edit `config/chains.yml` to add your RPC endpoints:

```yaml
chains:
  ethereum:
    rpc_endpoints:
      - "https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
      - "https://mainnet.infura.io/v3/YOUR_PROJECT_ID"
      - "https://cloudflare-eth.com"
    flashbots_relay: "https://relay.flashbots.net"
    chain_id: 1
```

Edit `config/monitored-contracts.yml` to add contracts you want to defend:

```yaml
contracts:
  - name: "Aave V3 Pool"
    chain: ethereum
    address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
    pause_method: "setPoolPause(bool)"
    guardian_address: "0x..."  # Multisig that owns pause rights
    guardian_private_key_env: "AAVE_GUARDIAN_KEY"
    tvl_usd: 5000000000
    drain_threshold_pct: 3.0
    gnn_threshold: 0.80
```

### Running

```bash
# Development mode (with verbose logging)
npm run dev

# Production daemon
npm run start

# Monitor without firing responses (dry-run)
npm run start -- --chain ethereum --dry-run

# Check system health
npm run status

# View incident log
npm run incident-log
```

---

## Architecture

SmartSentinel uses a **defense-in-depth** approach with three filtering layers:

### 1. Pre-Filter Layer (< 5ms)
- **Function Selector Matching**: 4-byte signatures of known attack patterns
- **Monitored Contract Filter**: Is target in allowlist?
- **Known Attacker Registry**: Cross-chain attacker wallet index
- **Gas Anomaly Detection**: Unusual gas price/limit patterns
- **Call Value Filter**: Unusual ETH value accompanying calls

### 2. Simulation Layer (200ms–1s)
- **Anvil Fork Pool**: Pre-warmed local forks of mainnet state
- **Transaction Simulator**: Execute pending tx in isolated environment
- **Drain Calculator**: Measure % TVL drain from state changes
- **Reentrancy Detection**: Parse call traces for suspicious depth
- **Flash Loan Detection**: Identify calls to known lending pools

### 3. ML Scoring Layer (50–200ms)
- **GNN Classifier**: DA-GNN architecture on bytecode CFG
- **Feature Extractor**: Bytecode → opcode → graph transformation
- **Threat Scorer**: Normalize ML output to 0.0–1.0 score

### Decision Engine

Auto-pause is triggered only when **ALL** conditions are met:

```
gnn_score > config.gnn_threshold      (default: 0.75)
AND drain_pct > config.drain_threshold (default: 3%)
AND heuristic_flags >= 1
```

Otherwise, the system operates in **alert-only mode** — notifying guardians without autonomous action.

---

## Documentation

- **[PROJECT-DETAIL.md](PROJECT-DETAIL.md)** — Full architecture & design specification
- **[PROJECT-DEVELOPMENT-PHASE-TRACKING.md](PROJECT-DEVELOPMENT-PHASE-TRACKING.md)** — Sprint tracker and implementation status
- **[CLAUDE.md](CLAUDE.md)** — Agent operating manual
- **[RELEASE-NOTES.md](RELEASE-NOTES.md)** — Release history and changes

---

## Testing

SmartSentinel includes comprehensive testing at all levels:

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests (requires Anvil)
npm run test:coverage    # With coverage report

# Replay historical exploits
npm run test:replay -- --exploit beanstalk-2022

# Generate test fixtures
npm run fixtures-generator
```

### Test Coverage

- **Unit Tests**: Configuration loading, logging, threat scoring, gas escalation
- **Integration Tests**: Anvil fork management, transaction simulation, front-run response
- **Exploit Replay**: Beanstalk (2022), Saddle Finance, Euler Finance, Nomad Bridge

---

## Development

### Project Structure

```
smart-contract-sentinel-agent/
├── src/
│   ├── main.ts                    # Entry point (CLI + daemon)
│   ├── core/
│   │   ├── sentinel.ts            # Main orchestrator
│   │   ├── decision-engine.ts     # Multi-signal threat decision
│   │   └── config-loader.ts       # Config validation
│   ├── listeners/                 # Mempool + RPC pool
│   ├── filters/                   # Pre-filter heuristics
│   ├── simulation/                # Anvil + drain calculator
│   ├── ml/                        # GNN client + threat scorer
│   ├── response/                  # Flashbots front-runner
│   ├── alerts/                    # Dispatcher + Telegram/PagerDuty
│   └── storage/                   # Incident log + attacker registry
├── ml-pipeline/                   # Python GNN training + serving
│   ├── serve.py                  # FastAPI inference server
│   ├── train.py                  # Training entrypoint
│   └── models/
│       └── gnn_classifier.py     # DA-GNN architecture
├── tests/
│   ├── unit/                     # Unit tests
│   └── integration/              # Integration tests
├── config/                       # YAML configurations
├── data/                         # Runtime data
└── scripts/                      # Utility scripts
```

### Key Commands

```bash
# Development
npm run dev                    # Hot-reload development mode
npm run build                 # Build for production
npm run typecheck             # TypeScript type checking
npm run lint                  # ESLint

# Operations
npm run status                # System health check
npm run incident-log          # View recent incidents
npm run replay-exploit        # Simulate historical exploit

# Contract Management
npm run add-monitored-contract  # Interactive CLI for adding contracts
```

---

## Deployment

### Docker (Recommended)

```bash
# Build image
docker build -t smartsentinel:latest .

# Run with environment variables
docker run -d \
  -e AAVE_GUARDIAN_KEY="0x..." \
  -e TELEGRAM_BOT_TOKEN="..." \
  -e PAGERDUTY_API_KEY="..." \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  smartsentinel:latest
```

### Kubernetes

```bash
# Apply Helm chart
helm install smartsentinel ./helm-chart \
  --set chains.ethereum.rpcEndpoints[0]="https://..." \
  --set guardians.aave.privateKeyEnv="AAVE_GUARDIAN_KEY"
```

### Manual Deployment

```bash
# Build
npm run build

# Run with PM2
pm2 start dist/main.js --name smartsentinel

# Or as systemd service
sudo systemctl enable smartsentinel
sudo systemctl start smartsentinel
```

---

## Security & Risks

### Risk Mitigations

- **Triple-gate decision**: No single signal can trigger pause
- **Simulation before action**: Never pause without confirmed drain
- **Alert-only by default**: Auto-pause must be explicitly enabled
- **Private relay only**: All defensive txs via Flashbots, never public mempool
- **Append-only logging**: Complete audit trail in SQLite
- **Rollback capable**: GNN model versioning with 30-second rollback

### Known Limitations

- **Private mempool attacks**: Sophisticated attackers using Flashbots Protect may avoid detection
- **Gas wars**: Attacker may outbid pause tx (mitigated with 15% premium)
- **Model staleness**: GNN requires monthly retraining as new patterns emerge

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

---

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

SmartSentinel builds on research from:
- **FlashGuard** (ACM CODASPY 2025) - Mempool-based defense
- **Forta Network** - ML-based anomaly detection
- **DA-GNN / BC-GNN** (2024-2025) - Graph neural networks for vulnerability detection
- **SmartBugs** - Vulnerability dataset and benchmarks
- **DeFiHackLabs** - Historical exploit database

---

## Contact

- **Issues**: [GitHub Issues](https://github.com/your-org/smart-contract-sentinel-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/smart-contract-sentinel-agent/discussions)
- **Security**: security@smartsentinel.io

---

## Roadmap

### v0.3.0 (Q2 2026)
- [ ] Multi-chain expansion (Arbitrum, Optimism, Base, Polygon)
- [ ] Enhanced ML model with retraining pipeline
- [ ] Production deployment guides

### v0.4.0 (Q3 2026)
- [ ] Solana support via Jito integration
- [ ] Knowledge brain auto-updates
- [ ] Web dashboard for monitoring

### v1.0.0 (Q4 2026)
- [ ] Full production release
- [ ] Security audit completion
- [ ] Beta program graduation
