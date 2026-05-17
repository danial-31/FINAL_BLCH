# Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     DEX Protocol                         │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │  TokenA  │    │  TokenB  │    │ GovernanceToken  │   │
│  │  (TKA)   │    │  (TKB)   │    │     (DGT)        │   │
│  └────┬─────┘    └────┬─────┘    └────────┬─────────┘   │
│       │               │                   │              │
│       └───────┬────────┘                  │              │
│               ▼                           ▼              │
│         ┌──────────┐              ┌───────────────┐      │
│         │ AMMPool  │◄─────────────│  DEXGovernor  │      │
│         │ (x*y=k)  │  setFee()    │               │      │
│         └────┬─────┘              └───────┬───────┘      │
│              │                            │              │
│              │ getSpotPrice()             │              │
│              ▼                            ▼              │
│         ┌──────────┐              ┌───────────────┐      │
│         │  Price   │              │  DEXTimelock  │      │
│         │  Oracle  │              │  (2-day delay)│      │
│         │  (TWAP)  │              └───────────────┘      │
│         └──────────┘                                     │
│                                                          │
│         ┌──────────┐                                     │
│         │DEXFactory│ (deploys pools)                     │
│         └──────────┘                                     │
└─────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
   ┌──────────┐              ┌──────────────┐
   │ Frontend │              │   Subgraph   │
   │ (Next.js)│              │ (The Graph)  │
   └──────────┘              └──────────────┘
```

## Components

### Core Contracts

**AMMPool** — The main DeFi primitive. Implements constant-product formula (x·y=k):
- `addLiquidity` / `removeLiquidity` — LP token management
- `swapAForB` / `swapBForA` — token swaps with 0.3% fee
- `getAmountOut` — price calculation with fee
- Protected by `ReentrancyGuard` and `SafeERC20`

**DEXFactory** — Deploys and tracks AMM pools. Ensures canonical token ordering and prevents duplicate pools.

### Tokens

**TokenA / TokenB** — Standard ERC20 with mint/burn. Used as trading pair.

**LPToken** — Minted to liquidity providers proportional to their share. Owned exclusively by AMMPool.

**GovernanceToken (DGT)** — ERC20Votes token. Holders vote on protocol changes.

### Governance

**DEXGovernor** — OpenZeppelin Governor with:
- 1 block voting delay
- ~1 week voting period
- 4% quorum
- 100k DGT proposal threshold

**DEXTimelock** — 2-day execution delay between proposal passing and execution. Gives users time to exit if they disagree.

### Oracle

**PriceOracle** — TWAP oracle reading from AMMPool:
- Keepers call `recordPrice()` periodically
- `getTWAP()` returns time-weighted average over 30 minutes
- Resistant to single-block manipulation

## Deployment Flow

1. Deploy TokenA, TokenB, GovernanceToken
2. Deploy DEXFactory → create AMMPool
3. Deploy PriceOracle pointing to pool
4. Deploy DEXTimelock (2-day delay)
5. Deploy DEXGovernor with DGT token + Timelock
6. Grant Timelock PROPOSER role to Governor
7. Transfer AMMPool ownership to Timelock
8. Add initial liquidity
9. Start recording oracle prices

## L2 Deployment

Target: **Arbitrum Sepolia** (chainId: 421614)
- Lower gas costs (~10-100x cheaper than mainnet)
- EVM-equivalent — all contracts deploy unchanged
- Verify on Arbiscan after deployment

## Security Model

- All admin functions behind Timelock (2-day delay)
- Governance controls fee changes
- Reentrancy protection on all state-changing pool functions
- TWAP oracle for manipulation-resistant pricing
- Access control via OpenZeppelin Ownable
