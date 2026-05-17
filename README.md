# DEX Protocol — Final Project

A decentralized exchange (AMM) built on Ethereum L2 with on-chain governance and price oracle.

## Overview

This project implements a full DeFi protocol stack:
- **AMM Pool** — Constant-product market maker (x·y=k) with 0.3% swap fee
- **ERC20 Tokens** — TKA, TKB trading pair + DGT governance token + LP token
- **Governance** — On-chain voting with timelock execution delay (2-day delay, 4% quorum)
- **Price Oracle** — TWAP oracle resistant to flash loan manipulation (30-min window)
- **Factory** — CREATE and CREATE2 deployment patterns for deterministic addresses
- **UUPS Upgradeable** — TokenAUpgradeable with V1→V2 upgrade demonstrating proxy pattern
- **Yul Assembly** — MathOptimized library with gas-optimized functions (sqrt, mulDiv, etc.)
- **Fork Tests** — Integration tests with mainnet Chainlink, Uniswap, USDC
- **Frontend** — Next.js interface with MetaMask integration, live stats, price charts
- **Subgraph** — The Graph indexer for swap/liquidity history
- **CI/CD** — GitHub Actions pipeline for automated testing

## Quick Start

```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Run coverage
npx hardhat coverage

# Deploy locally
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost
```

## Deploy to L2 (Arbitrum Sepolia)

1. Copy `.env.example` to `.env` and fill in your keys
2. Get testnet ETH from [Arbitrum Sepolia faucet](https://faucet.arbitrum.io)
3. Deploy:

```bash
npx hardhat run scripts/deploy.js --network arbitrumSepolia
```

4. Verify contracts:

```bash
npx hardhat verify --network arbitrumSepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Frontend

```bash
cd frontend
npm install
# Copy deployed addresses to .env.local
npm run dev
```

## Subgraph

```bash
cd subgraph
npm install -g @graphprotocol/graph-cli
graph init
# Update subgraph.yaml with deployed pool address
graph deploy --studio dex-protocol
```

## Test Coverage

| File | Statements | Functions | Lines |
|---|---|---|---|
| AMMPool.sol | 93% | 100% | 95% |
| DEXFactory.sol | 100% | 100% | 100% |
| PriceOracle.sol | 100% | 100% | 100% |
| TokenA.sol | 100% | 100% | 100% |
| **All files** | **91.28%** | **87.84%** | **91.28%** |

**Total Tests:** 90 passing (96 total with 6 optional fork tests)

## Security

- ReentrancyGuard on all pool state-changing functions
- SafeERC20 for all token transfers
- Ownable access control
- 2-day governance timelock
- TWAP oracle (30-min window)
- Slither analysis: see `audit/audit-report.md`

## Architecture

See `docs/architecture.md` for full system diagram and component descriptions.

## Gas Report

Run `REPORT_GAS=true npx hardhat test` to generate `gas-report.txt`.

Key operations (approximate):
| Operation | Gas |
|---|---|
| addLiquidity (first) | ~180,000 |
| addLiquidity (subsequent) | ~120,000 |
| swapAForB | ~85,000 |
| removeLiquidity | ~90,000 |

## Project Structure

```
contracts/
  core/         AMMPool, DEXFactory (CREATE + CREATE2)
  tokens/       TokenA, TokenB, LPToken, GovernanceToken, TokenAUpgradeable (UUPS)
  governance/   DEXGovernor, DEXTimelock
  oracle/       PriceOracle (TWAP)
  utils/        MathOptimized (Yul assembly)
test/           Hardhat/Mocha tests (90 passing, 96 total)
scripts/        Deployment scripts
frontend/       Next.js + ethers.js UI
subgraph/       The Graph indexer
audit/          Security audit report
docs/           Architecture documentation (9+ pages)
.github/        CI/CD workflows
```

## Requirements Met ✅

- ✅ **80+ tests** — 96 tests total (90 passing, 6 optional fork tests)
- ✅ **90%+ coverage** — 91.28% line coverage
- ✅ **UUPS Upgradeable** — TokenAUpgradeable V1→V2 with transfer fee
- ✅ **CREATE2** — DEXFactory with deterministic pool addresses
- ✅ **Yul Assembly** — MathOptimized library with gas benchmarks
- ✅ **Fork Tests** — Mainnet integration (Chainlink, Uniswap, USDC)
- ✅ **Governance** — DEXGovernor + DEXTimelock (2-day delay, 4% quorum)
- ✅ **Oracle** — PriceOracle with TWAP (30-min window)
- ✅ **Frontend** — Next.js with swap/liquidity UI, live stats, charts
- ✅ **Subgraph** — The Graph schema + mappings
- ✅ **CI/CD** — GitHub Actions pipeline
- ✅ **Documentation** — Architecture doc (9+ pages), Audit report (8+ pages)
- ✅ **L2 Deployment** — Configured for Arbitrum/Optimism Sepolia

## Networks

| Network | Chain ID | Status |
|---|---|---|
| Hardhat (local) | 31337 | Development |
| Arbitrum Sepolia | 421614 | Testnet deployment |
| Optimism Sepolia | 11155420 | Alternative L2 |

## Team

| Member | Role |
|---|---|
| — | Smart Contracts |
| — | Testing & Security |
| — | Frontend & Subgraph |
| — | Governance & Oracle |
