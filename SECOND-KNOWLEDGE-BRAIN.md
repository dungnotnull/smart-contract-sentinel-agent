# SECOND-KNOWLEDGE-BRAIN.md — SmartSentinel Living Knowledge Corpus

> **APPEND-ONLY FILE.** New entries go at the TOP of each section with a dated header.  
> Updated nightly by `scripts/crawl-knowledge.py`.  
> Top-5 semantically relevant entries injected into the agent's system prompt at startup.  
> **Never delete or modify existing entries. The history of learning is itself valuable.**

---

## How This File Works

At agent startup, `scripts/crawl-knowledge.py` queries the local HNSW vector index at `~/.sentinel/knowledge-index/` and retrieves the entries most relevant to the current detection task (e.g., "detect flash loan reentrancy", "score GNN bytecode vulnerability", "simulate drain in Anvil fork"). Those entries are prepended to the agent's system context.

**The compounding learning loop:**
1. Nightly: `scripts/crawl-knowledge.py` fetches new papers from arXiv cs.CR, IEEE, ACM DL
2. A cheap LLM (DeepSeek-chat) extracts: Key Insight, Relevant Module, Tags
3. Insights embedded locally with `sentence-transformers/all-MiniLM-L6-v2` (no API cost)
4. Indexed in HNSW (`hnswlib`) at `~/.sentinel/knowledge-index/`
5. At startup: top-5 most relevant entries retrieved and prepended to system prompt
6. Result: the longer SmartSentinel runs, the better its detection decisions become

**Entry format:**
```markdown
### [Title] (Source: [URL])
**Key Insight:** [1 sentence — specific and technical]
**Relevance to SmartSentinel:** [1-2 sentences — name the specific module]
**Applied In:** [src/path/file.ts or ml-pipeline/path.py — leave blank if not yet]
**Tags:** [tag1, tag2, tag3]
```

**Categories:**
- `FLASH-LOAN-DETECTION` — flash loan attack patterns, detection algorithms, FlashGuard-style mitigations
- `MEMPOOL-DEFENSE` — mempool monitoring, front-running mechanics, MEV dynamics, private relays
- `GNN-VULNERABILITY-CLASSIFIER` — graph neural networks for smart contract bytecode analysis
- `SIMULATION-ENGINE` — local fork simulation, Anvil, state delta analysis
- `REENTRANCY-ORACLE-ATTACKS` — reentrancy patterns, oracle manipulation, cross-contract exploits
- `MEV-AND-FRONTRUN` — MEV taxonomy, sandwich attacks, Flashbots, Jito, defense strategies
- `FORENSICS-AND-INCIDENT-RESPONSE` — post-incident analysis, attacker attribution, DeFi hack databases

---

## [FLASH-LOAN-DETECTION] — Updated: 2026-05-31

### FlashGuard: Real-Time Detection and Mitigation of Non-Price Flash Loan Attacks (Source: https://arxiv.org/pdf/2503.01944)
**Key Insight:** FlashGuard targets smart contract function signatures (4-byte selectors) in the mempool to identify non-price flash loan attacks in real-time, then disrupts their atomicity via a "dusting counterattack" that exploits the brief mempool visibility window — and could have prevented up to $405.71M in losses across analyzed incidents.
**Relevance to SmartSentinel:** Direct architectural blueprint for our pre-filter's function selector matching and the front-run response executor. The "dusting counterattack" pattern (submitting a competing tx to break attack atomicity) is exactly what our Flashbots bundle strategy implements. FlashGuard focuses on non-price attacks (logic vulnerabilities), while SmartSentinel extends this to oracle manipulation as well.
**Applied In:** src/filters/function-selector.ts, src/response/front-runner.ts
**Tags:** flash-loan, mempool, function-selector, atomicity-disruption, ACM-CODASPY-2025

---

### Flash Loan Resistant DeFi Protocols: TWAP, Circuit Breakers, Reentrancy Guards (Source: https://www.calibraint.com/blog/flash-loan-resistant-defi-protocols)
**Key Insight:** Modern DeFi security in 2026 uses TWAP/VWAP oracles (replacing single-source spot prices), on-chain circuit breakers that pause on extreme volatility, and mandatory time-locks — together these make flash-loan-amplified oracle manipulation attacks significantly harder.
**Relevance to SmartSentinel:** Informs the `DrainCalculator` and oracle manipulation detector: when simulation detects a price delta > 50% in a single transaction (a TWAP-bypassing attack), this is a strong signal. Also informs recommendations we give protocols using SmartSentinel to harden their own contracts (add to incident report's "prevention recommendations" section).
**Applied In:** src/simulation/drain-calculator.ts (oracle delta threshold), src/alerts/forensic-reporter.ts
**Tags:** TWAP, VWAP, oracle-manipulation, circuit-breaker, DeFi-hardening

---

## [MEMPOOL-DEFENSE] — Updated: 2026-05-31

### MEV in DeFi 2025-2026: $900M Extracted, Aave $44M Single Transaction (Source: https://dev.to/ohmygod/building-mev-resistant-defi-a-practitioners-guide-to-protecting-protocols-and-users-from-value-13al)
**Key Insight:** MEV extraction exceeded $900M across major chains in 2025 alone; the Aave $50M swap incident (March 2026) demonstrated that even legitimate large transactions are vulnerable to sandwich attacks — MEV bots extracted $44M from a single trade; Jito tips on Solana now average 0.01 SOL/tx, making the problem chain-agnostic.
**Relevance to SmartSentinel:** Quantifies the problem magnitude we're solving. The Aave incident confirms that alert-only mode (what OZ Defender provides) is insufficient for high-value transactions — autonomous response is needed. Also highlights Solana Jito as the correct Phase 2 defense mechanism.
**Applied In:** src/core/decision-engine.ts (urgency calibration), docs/threat-taxonomy.md
**Tags:** MEV, sandwich-attack, Aave-2026, Jito, Solana, quantification

---

### Flashbots MEV-Share: Partial Order Flow Visibility for Defenders (Source: https://drpc.org/blog/mev-protection-nodes/)
**Key Insight:** Flashbots MEV-Share provides partial hints about private transaction order flow — not the full transaction, but enough signal (contract address, function selector hints) to detect suspicious activity that never enters the public mempool, covering ~40% of Ethereum transactions invisible to standard mempool monitoring.
**Relevance to SmartSentinel:** Critical for detection coverage. Our `FlashbotsMevShareListener` must parse MEV-Share event hints to catch sophisticated attackers who use Flashbots Protect for their own transactions. Without MEV-Share, we only see ~60% of Ethereum transaction flow.
**Applied In:** src/listeners/flashbots-relay.ts
**Tags:** Flashbots, MEV-Share, private-mempool, order-flow, detection-coverage

---

### Implementing MEV Protection 2025: Commit-Reveal, Private Relays, Batch Auctions (Source: https://medium.com/@ancilartech/implementing-effective-mev-protection-in-2025-c8a65570be3a)
**Key Insight:** Commit-reveal schemes (submit hash of trade intent, reveal after delay) and batch auctions (settle all trades at uniform price) are the most robust MEV protections but require protocol-level changes; for existing protocols, private mempool routing (Flashbots, dRPC MEV-protect) is the most practical near-term defense.
**Relevance to SmartSentinel:** Informs the "prevention recommendations" section of our forensic report — when we detect a potential attack on a protocol, we can recommend commit-reveal or batch auction migration as long-term hardening. Also confirms that our Flashbots bundle submission for defensive txs is the state-of-the-art approach for existing protocols.
**Applied In:** src/alerts/forensic-reporter.ts (prevention recommendations section)
**Tags:** commit-reveal, batch-auction, MEV-protection, protocol-hardening, Flashbots

---

## [GNN-VULNERABILITY-CLASSIFIER] — Updated: 2026-05-31

### DA-GNN: Dual Attention Graph Neural Network for Smart Contract Vulnerability Detection (Source: https://www.sciencedirect.com/science/article/abs/pii/S1389128624000707)
**Key Insight:** DA-GNN combines GRU-encoded opcode basic block embeddings with graph attention (GAT) on the Control Flow Graph to detect smart contract vulnerabilities from bytecode alone — no source code required — achieving state-of-the-art accuracy on reentrancy, timestamp dependence, and integer overflow detection.
**Relevance to SmartSentinel:** This is the primary model architecture for our GNN classifier. The "no source code required" property is critical because attacker contracts are typically deployed without verified source code on Etherscan. Implementation: `GATConv` (PyTorch Geometric) for CFG-level attention, `torch.nn.GRU` for opcode block semantics, dual fusion head for threat score.
**Applied In:** ml-pipeline/models/gnn_classifier.py
**Tags:** DA-GNN, GATConv, GRU, CFG, bytecode, PyTorch-Geometric, vulnerability-detection

---

### BC-GNN: Bytecode-Based Vulnerability Detection via Heterogeneous Graph Neural Networks (Source: https://ieeexplore.ieee.org/iel8/11182602/11182624/11183399.pdf)
**Key Insight:** BC-GNN extracts opcode sequences, control flow graphs (CFGs), and data flow graphs (DFGs) from bytecode, integrates them into a unified heterogeneous graph, and uses GNNs to automatically detect multiple vulnerability types — achieving high accuracy across 8 vulnerability categories without any source code.
**Relevance to SmartSentinel:** Extends DA-GNN's approach by adding DFG edges (not just CFG), capturing data dependencies that some vulnerabilities (cross-function reentrancy) rely on. Implement as an optional enhanced feature in `gnn_classifier.py` — use `HeteroData` in PyTorch Geometric to represent CFG + DFG heterogeneous graph.
**Applied In:** ml-pipeline/models/gnn_classifier.py (HeteroData extension), ml-pipeline/models/feature_extractor.py
**Tags:** BC-GNN, heterogeneous-graph, DFG, CFG, bytecode, IEEE-2024

---

### G-Scan: GNN for Line-Level Vulnerability Detection — 93.02% F1 (Source: https://arxiv.org/pdf/2307.08549)
**Key Insight:** G-Scan achieves 93.02% F1 at contract-level and 93.69% at line-level vulnerability localization by incorporating variable dependencies and code hierarchies into graph modeling — and contributes the first large-scale real-world smart contract dataset with fine-grained reentrancy annotations.
**Relevance to SmartSentinel:** Provides our target performance benchmark: F1 > 0.90 is achievable with GNN on bytecode graphs (G-Scan validates this). The fine-grained dataset they open-source is additional training data for our reentrancy classifier. The 93.69% line-level localization means future versions of SmartSentinel can identify the specific vulnerable function, not just the contract.
**Applied In:** ml-pipeline/eval/benchmark.py (performance target), ml-pipeline/data/datasets.py (G-Scan dataset)
**Tags:** G-Scan, F1-score, reentrancy, line-level, benchmark, open-dataset

---

### Dynamic ML-Based Vulnerability Detection on Smart Contracts at Runtime (Source: https://arxiv.org/pdf/2102.07420)
**Key Insight:** Monitoring blockchain transactions at runtime (not static analysis of source code) is a fundamentally new direction that catches reentrancy "as the pattern unfolds" across multiple transactions — traditional static tools analyze code at rest and miss dynamic cross-contract interactions.
**Relevance to SmartSentinel:** Validates our core architectural decision: runtime detection > static analysis. The paper's runtime monitoring approach (watching transaction traces) complements our simulation engine — we detect BEFORE execution (mempool), while this approach detects DURING execution as a backup layer for missed cases.
**Applied In:** src/simulation/tx-simulator.ts (runtime trace analysis in simulation), src/core/sentinel.ts
**Tags:** runtime-detection, dynamic-analysis, reentrancy, transaction-monitoring, arxiv-2021

---

### AI Agents for Smart Contract Auditing: $3.8B Lost in 2024-2025 (Source: https://dev.to/ohmygod/how-ai-agents-can-audit-smart-contracts-in-2026-a-technical-deep-dive-5gl)
**Key Insight:** The $3.8B lost to smart contract exploits in 2024-2025 could largely have been prevented by autonomous AI agents that model economic impact of flash loan-amplified attacks, reason about cross-chain message passing, and simulate governance attacks — capabilities human auditors cannot scale to match.
**Relevance to SmartSentinel:** Provides the business case context and confirms the market need. The "economic impact modeling" capability (quantifying TVL drain) is exactly what our `DrainCalculator` implements. The cross-chain mention flags Phase 3 as important — cross-chain composability attacks are the next frontier SmartSentinel must address.
**Applied In:** docs/threat-taxonomy.md, PROJECT-DETAIL.md (executive summary)
**Tags:** AI-agent, autonomous-defense, economic-impact, cross-chain, 2024-2025-losses

---

## [SIMULATION-ENGINE] — Updated: 2026-05-31

### Forta Attack Simulation: Local Fork Detection Before Exploitation (Source: https://www.forta.org/blog/attack-simulation)
**Key Insight:** Forta's Saddle Finance detection demonstrated that local blockchain fork simulation (using Ganache; SmartSentinel uses Anvil) can detect $11M attacks by simulating suspicious contract functions before the exploit transaction is confirmed — catching the attack in the mempool window.
**Relevance to SmartSentinel:** Direct operational precedent for our simulation engine. Key lessons: (1) simulating parameterless functions covers ~60% of exploits; (2) fuzzing parameters covers an additional ~20%; (3) balance change tracking (all ERC20 + ETH) is more reliable than opcode-level analysis for drain detection. We upgrade from Ganache to Anvil for 10-100× speedup.
**Applied In:** src/simulation/tx-simulator.ts, src/simulation/drain-calculator.ts
**Tags:** Forta, Ganache, Anvil, simulation, Saddle-Finance, drain-detection

---

### Forta ML Predictive Detection: 4 Hacks ($23.5M) Caught Before Exploitation (Source: https://www.forta.org/blog/how-fortas-predictive-ml-models-detect-attacks-before-exploitation)
**Key Insight:** OpenZeppelin's ML-based Forta bot trained on 100 malicious (Etherscan-labeled "exploit"/"heist") vs. 130,000 benign (Etherscan-verified) contracts detected 4 real hacks worth $23.5M in real-time before they occurred — using opcode-level classifier, not source code.
**Relevance to SmartSentinel:** Validates our ML approach and provides the training data methodology. Their dataset split (malicious: exploit-labeled, benign: verified contracts) is exactly what we replicate using DeFiHackLabs + SmartBugs. The key insight: verified contracts are a reliable benign proxy because attackers rarely verify. We extend their opcode classifier with GNN structural modeling.
**Applied In:** ml-pipeline/data/datasets.py (Etherscan verified as benign proxy), ml-pipeline/train.py
**Tags:** Forta, OpenZeppelin, opcode-classifier, predictive-detection, training-data-methodology

---

## [REENTRANCY-ORACLE-ATTACKS] — Updated: 2026-05-31

### Top 10 Smart Contract Vulnerabilities 2026: Cross-Chain + Oracle Reentrancy Combinations (Source: https://www.nadcab.com/blog/smart-contract-vulnerabilities-guide)
**Key Insight:** In 2025-2026, the most damaging attacks combine oracle manipulation with reentrancy across multiple contracts — the attacker uses a flash loan to skew an oracle, then exploits reentrancy to drain at the manipulated price before the oracle corrects; single-contract analysis tools miss the cross-contract interaction.
**Relevance to SmartSentinel:** Confirms our simulation engine must track state changes across ALL contracts in the call trace, not just the target contract. The `TxSimulator` must capture: (1) reentrancy depth in call trace, (2) oracle slot reads before/after, (3) all ERC20 transfers across the full call tree. This multi-contract simulation is the key advantage over rule-based detection.
**Applied In:** src/simulation/tx-simulator.ts (full call trace analysis), src/simulation/drain-calculator.ts
**Tags:** cross-contract-reentrancy, oracle-manipulation, flash-loan-combination, 2025-2026, call-trace

---

### SmartBugs: A Framework for Analyzing Ethereum Smart Contracts (Source: https://github.com/smartbugs/smartbugs)
**Key Insight:** SmartBugs provides 47,587 labeled smart contracts spanning 9 vulnerability types with standardized analysis toolchain integration — the most comprehensive publicly available labeled dataset for smart contract vulnerability ML training.
**Relevance to SmartSentinel:** Primary training dataset for our GNN classifier. Use SmartBugs-Wild (real contracts, 47k) as the main training corpus, with DeFiHackLabs (400+ DeFi-specific exploits) for domain adaptation fine-tuning. SmartBugs includes ground truth from Slither, Mythril, and Oyente — use these as additional weak supervision labels.
**Applied In:** ml-pipeline/data/datasets.py
**Tags:** SmartBugs, labeled-dataset, training-data, 47k-contracts, vulnerability-types

---

## [MEV-AND-FRONTRUN] — Updated: 2026-05-31

### Jito on Solana: Bundle-Based MEV and Defense (Source: https://solana.com/developers/guides/advanced/mev-protection)
**Key Insight:** Solana has no public mempool — transactions go directly to validators. Jito's block engine accepts bundles (ordered groups of transactions) from searchers and validators, and provides DontFront protection by routing transactions through Jito's private channels, bypassing the sandwich attack vector entirely.
**Relevance to SmartSentinel:** Defines the Phase 2 Solana architecture: since there is no mempool to monitor, defense on Solana relies on (1) monitoring on-chain state changes in real-time (program logs via WebSocket) and (2) submitting defensive Jito bundles when anomalous state transitions are detected. Completely different from Ethereum's mempool-first approach.
**Applied In:** src/listeners/ (Phase 2: Solana account monitor), src/response/jito-submitter.ts (Phase 2)
**Tags:** Jito, Solana, no-mempool, bundle, DontFront, Phase-2-architecture

---

## [FORENSICS-AND-INCIDENT-RESPONSE] — Updated: 2026-05-31

### DeFiHackLabs: 400+ Labeled Smart Contract Exploit Database (Source: https://github.com/SunWeb3Sec/DeFiHackLabs)
**Key Insight:** DeFiHackLabs maintains the most comprehensive open-source database of DeFi exploit transactions with labeled attacker contracts, victim contracts, attack vectors, and financial losses — providing both training data for ML models and ground-truth for detection system validation.
**Relevance to SmartSentinel:** (1) Training data: 400+ labeled exploit contracts for GNN fine-tuning. (2) Testing: the `scripts/replay-exploit.ts` CLI uses DeFiHackLabs transactions for backtesting. (3) Attacker registry: known attacker wallet addresses from DeFiHackLabs seed `data/known-attackers.json`. Weekly sync from this repo keeps our attacker registry current.
**Applied In:** ml-pipeline/data/datasets.py, data/known-attackers.json, scripts/replay-exploit.ts
**Tags:** DeFiHackLabs, exploit-database, training-data, attacker-registry, backtesting

---

## Knowledge Brain Statistics

| Metric | Value |
|---|---|
| Total entries | 15 |
| Categories covered | 5 of 7 |
| Last manual crawl | 2026-05-31 |
| Last auto-crawl | Never (crawler not yet implemented) |
| Embedding index status | Not initialized |
| Oldest entry | 2026-05-31 |

*Updated automatically after each crawl by `scripts/crawl-knowledge.py`.*

---

## Crawler Configuration Reference

```yaml
# ~/.sentinel/knowledge-crawler.yml

sources:
  arxiv:
    queries:
      - "cs.CR smart contract vulnerability detection GNN"
      - "cs.CR DeFi flash loan attack mempool defense"
      - "cs.CR reentrancy oracle manipulation blockchain"
      - "cs.LG graph neural network bytecode security"
      - "cs.CR MEV maximal extractable value mitigation"
    max_results_per_query: 5
    cadence: weekly  # Security research is fast-moving but not daily

  semantic_scholar:
    topics:
      - "smart contract vulnerability graph neural network"
      - "flash loan attack detection defense"
      - "mempool front-running blockchain security"
      - "DeFi exploit reentrancy oracle manipulation"
    cadence: weekly

  ieee_xplore:
    queries:
      - "smart contract GNN vulnerability 2024 2025"
      - "blockchain security deep learning bytecode"
    cadence: monthly

  acm_dl:
    queries:
      - "DeFi flash loan mempool defense 2024 2025"
    cadence: monthly

  github_releases:
    repos:
      - SunWeb3Sec/DeFiHackLabs        # New exploit entries for training data
      - smartbugs/smartbugs             # Dataset updates
      - foundry-rs/foundry              # Anvil improvements
      - flashbots/flashbots-bundle-ethers  # SDK updates
      - OpenZeppelin/openzeppelin-contracts  # New security primitives
    cadence: daily

  security_blogs:
    sources:
      - "https://rekt.news"             # DeFi exploit post-mortems
      - "https://www.forta.org/blog"    # Forta detection methodology
    cadence: weekly

summarizer:
  provider: deepseek
  model: deepseek-chat
  max_tokens: 300
  prompt: |
    Extract from this paper/release:
    1. Key Insight (1 sentence — specific, technical, actionable for a smart contract security agent)
    2. Relevance to ONE of: flash-loan detection, mempool defense, GNN vulnerability classification,
       simulation engine, reentrancy/oracle attacks, MEV/frontrun, or incident forensics
    3. The most implementable technique: which specific module in the codebase does this inform?
    4. Tags (comma-separated, lowercase, hyphenated)
    Format as JSON only. If not relevant to smart contract security or blockchain defense,
    return {"skip": true}.
```
