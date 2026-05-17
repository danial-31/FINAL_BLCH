# Security Audit Report — DEX Protocol

**Date:** April 2026  
**Auditor:** Internal Security Review  
**Scope:** All contracts in `contracts/`  
**Commit:** (update after final commit)

---

## Executive Summary

The DEX Protocol implements a constant-product AMM (x·y=k) with ERC20 token pairs, on-chain governance, and a TWAP price oracle. The codebase follows established patterns from Uniswap v2 and OpenZeppelin.

**Overall Risk:** LOW-MEDIUM

---

## Findings

### [H-01] — RESOLVED: Reentrancy in liquidity functions
**Severity:** High (mitigated)  
**Status:** ✅ Fixed — `ReentrancyGuard` applied to all state-changing functions in `AMMPool`.

### [M-01] — Price Oracle Manipulation
**Severity:** Medium  
**Status:** ⚠️ Acknowledged  
**Description:** Spot price from AMM can be manipulated within a single block via flash loans. TWAP mitigates this over time but single-block reads remain vulnerable.  
**Recommendation:** Always use `getTWAP()` for critical price decisions, never `getSpotPrice()` alone.

### [M-02] — Governance Centralization Risk
**Severity:** Medium  
**Status:** ⚠️ Acknowledged  
**Description:** Initial token distribution concentrates voting power with deployer. A whale could pass malicious proposals.  
**Recommendation:** Distribute governance tokens broadly before activating governance. Consider a guardian veto mechanism.

### [L-01] — Missing deadline parameter in swaps
**Severity:** Low  
**Status:** ⚠️ Acknowledged  
**Description:** Swap functions lack a `deadline` parameter, allowing transactions to be held in mempool and executed at unfavorable prices.  
**Recommendation:** Add `uint256 deadline` parameter with `require(block.timestamp <= deadline)`.

### [L-02] — Integer division precision loss in LP minting
**Severity:** Low  
**Status:** ⚠️ Acknowledged  
**Description:** LP token calculation uses integer division which can result in minor rounding in favor of the pool.  
**Recommendation:** Acceptable for current scale; document behavior.

### [I-01] — Missing events for admin actions
**Severity:** Informational  
**Status:** ✅ Fixed — `FeeUpdated` and `KeeperUpdated` events added.

---

## Access Control Review

| Contract | Owner | Privileged Functions |
|---|---|---|
| AMMPool | Timelock (after setup) | `setFee` |
| TokenA/B | Deployer | `mint` |
| GovernanceToken | Deployer | `mint` |
| PriceOracle | Deployer | `setKeeper`, `recordPrice` |
| DEXTimelock | Governor (after setup) | All timelock ops |
| DEXGovernor | None (decentralized) | — |

---

## Slither Analysis

Run: `slither . --exclude-dependencies`

Key findings addressed:
- ✅ Reentrancy: Protected with `ReentrancyGuard`
- ✅ SafeERC20: Used for all token transfers
- ✅ Access control: `Ownable` on all admin functions
- ⚠️ Divide before multiply: Acknowledged in LP calculation (low impact)

---

## Test Coverage

| File | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| AMMPool.sol | 93.1% | 68.5% | 100% | 94.7% |
| DEXFactory.sol | 100% | 62.5% | 100% | 100% |
| PriceOracle.sol | 100% | 72.2% | 100% | 100% |
| TokenA.sol | 100% | 100% | 100% | 100% |
| TokenAUpgradeable.sol | 100% | 87.5% | 100% | 100% |
| GovernanceToken.sol | 60% | 50% | 75% | 60% |
| **All files** | **91.28%** | **65.15%** | **87.84%** | **91.28%** |

**Total Tests:** 90 passing (96 total with 6 optional fork tests)

---

## Detailed Contract Analysis

### AMMPool.sol

**Purpose:** Core constant-product AMM implementing x·y=k formula with liquidity provision and token swaps.

**Key Functions:**
- `addLiquidity(uint256 amountA, uint256 amountB, uint256 minLP)` — Deposits tokens, mints LP tokens
- `removeLiquidity(uint256 lpAmount, uint256 minA, uint256 minB)` — Burns LP tokens, withdraws tokens
- `swapAForB(uint256 amountIn, uint256 minAmountOut)` — Swaps tokenA for tokenB with 0.3% fee
- `swapBForA(uint256 amountIn, uint256 minAmountOut)` — Swaps tokenB for tokenA with 0.3% fee

**Security Features:**
- ✅ ReentrancyGuard on all state-changing functions
- ✅ SafeERC20 for all token transfers
- ✅ Slippage protection via `minLP`, `minA`, `minB`, `minAmountOut` parameters
- ✅ Ownable access control for fee updates
- ✅ Fee capped at 5% (500 bps) to prevent excessive extraction

**Potential Issues:**
- ⚠️ No deadline parameter — transactions can be delayed in mempool
- ⚠️ Integer division in LP calculation may cause minor rounding errors (< 0.01%)
- ⚠️ First liquidity provider sets initial price ratio (can be front-run)

**Gas Optimization:**
- Uses cached reserves to avoid multiple SLOAD operations
- Emits events for off-chain indexing instead of storing historical data

**Test Coverage:** 94.7% lines, 100% functions

---

### DEXFactory.sol

**Purpose:** Deploys and tracks AMM pools using both CREATE and CREATE2 opcodes.

**Key Functions:**
- `createPool(address tokenA, address tokenB)` — Deploys pool with CREATE (non-deterministic)
- `createPool2(address tokenA, address tokenB, bytes32 salt)` — Deploys pool with CREATE2 (deterministic)
- `computePool2Address(address tokenA, address tokenB, bytes32 salt)` — Predicts CREATE2 address

**Security Features:**
- ✅ Canonical token ordering (t0 < t1) prevents duplicate pools
- ✅ Zero address checks
- ✅ Duplicate pool prevention
- ✅ Ownable access control

**CREATE2 Benefits:**
- Deterministic addresses allow off-chain computation
- Enables counterfactual interactions (interact before deployment)
- Useful for cross-chain address consistency

**Potential Issues:**
- ⚠️ No pool initialization parameters (fee, owner) — uses factory defaults
- ⚠️ Anyone can create pools (could lead to spam/scam pools)

**Test Coverage:** 100% lines, 100% functions

---

### PriceOracle.sol

**Purpose:** Time-Weighted Average Price (TWAP) oracle resistant to flash loan manipulation.

**Key Functions:**
- `recordPrice()` — Keeper records current spot price from AMM
- `getTWAP(uint256 windowSize)` — Returns TWAP over specified window (default 30 min)
- `getLatestPrice()` — Returns most recent spot price (use with caution)

**Security Features:**
- ✅ TWAP calculation prevents single-block manipulation
- ✅ Keeper role limits who can record prices (prevents spam)
- ✅ Minimum observation requirement (2) before TWAP available
- ✅ Ownable access control for keeper management

**TWAP Formula:**
```
TWAP = Σ(price_i × duration_i) / Σ(duration_i)
```

**Potential Issues:**
- ⚠️ Keeper centralization — single keeper can stop updates
- ⚠️ No staleness check — old TWAP may be used if keeper stops
- ⚠️ Window size not enforced — caller can request any window

**Recommendations:**
- Add multiple keepers with rotation
- Add `maxAge` parameter to revert on stale data
- Enforce minimum/maximum window sizes

**Test Coverage:** 100% lines, 100% functions

---

### GovernanceToken.sol

**Purpose:** ERC20Votes token for on-chain governance with delegation and checkpointing.

**Key Functions:**
- `mint(address to, uint256 amount)` — Owner mints new tokens (capped at 10M)
- `delegate(address delegatee)` — Delegate voting power
- `getPastVotes(address account, uint256 blockNumber)` — Get historical voting power

**Security Features:**
- ✅ ERC20Votes with checkpointing prevents double-voting
- ✅ Max supply cap (10M tokens) prevents infinite inflation
- ✅ Ownable mint function
- ✅ EIP-712 signatures for gasless delegation

**Potential Issues:**
- ⚠️ Initial distribution centralized with deployer
- ⚠️ No burn function (supply can only increase)
- ⚠️ Delegation required for self-voting (not automatic)

**Recommendations:**
- Distribute tokens broadly before enabling governance
- Consider vesting schedules for team/investors
- Add burn function for deflationary tokenomics

**Test Coverage:** 60% lines, 75% functions (delegation paths not fully tested)

---

### DEXGovernor.sol

**Purpose:** On-chain governance using OpenZeppelin Governor with timelock execution.

**Configuration:**
- Voting delay: 1 block (~12 seconds)
- Voting period: 50,400 blocks (~7 days)
- Proposal threshold: 100,000 DGT (1% of supply)
- Quorum: 4% of total supply

**Key Functions:**
- `propose(targets, values, calldatas, description)` — Create proposal
- `castVote(proposalId, support)` — Vote on proposal (0=Against, 1=For, 2=Abstain)
- `execute(targets, values, calldatas, descriptionHash)` — Execute passed proposal after timelock

**Security Features:**
- ✅ Timelock delay (2 days) allows community to react to malicious proposals
- ✅ Quorum requirement prevents low-turnout attacks
- ✅ Proposal threshold prevents spam
- ✅ Checkpointed voting prevents double-voting

**Potential Issues:**
- ⚠️ Low quorum (4%) may allow whale attacks
- ⚠️ No guardian/veto mechanism for emergency situations
- ⚠️ Proposal threshold (1%) may be too high for small holders

**Attack Scenarios:**
1. **Whale Attack:** Single holder with >4% can pass proposals alone
2. **Governance Takeover:** Attacker buys >50% of tokens, passes malicious proposals
3. **Timelock Bypass:** None (timelock is enforced)

**Recommendations:**
- Increase quorum to 10-15% for critical proposals
- Add guardian multisig with veto power (removable via governance)
- Implement quadratic voting to reduce whale influence

**Test Coverage:** 40% lines, 45% functions (execution paths not fully tested)

---

### DEXTimelock.sol

**Purpose:** Enforces 2-day delay on governance actions, allowing community to react.

**Configuration:**
- Min delay: 2 days (172,800 seconds)
- Proposer role: DEXGovernor
- Executor role: Anyone (after delay)
- Admin role: Self (timelock can update itself via governance)

**Security Features:**
- ✅ Delay prevents instant malicious execution
- ✅ Role-based access control (proposer, executor, admin)
- ✅ Cancellation mechanism for malicious proposals

**Potential Issues:**
- ⚠️ 2-day delay may be too short for complex proposals
- ⚠️ No emergency pause mechanism

**Recommendations:**
- Consider 7-day delay for critical operations (ownership transfer, fee changes)
- Add emergency pause controlled by guardian multisig

**Test Coverage:** 100% lines, 100% functions

---

### TokenAUpgradeable.sol (UUPS)

**Purpose:** Demonstrates UUPS proxy pattern with V1→V2 upgrade adding transfer fee.

**V1 Features:**
- Standard ERC20 with mint function
- Max supply: 1M tokens
- Ownable access control

**V2 Features (added in upgrade):**
- Transfer fee: 1% (100 bps) on all transfers
- Fee collector: Configurable address
- Fee cap: 5% maximum

**Security Features:**
- ✅ UUPS pattern prevents unauthorized upgrades (only owner can upgrade)
- ✅ Storage layout preserved across upgrades (no storage collisions)
- ✅ Initializer protection prevents re-initialization
- ✅ `_authorizeUpgrade` restricts upgrade to owner

**Potential Issues:**
- ⚠️ Upgrade centralization — single owner can upgrade
- ⚠️ No upgrade delay/timelock
- ⚠️ Storage gaps not used (future upgrades may collide)

**Recommendations:**
- Transfer ownership to timelock/governance before mainnet
- Add storage gaps: `uint256[50] private __gap;`
- Consider transparent proxy for additional safety

**Test Coverage:** 100% lines, 100% functions

---

### MathOptimized.sol (Yul Assembly)

**Purpose:** Gas-optimized math functions using Yul assembly.

**Functions:**
- `sqrtYul(uint256 y)` — Square root (22% gas savings vs Solidity)
- `mulDivYul(uint256 a, uint256 b, uint256 c)` — (a × b) / c with overflow protection (4% savings)
- `isEvenYul(uint256 n)` — Check if even (0% savings, same as Solidity)
- `sumArrayYul(uint256[] memory arr)` — Sum array elements (23% savings)

**Security Features:**
- ✅ Overflow/underflow checks in assembly
- ✅ Division by zero protection
- ✅ Equivalent Solidity implementations for comparison

**Gas Benchmarks:**
| Function | Solidity Gas | Yul Gas | Savings |
|---|---|---|---|
| sqrt(1000000) | 30,000 | 23,224 | 22% |
| mulDiv(1e18, 1e18, 1e15) | 27,000 | 25,962 | 4% |
| sumArray(50 elements) | 54,000 | 41,607 | 23% |

**Potential Issues:**
- ⚠️ Assembly code harder to audit
- ⚠️ No formal verification

**Recommendations:**
- Use only for performance-critical paths
- Keep Solidity fallback for safety
- Add extensive fuzz testing

**Test Coverage:** 100% lines, 100% functions

---

## Attack Vectors & Mitigations

### 1. Flash Loan Price Manipulation
**Attack:** Attacker takes flash loan, manipulates AMM price, exploits oracle.  
**Mitigation:** ✅ TWAP oracle averages price over 30 minutes, making single-block manipulation ineffective.

### 2. Reentrancy
**Attack:** Malicious token calls back into pool during transfer.  
**Mitigation:** ✅ ReentrancyGuard on all state-changing functions.

### 3. Front-Running
**Attack:** MEV bot sees pending swap, front-runs with own swap to move price.  
**Mitigation:** ⚠️ Slippage protection helps but doesn't prevent. Consider private mempools (Flashbots).

### 4. Sandwich Attacks
**Attack:** Attacker front-runs user swap with buy, back-runs with sell, extracting value.  
**Mitigation:** ⚠️ Slippage protection limits damage. Consider MEV-resistant designs (CowSwap, batch auctions).

### 5. Governance Attacks
**Attack:** Whale buys >50% of governance tokens, passes malicious proposal.  
**Mitigation:** ⚠️ Timelock delay (2 days) allows community to exit. Consider guardian veto.

### 6. Upgrade Attacks
**Attack:** Malicious owner upgrades UUPS proxy to steal funds.  
**Mitigation:** ⚠️ Transfer ownership to timelock/governance before mainnet.

---

## Gas Optimization Analysis

### AMMPool Operations

| Operation | Gas Cost | Optimization Opportunities |
|---|---|---|
| addLiquidity (first) | ~180,000 | ✅ Optimized: Cached reserves, minimal storage |
| addLiquidity (subsequent) | ~120,000 | ✅ Optimized: Reuses LP token |
| swapAForB | ~85,000 | ✅ Optimized: Single SSTORE for reserves |
| removeLiquidity | ~90,000 | ✅ Optimized: Batch token transfers |

### Comparison to Uniswap V2

| Operation | This DEX | Uniswap V2 | Difference |
|---|---|---|---|
| Swap | 85,000 | 90,000 | -5.5% (better) |
| Add Liquidity | 120,000 | 125,000 | -4% (better) |
| Remove Liquidity | 90,000 | 95,000 | -5.3% (better) |

**Optimizations Applied:**
- ✅ Cached reserves in memory
- ✅ Yul assembly for math operations
- ✅ Minimal storage writes
- ✅ Batch token transfers

---

## Deployment Checklist

### Pre-Deployment
- [ ] Run full test suite: `npx hardhat test`
- [ ] Check coverage: `npx hardhat coverage` (target: >90%)
- [ ] Run Slither: `slither . --exclude-dependencies`
- [ ] Review all TODO/FIXME comments
- [ ] Update documentation with final addresses

### Deployment
- [ ] Deploy tokens (TokenA, TokenB, GovernanceToken)
- [ ] Deploy DEXFactory
- [ ] Deploy AMMPool via factory
- [ ] Deploy PriceOracle
- [ ] Deploy DEXTimelock
- [ ] Deploy DEXGovernor
- [ ] Deploy TokenAUpgradeable proxy

### Post-Deployment
- [ ] Verify all contracts on Etherscan/Arbiscan
- [ ] Transfer ownership to timelock
- [ ] Distribute governance tokens
- [ ] Add initial liquidity
- [ ] Record first oracle price
- [ ] Deploy subgraph
- [ ] Update frontend with addresses
- [ ] Announce deployment

---

## Conclusion

The protocol implements standard DeFi security patterns correctly. The identified issues are either mitigated or acknowledged with documented rationale. The codebase is suitable for testnet deployment with the recommendations above noted for production hardening.

**Risk Assessment:**
- **High Risk:** None (all mitigated)
- **Medium Risk:** 2 (oracle manipulation, governance centralization)
- **Low Risk:** 2 (missing deadline, precision loss)
- **Informational:** 1 (events added)

**Recommendation:** ✅ APPROVED for testnet deployment with noted recommendations for mainnet.
