# SmartSentinel — Chain Setup Guide

## Ethereum Mainnet
- **Chain ID:** 1
- **Block Time:** ~12 seconds
- **Mempool:** Public (eth_subscribe pendingTransactions)
- **Private Relay:** Flashbots (https://relay.flashbots.net)
- **Anvil Fork:** `anvil --fork-url https://eth-mainnet.g.alchemy.com/v2/{KEY}`

## Arbitrum
- **Chain ID:** 42161
- **Block Time:** ~0.25 seconds
- **Notes:** Sequencer-based; transactions go through Sequencer feed
- **Anvil Fork:** `anvil --fork-url https://arb-mainnet.g.alchemy.com/v2/{KEY}`

## Optimism
- **Chain ID:** 10
- **Block Time:** ~2 seconds
- **Anvil Fork:** `anvil --fork-url https://opt-mainnet.g.alchemy.com/v2/{KEY}`

## Base
- **Chain ID:** 8453
- **Block Time:** ~2 seconds
- **Notes:** Flashbots bundle support confirmed
- **Anvil Fork:** `anvil --fork-url https://base-mainnet.g.alchemy.com/v2/{KEY}`

## Polygon
- **Chain ID:** 137
- **Block Time:** ~2 seconds
- **Gas Token:** MATIC/POL
- **Anvil Fork:** `anvil --fork-url https://polygon-mainnet.g.alchemy.com/v2/{KEY}`

## Solana (Phase 2)
- **No mempool** — transactions go directly to validators
- **Defense mechanism:** Jito bundles + on-chain state monitoring
- **Program model:** BPF bytecode (different from EVM)