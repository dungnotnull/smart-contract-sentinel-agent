# SmartSentinel — Threat Taxonomy

> Categorized attack patterns monitored by SmartSentinel

## Monitored Attack Patterns

### 1. Flash Loan Attacks
- **Mechanism:** Borrow large amount in a single transaction, manipulate state, repay
- **Detection:** Flash loan detection in simulation (CALL to known lending pool + large borrow)
- **Historical examples:** Beanstalk ($182M), Cream Finance ($130M), bZx ($1M)

### 2. Oracle Manipulation
- **Mechanism:** Manipulate price oracle (spot, TWAP) to exploit protocol at false prices
- **Detection:** Oracle price delta > 50% in single transaction
- **Historical examples:** Mango Markets ($114M), Bonq DAO ($120M)

### 3. Reentrancy (Single & Cross-Contract)
- **Mechanism:** Re-enter a contract before state updates complete
- **Detection:** Reentrancy depth > 1 in simulation call trace
- **Historical examples:** The DAO ($60M), Fei Protocol ($80M)

### 4. Governance Attacks
- **Mechanism:** Acquire governance tokens via flash loan, vote maliciously, repay
- **Detection:** Large governance token transfer + vote in same transaction
- **Historical examples:** Beanstalk ($182M governance flash loan attack)

### 5. MEV / Sandwich Attacks
- **Mechanism:** Front-run and back-run a victim transaction for profit
- **Detection:** Gas anomaly + monitored contract target + value extraction pattern
- **Scale:** $900M+ extracted in 2025 across major chains

## Known Detection Gaps (Phase 1)
- Private mempool attacks (Flashbots Protect) — mitigated by MEV-Share hints
- Cross-chain attacks (bridge exploits) — Phase 3
- Solana attacks (no mempool) — Phase 2 (Jito)
- Novel zero-day composability patterns — mitigated by GNN structural analysis