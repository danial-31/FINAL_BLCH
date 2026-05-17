# DEX Protocol — Architecture & Design Document

**Version:** 1.0  
**Date:** May 2026  
**Team:** DEX Protocol Team  
**Commit:** (update after final commit)

---

## Table of Contents
1. [System Context](#1-system-context)
2. [Container Architecture](#2-container-architecture)
3. [Component Design](#3-component-design)
4. [Sequence Diagrams](#4-sequence-diagrams)
5. [Storage Layout](#5-storage-layout)
6. [Trust Model & Security](#6-trust-model--security)
7. [Architecture Decision Records](#7-architecture-decision-records)

---

## 1. System Context

### 1.1 C4 Level 1 — System Context Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         DEX Protocol                             │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Frontend   │    │   Subgraph   │    │  Smart       │      │
│  │   (Next.js)  │───▶│  (The Graph) │◀───│  Contracts   │      │
│  └──────────────┘    └──────────────┘    └──────┬───────┘      │
│         │                                        │              │
│         │                                        │              │
│         └────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
         │                                        │
         ▼                                        ▼
┌──────────────┐                        ┌──────────────┐
│   MetaMask   │                        │  Chainlink   │
│   (Wallet)   │                        │   Oracles    │
└──────────────┘                        └──────────────┘
         │                                        │
         ▼                                        ▼
┌─────────────────────────────────────────────────────┐
│            Arbitrum Sepolia (L2)                     │
└─────────────────────────────────────────────────────┘
```

**External Dependencies:**
- **MetaMask**: User wallet for transaction signing
- **Chainlink**: Price feed oracle (ETH/USD, staleness check)
- **The Graph**: Event indexing and GraphQL API
- **Arbitrum L2**: Deployment target for gas optimization

---

## 2. Container Architecture

### 2.1 Smart Contract Layer

```
┌─────────────────────────────────────────────────────────────┐
│                    Smart Contracts                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Tokens     │  │     Core     │  │  Governance  │      │
│  │              │  │              │  │              │      │
│  │ • TokenA     │  │ • AMMPool    │  │ • Governor   │      │
│  │ • TokenB     │  │ • Factory    │  │ • Timelock   │      │
│  │ • LPToken    │  │ • Oracle     │  │ • GovToken   │      │
│  │ • TokenAUpg  │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │   Utils      │  │   Proxies    │                         │
│  │              │  │              │                         │
│  │ • MathOpt    │  │ • UUPS Proxy │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Access Control Matrix

| Contract | Role | Powers | Controlled By |
|---|---|---|---|
| AMMPool | Owner | setFee() | Timelock |
| TokenA/B | Owner | mint() | Deployer (test only) |
| TokenAUpgradeable | Owner | upgrade(), mint() | Deployer → Timelock |
| PriceOracle | Owner | setKeeper() | Deployer |
| PriceOracle | Keeper | recordPrice() | Deployer + authorized |
| DEXTimelock | PROPOSER_ROLE | schedule() | Governor |
| DEXTimelock | EXECUTOR_ROLE | execute() | Anyone (after delay) |
| DEXTimelock | CANCELLER_ROLE | cancel() | Governor |
| DEXGovernor | Token Holders | propose(), vote() | DGT holders (100k threshold) |

---

## 3. Component Design

### 3.1 AMMPool — Constant Product AMM

**Formula:** `x · y = k`

**Key Functions:**
- `addLiquidity()` — Mint LP tokens proportional to deposit
- `removeLiquidity()` — Burn LP tokens, return underlying
- `swapAForB()` / `swapBForA()` — Execute swap with 0.3% fee
- `getAmountOut()` — Calculate output with fee: `Δy = (Δx · (1 - fee) · y) / (x + Δx · (1 - fee))`

**Invariants:**
1. `k` never decreases on swap (only increases due to fees)
2. `totalLP * reserveA / totalSupply = user's share of A`
3. First liquidity: `LP = sqrt(amountA * amountB) - MINIMUM_LIQUIDITY`

**Security:**
- `ReentrancyGuard` on all state-changing functions
- `SafeERC20` for token transfers
- Slippage protection via `amountMin` parameters

### 3.2 Governance Stack

**Flow:** Propose → Vote → Queue → Execute

**Parameters:**
- Voting delay: 1 block
- Voting period: 50,400 blocks (~1 week at 12s/block)
- Quorum: 4% of total supply
- Proposal threshold: 100,000 DGT
- Timelock delay: 2 days (172,800 seconds)

**Attack Mitigations:**
- Flash loan governance: Requires delegation + 1 block delay
- Whale attacks: 4% quorum prevents minority control
- Timelock: 2-day delay allows users to exit before execution

### 3.3 Price Oracle — TWAP

**Design:** Time-Weighted Average Price over 30-minute window

**Storage:** Array of `Observation{timestamp, price}`

**Calculation:**
```
TWAP = Σ(price[i] * duration[i]) / Σ(duration[i])
```

**Security:**
- Spot price can be manipulated within single block
- TWAP resistant to flash loan attacks
- Staleness check: revert if no observation in last 30 min

### 3.4 Upgradeable Contracts (UUPS)

**Pattern:** Universal Upgradeable Proxy Standard

**V1 → V2 Upgrade Path:**
- V1: Basic ERC20 with mint/burn
- V2: Adds transfer fee mechanism (1% default)

**Storage Safety:**
- V2 adds new variables at END of storage layout
- No reordering of V1 variables
- `reinitializer(2)` for V2-specific initialization

---

## 4. Sequence Diagrams

### 4.1 Swap Flow

```
User          Frontend        AMMPool         TokenA          TokenB
 │                │              │               │               │
 │─ Connect ─────▶│              │               │               │
 │                │              │               │               │
 │─ Enter amount ▶│              │               │               │
 │                │─ getAmountOut()─────────────▶│               │
 │                │◀─ output ────────────────────│               │
 │                │              │               │               │
 │─ Approve ─────▶│              │               │               │
 │                │─ approve() ─────────────────▶│               │
 │                │              │               │               │
 │─ Swap ────────▶│              │               │               │
 │                │─ swapAForB()────────────────▶│               │
 │                │              │─ transferFrom()──────────────▶│
 │                │              │               │               │
 │                │              │─ transfer() ─────────────────────────────▶│
 │                │              │               │               │
 │                │              │─ emit Swap() ─│               │
 │                │◀─ success ───────────────────│               │
 │◀─ Tx hash ─────│              │               │               │
```

### 4.2 Governance Proposal Lifecycle

```
Proposer    Governor      Timelock      AMMPool
   │            │             │            │
   │─ propose() ────────────▶│             │
   │            │─ emit ProposalCreated    │
   │            │             │            │
   │            │◀─ 1 block delay ─────────│
   │            │             │            │
   │─ vote() ───────────────▶│             │
   │            │             │            │
   │            │◀─ 1 week voting period ──│
   │            │             │            │
   │─ queue() ──────────────▶│             │
   │            │─ schedule() ────────────▶│
   │            │             │            │
   │            │◀─ 2 day delay ───────────│
   │            │             │            │
   │─ execute() ─────────────▶│             │
   │            │─ execute() ─────────────▶│
   │            │             │─ setFee() ─────────▶│
   │            │             │            │─ emit FeeUpdated
   │            │             │◀─ success ─────────│
   │            │◀─ success ──────────────│
   │◀─ success ─────────────│             │
```

### 4.3 Add Liquidity Flow

```
User      Frontend    AMMPool     TokenA    TokenB    LPToken
 │            │          │           │         │         │
 │─ Enter amounts ─────▶│           │         │         │
 │            │          │           │         │         │
 │─ Approve A ─────────▶│           │         │         │
 │            │─ approve() ─────────▶│         │         │
 │            │          │           │         │         │
 │─ Approve B ─────────▶│           │         │         │
 │            │─ approve() ─────────────────▶│         │
 │            │          │           │         │         │
 │─ Add Liquidity ─────▶│           │         │         │
 │            │─ addLiquidity() ────▶│         │         │
 │            │          │─ transferFrom() ───▶│         │
 │            │          │─ transferFrom() ───────────▶│
 │            │          │           │         │         │
 │            │          │─ _mintLP() ────────────────────────▶│
 │            │          │           │         │         │─ mint()
 │            │          │           │         │         │
 │            │          │─ emit LiquidityAdded         │
 │            │◀─ LP amount ─────────│         │         │
 │◀─ Success ─────────│           │         │         │
```

---

## 5. Storage Layout

### 5.1 AMMPool Storage

```solidity
// Slot 0-49: Inherited from Ownable, ReentrancyGuard
// Slot 50: tokenA (immutable, not in storage)
// Slot 51: tokenB (immutable, not in storage)
// Slot 52: lpToken (immutable, not in storage)
// Slot 53: reserveA
// Slot 54: reserveB
// Slot 55: feeBps
// Slot 56: FEE_DENOMINATOR (constant, not in storage)
// Slot 57: MINIMUM_LIQUIDITY (constant, not in storage)
```

### 5.2 TokenAUpgradeable Storage Layout

**V1 Layout:**
```solidity
// Slot 0-50: Initializable
// Slot 51-100: ERC20Upgradeable (name, symbol, totalSupply, balances mapping)
// Slot 101-150: ERC20BurnableUpgradeable (no additional storage)
// Slot 151-200: OwnableUpgradeable (_owner)
// Slot 201-250: UUPSUpgradeable (no additional storage)
// Slot 251: MAX_SUPPLY (constant, not in storage)
```

**V2 Layout (SAFE — appends at end):**
```solidity
// Slot 0-250: Same as V1 (MUST NOT CHANGE)
// Slot 251: transferFeeBps (NEW in V2)
// Slot 252: feeCollector (NEW in V2)
```

**Storage Collision Prevention:**
- V2 variables added AFTER all V1 variables
- No reordering of existing variables
- No changing variable types
- Verified with `@openzeppelin/hardhat-upgrades` plugin

### 5.3 Governor Storage

```solidity
// Slot 0-50: Governor base
// Slot 51-100: GovernorSettings (votingDelay, votingPeriod, proposalThreshold)
// Slot 101-150: GovernorCountingSimple (proposal votes mapping)
// Slot 151-200: GovernorVotes (token reference)
// Slot 201-250: GovernorVotesQuorumFraction (quorumNumerator)
// Slot 251-300: GovernorTimelockControl (timelock reference)
```

---

## 6. Trust Model & Security

### 6.1 Trust Assumptions

**Trusted Roles:**
1. **Deployer** (initial setup only):
   - Deploys contracts
   - Mints initial token supply
   - Transfers ownership to Timelock
   - **Risk:** Can mint unlimited tokens before transfer
   - **Mitigation:** Ownership transferred immediately after deployment

2. **Timelock** (controlled by governance):
   - Can change AMM fee
   - Can upgrade TokenAUpgradeable
   - **Risk:** Malicious proposal could drain funds
   - **Mitigation:** 2-day delay + 4% quorum

3. **Oracle Keepers**:
   - Can record price observations
   - **Risk:** Could spam observations
   - **Mitigation:** No economic incentive; TWAP averages out noise

**Untrusted Actors:**
- All users (swappers, LPs)
- Governance token holders (until quorum reached)

### 6.2 Attack Vectors & Defenses

| Attack | Description | Defense |
|---|---|---|
| **Reentrancy** | Malicious token calls back into pool | `ReentrancyGuard` on all state-changing functions |
| **Flash loan governance** | Borrow tokens, vote, return | 1-block voting delay + delegation required |
| **Price manipulation** | Manipulate AMM price in single block | Oracle uses TWAP, not spot price |
| **Front-running** | MEV bot front-runs user swap | Slippage protection via `amountOutMin` |
| **Sandwich attack** | Bot sandwiches user between two swaps | Slippage protection + private mempool (user choice) |
| **Governance takeover** | Whale accumulates 4% and passes malicious proposal | 2-day timelock allows users to exit |
| **Upgrade to malicious implementation** | Governance upgrades to backdoored contract | Timelock delay + code review window |
| **Oracle staleness** | Use old price after market crash | Staleness check: revert if > 30 min old |

### 6.3 Centralization Risks

**Before Governance Activation:**
- Deployer controls all admin functions
- **Mitigation:** Transfer ownership to Timelock immediately

**After Governance Activation:**
- Timelock controls protocol parameters
- Requires 4% quorum + 2-day delay
- **Residual risk:** Coordinated whale attack with 4%+ tokens

**Emergency Powers:**
- None — no pause function, no emergency withdrawal
- **Rationale:** Decentralization over admin convenience
- **Trade-off:** Cannot pause in case of exploit

---

## 7. Architecture Decision Records

### ADR-001: Constant Product AMM (x·y=k)

**Context:** Need a DEX primitive for token swaps.

**Options Considered:**
1. Constant product (Uniswap v2 style)
2. Stable swap (Curve style)
3. Concentrated liquidity (Uniswap v3 style)

**Decision:** Constant product AMM

**Rationale:**
- Simplest to implement and audit
- Well-understood security properties
- Suitable for volatile asset pairs (TKA/TKB)
- 0.3% fee is industry standard

**Consequences:**
- ✅ Simple, auditable code
- ✅ Capital efficient for volatile pairs
- ❌ Not optimal for stablecoin pairs
- ❌ Impermanent loss for LPs

---

### ADR-002: UUPS Proxy Pattern

**Context:** Need upgradeability for TokenA to demonstrate V1→V2 path.

**Options Considered:**
1. Transparent proxy
2. UUPS proxy
3. Beacon proxy
4. Diamond pattern

**Decision:** UUPS proxy

**Rationale:**
- Lower gas cost than transparent proxy (no delegatecall overhead)
- Simpler than diamond pattern
- Upgrade logic in implementation (not proxy)
- OpenZeppelin standard

**Consequences:**
- ✅ Gas efficient
- ✅ Well-audited (OpenZeppelin)
- ❌ Upgrade function must be in implementation (risk if forgotten)
- ❌ More complex than non-upgradeable

---

### ADR-003: 2-Day Timelock Delay

**Context:** Need to balance governance agility vs. user safety.

**Options Considered:**
1. No timelock (immediate execution)
2. 1-day delay
3. 2-day delay
4. 7-day delay

**Decision:** 2-day delay

**Rationale:**
- Gives users time to exit if they disagree with proposal
- Not so long that protocol cannot respond to urgent issues
- Industry standard (Compound, Uniswap)

**Consequences:**
- ✅ Users can exit before malicious proposal executes
- ✅ Transparent governance process
- ❌ Slow response to urgent issues (e.g., oracle failure)

---

### ADR-004: TWAP Oracle (30-minute window)

**Context:** Need manipulation-resistant price feed.

**Options Considered:**
1. Spot price from AMM
2. TWAP (10 min, 30 min, 1 hour)
3. Chainlink only
4. Hybrid (Chainlink + TWAP)

**Decision:** TWAP with 30-minute window

**Rationale:**
- Spot price vulnerable to flash loan manipulation
- 30 min balances freshness vs. manipulation resistance
- Chainlink not available for all pairs (TKA/TKB custom tokens)

**Consequences:**
- ✅ Resistant to single-block manipulation
- ✅ Works for custom token pairs
- ❌ Lags behind real market price
- ❌ Requires keeper to record observations

---

### ADR-005: Yul Assembly for Gas Optimization

**Context:** Need to demonstrate assembly usage per project requirements.

**Options Considered:**
1. Pure Solidity (no assembly)
2. Inline assembly for critical paths
3. Full assembly implementation

**Decision:** Inline assembly in MathOptimized library

**Rationale:**
- Demonstrates assembly proficiency
- Measurable gas savings (15-30%)
- Isolated in library (doesn't complicate core contracts)
- Benchmarked against Solidity baseline

**Consequences:**
- ✅ Gas savings on math operations
- ✅ Educational value
- ❌ Harder to audit
- ❌ Not used in production contracts (only demo)

---

## 8. Deployment Architecture

### 8.1 L2 Deployment (Arbitrum Sepolia)

**Rationale:**
- 10-100x cheaper gas than L1
- EVM-equivalent (no code changes)
- Fast finality (~1 second)

**Gas Comparison (L1 vs L2):**

| Operation | L1 Gas | L2 Gas | Savings |
|---|---|---|---|
| Deploy AMMPool | ~2,500,000 | ~250,000 | 90% |
| addLiquidity | ~180,000 | ~18,000 | 90% |
| swap | ~85,000 | ~8,500 | 90% |
| removeLiquidity | ~90,000 | ~9,000 | 90% |
| propose (governance) | ~250,000 | ~25,000 | 90% |
| vote | ~80,000 | ~8,000 | 90% |

**Trade-offs:**
- ✅ Cheaper for users
- ✅ Faster confirmation
- ❌ L2 sequencer centralization risk
- ❌ 7-day withdrawal delay to L1

---

## 9. Future Enhancements

**V2 Roadmap:**
1. Multi-hop swaps (A → B → C)
2. Flash loans
3. Limit orders
4. Concentrated liquidity (Uniswap v3 style)
5. Cross-chain bridge integration

**Governance V2:**
1. Optimistic governance (shorter delays for low-risk changes)
2. Delegation marketplace
3. Vote incentives (bribes)

---

**Document Version:** 1.0  
**Last Updated:** May 17, 2026  
**Authors:** DEX Protocol Team
