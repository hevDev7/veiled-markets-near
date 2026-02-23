# Veiled Markets v16 — Contract Reference

> **Program ID:** `veiled_markets_v16.aleo`
> **Network:** Aleo Testnet
> **Total Transitions:** 32 (including constructor)
> **Total Lines:** 2576
> **Imports:** `credits.aleo`, `test_usdcx_stablecoin.aleo`

---

## Table of Contents

1. [Constants](#1-constants)
2. [Records (Private Data)](#2-records-private-data)
3. [Structs (On-Chain Data Structures)](#3-structs-on-chain-data-structures)
4. [Mappings (On-Chain State)](#4-mappings-on-chain-state)
5. [Market Status Lifecycle](#5-market-status-lifecycle)
6. [Transitions — ALEO Token](#6-transitions--aleo-token)
7. [Transitions — USDCX Token](#7-transitions--usdcx-token)
8. [Transitions — Shared Lifecycle](#8-transitions--shared-lifecycle)
9. [Transitions — Dispute / Challenge](#9-transitions--dispute--challenge)
10. [Transitions — Multi-Sig Treasury](#10-transitions--multi-sig-treasury)
11. [Fee Structure](#11-fee-structure)
12. [FPMM AMM Mathematics](#12-fpmm-amm-mathematics)
13. [Claim Key System (Double-Claim Prevention)](#13-claim-key-system-double-claim-prevention)
14. [Credit Accounting System](#14-credit-accounting-system)
15. [v16 Changes from v15](#15-v16-changes-from-v15)

---

## 1. Constants

| Name | Type | Value | Description |
|------|------|-------|-------------|
| `MARKET_STATUS_ACTIVE` | u8 | 1 | Market open for trading |
| `MARKET_STATUS_CLOSED` | u8 | 2 | Past deadline, awaiting resolution |
| `MARKET_STATUS_RESOLVED` | u8 | 3 | Resolved + finalized (payouts open) |
| `MARKET_STATUS_CANCELLED` | u8 | 4 | Cancelled (refunds open) |
| `STATUS_PENDING_RESOLUTION` | u8 | 5 | Resolved but in challenge window |
| `OUTCOME_1` .. `OUTCOME_4` | u8 | 1..4 | Outcome identifiers |
| `TOKEN_ALEO` | u8 | 1 | ALEO native token |
| `TOKEN_USDCX` | u8 | 2 | USDCX stablecoin |
| `PROTOCOL_FEE_BPS` | u128 | 50 | 0.5% protocol fee |
| `CREATOR_FEE_BPS` | u128 | 50 | 0.5% creator fee |
| `LP_FEE_BPS` | u128 | 100 | 1.0% LP fee (sell only) |
| `FEE_DENOMINATOR` | u128 | 10000 | Basis point denominator |
| `CHALLENGE_WINDOW_BLOCKS` | u64 | 2880 | ~12 hours at 15s/block |
| `MIN_TRADE_AMOUNT` | u128 | 1000 | Minimum buy/sell amount (0.001 token) |
| `MIN_DISPUTE_BOND` | u128 | 1000000 | 1.0 ALEO dispute bond |
| `MIN_LIQUIDITY` | u128 | 10000 | Minimum LP amount (0.01 token) |
| `MULTISIG_CONFIG_KEY` | u8 | 0 | Config mapping key |
| `ACTION_WITHDRAW` | u8 | 1 | Multi-sig action type |

---

## 2. Records (Private Data)

Records are private — only the owner can see them. They are consumed and re-created on each use.

### OutcomeShare
Represents shares in a specific outcome. Created by `buy_shares_*`, consumed by `sell_shares`, `redeem_shares`, or `claim_refund`.

| Field | Type | Description |
|-------|------|-------------|
| `owner` | address | Share holder |
| `market_id` | field | Market identifier |
| `outcome` | u8 | Outcome index (1-4) |
| `quantity` | u128 | Number of shares (microcredits) |
| `share_nonce` | field | Unique nonce for claim key derivation |
| `token_type` | u8 | 1=ALEO, 2=USDCX |

### LPToken
Represents a liquidity provider position. Created by `create_market`, `add_liquidity`. Consumed by `remove_liquidity`, `withdraw_lp_resolved`, or `claim_lp_refund`.

| Field | Type | Description |
|-------|------|-------------|
| `owner` | address | LP provider |
| `market_id` | field | Market identifier |
| `lp_shares` | u128 | LP share amount |
| `lp_nonce` | field | Unique nonce for claim key derivation |
| `token_type` | u8 | 1=ALEO, 2=USDCX |

### DisputeBondReceipt
Created when disputing a resolution. Can be claimed back if the dispute is upheld.

| Field | Type | Description |
|-------|------|-------------|
| `owner` | address | Disputer |
| `market_id` | field | Market identifier |
| `proposed_outcome` | u8 | Outcome the disputer believes is correct |
| `bond_amount` | u128 | Bond deposited (always MIN_DISPUTE_BOND) |
| `dispute_nonce` | field | Unique nonce |
| `token_type` | u8 | Always TOKEN_ALEO (1) — bonds in ALEO only |

### RefundClaim
Created when claiming a refund on cancelled markets. Serves as a receipt.

| Field | Type | Description |
|-------|------|-------------|
| `owner` | address | Claimer |
| `market_id` | field | Market identifier |
| `amount` | u128 | Refund amount |
| `claim_nonce` | field | Nonce from original share/LP token |
| `token_type` | u8 | 1=ALEO, 2=USDCX |

---

## 3. Structs (On-Chain Data Structures)

### Market
Core market data. Stored in `markets` mapping.

| Field | Type | Description |
|-------|------|-------------|
| `id` | field | Market identifier (derived hash) |
| `creator` | address | Market creator |
| `resolver` | address | Who can resolve the market |
| `question_hash` | field | BHP256 hash of the question text |
| `category` | u8 | 1-7 (Politics, Sports, Crypto, etc.) |
| `num_outcomes` | u8 | 2, 3, or 4 |
| `deadline` | u64 | Block height — last block for trading |
| `resolution_deadline` | u64 | Block height — must resolve before this |
| `status` | u8 | 1=Active, 2=Closed, 3=Resolved, 4=Cancelled, 5=PendingResolution |
| `created_at` | u64 | Block height when created |
| `token_type` | u8 | 1=ALEO, 2=USDCX |

### AMMPool
AMM state for a market. Stored in `amm_pools` mapping.

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | field | Market identifier |
| `reserve_1` | u128 | Reserve for outcome 1 |
| `reserve_2` | u128 | Reserve for outcome 2 |
| `reserve_3` | u128 | Reserve for outcome 3 (0 if <3 outcomes) |
| `reserve_4` | u128 | Reserve for outcome 4 (0 if <4 outcomes) |
| `total_liquidity` | u128 | Sum of all LP contributions (NOT updated by redeem_shares) |
| `total_lp_shares` | u128 | Sum of all LP shares outstanding |
| `total_volume` | u128 | Cumulative trading volume |

### MarketResolution
Resolution state. Stored in `market_resolutions` mapping.

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | field | Market identifier |
| `winning_outcome` | u8 | Winning outcome (1-4) |
| `resolver` | address | Who resolved |
| `resolved_at` | u64 | Block height when resolved |
| `challenge_deadline` | u64 | Block height = resolved_at + 2880 |
| `finalized` | bool | True after challenge window + no dispute |

### MarketFees
Fee tracking per market. Stored in `market_fees` mapping.

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | field | Market identifier |
| `protocol_fees` | u128 | Accumulated protocol fees |
| `creator_fees` | u128 | Accumulated creator fees |

### DisputeData
Active dispute information. Stored in `market_disputes` mapping.

| Field | Type | Description |
|-------|------|-------------|
| `market_id` | field | Market identifier |
| `disputer` | address | Who filed the dispute |
| `proposed_outcome` | u8 | Proposed alternative outcome |
| `bond_amount` | u128 | Bond deposited |
| `disputed_at` | u64 | Block height when disputed |

### SignerConfig
Multi-sig configuration. Stored in `multisig_config` mapping.

| Field | Type | Description |
|-------|------|-------------|
| `signer_1` | address | First signer |
| `signer_2` | address | Second signer |
| `signer_3` | address | Third signer |
| `threshold` | u8 | Required approvals (2 or 3) |

### MultiSigProposal
Treasury withdrawal proposal. Stored in `multisig_proposals` mapping.

| Field | Type | Description |
|-------|------|-------------|
| `proposal_id` | field | Proposal identifier |
| `action` | u8 | Action type (1=withdraw) |
| `amount` | u128 | Withdrawal amount |
| `recipient` | address | Recipient of funds |
| `proposed_at` | u64 | Block height when proposed |

### Helper Structs (for hashing)

| Struct | Fields | Used By |
|--------|--------|---------|
| `MarketSeed` | creator, question_hash, deadline, nonce | `create_market` — derives market_id |
| `ShareClaimKey` | market_id, claimer, share_nonce | `redeem_shares`, `claim_refund` |
| `LPClaimKey` | market_id, claimer, lp_nonce | `withdraw_lp_resolved`, `claim_lp_refund` |
| `DisputeClaimKey` | market_id, claimer, dispute_nonce | `claim_dispute_bond` |
| `ProposalSeed` | proposer, action, amount, nonce | `propose_treasury_withdrawal` |
| `ApprovalKey` | proposal_id, signer | `approve_proposal`, `execute_proposal` |
| `BettorKey` | market_id, bettor | `buy_shares` — unique bettor tracking |

---

## 4. Mappings (On-Chain State)

15 mappings total.

| # | Mapping | Key Type | Value Type | Description |
|---|---------|----------|------------|-------------|
| 1 | `markets` | field | Market | Core market data |
| 2 | `amm_pools` | field | AMMPool | AMM reserves + LP shares |
| 3 | `market_resolutions` | field | MarketResolution | Resolution state |
| 4 | `market_fees` | field | MarketFees | Fee tracking per market |
| 5 | `market_disputes` | field | DisputeData | Active dispute data |
| 6 | `share_redeemed` | field | bool | Tracks redeemed shares (claim_key → bool) |
| 7 | `creator_fees_claimed` | field | bool | Tracks claimed creator fees (market_id → bool) |
| 8 | `program_credits` | u8 | u128 | Total credits held by program. Key: 0=ALEO, 1=USDCX |
| 9 | `market_credits` | field | u128 | Credits isolated per market (market_id → amount) |
| 10 | `protocol_treasury` | u8 | u128 | Protocol fee treasury. Key: 0=ALEO, 1=USDCX |
| 11 | `multisig_config` | u8 | SignerConfig | Multi-sig signer configuration |
| 12 | `multisig_proposals` | field | MultiSigProposal | Pending multi-sig proposals |
| 13 | `multisig_approvals` | field | bool | Per-signer proposal approvals |
| 14 | `lp_positions` | field | bool | Tracks claimed LP positions (claim_key → bool) |
| 15 | `market_bettors` | field | bool | Unique bettor tracking (bettor_key → bool) |

---

## 5. Market Status Lifecycle

```
                                                    ┌──────────────────────────┐
                                                    │    DISPUTE CYCLE         │
                                                    │                          │
                                                    │  dispute_resolution()    │
                                                    │    bond: 1 ALEO          │
                                                    │    status → CLOSED(2)    │
                                                    │    removes resolution    │
                                                    │                          │
                                                    │  resolver re-resolves:   │
                                                    │    resolve_market()      │
                                                    │    status → PENDING(5)   │
                                                    │    new challenge window  │
                                                    └────────────┬─────────────┘
                                                                 │
                                                                 │
  create_market()        close_market()       resolve_market()   │   finalize_resolution()
┌──────────┐  ─────>  ┌──────────┐  ────>  ┌────────────────┐   │  ┌───────────────┐
│ ACTIVE(1)│          │CLOSED(2) │         │PENDING_RES.(5) │◄──┘  │  RESOLVED(3)  │
│          │          │          │         │                │─────> │               │
│ Trading  │          │ No trade │         │ Challenge 12h  │       │ Payouts open  │
│ open     │          │ allowed  │         │                │       │               │
└──────────┘          └──────────┘         └────────────────┘       └───────────────┘
     │                     │
     │  cancel_market()    │  cancel_market()
     │  (creator, 0 vol)   │  (anyone, past res_deadline)
     │                     │
     ▼                     ▼
┌─────────────────────────────┐
│       CANCELLED(4)          │
│                             │
│  Refunds open               │
│  (claim_refund,             │
│   claim_lp_refund)          │
└─────────────────────────────┘
```

**Key rules:**
- `ACTIVE → CLOSED`: Anyone can call `close_market()` after `block.height > deadline`
- `ACTIVE/CLOSED → PENDING`: Only `resolver` can call `resolve_market()`
- `PENDING → RESOLVED`: Anyone calls `finalize_resolution()` after challenge window (no dispute)
- `PENDING → CLOSED`: Anyone calls `dispute_resolution()` during challenge window (resets to CLOSED for re-resolution)
- `ACTIVE → CANCELLED`: Creator only, if `total_volume == 0`
- `ACTIVE/CLOSED/PENDING → CANCELLED`: Anyone, if `block.height > resolution_deadline`

---

## 6. Transitions — ALEO Token

### 6.1 create_market (Line 242)

Creates a new prediction market with ALEO as betting token.

**Parameters:**

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `question_hash` | public | field | BHP256 hash of question text |
| 2 | `category` | public | u8 | Category 1-7 |
| 3 | `num_outcomes` | public | u8 | Number of outcomes (2-4) |
| 4 | `deadline` | public | u64 | Betting deadline block height |
| 5 | `resolution_deadline` | public | u64 | Must resolve before this block |
| 6 | `resolver` | public | address | Who can resolve |
| 7 | `initial_liquidity` | private | u128 | Initial LP deposit (microcredits) |

**Returns:** `(field, LPToken, Future)` — market_id, LP token, finalize future

**Rules (transition):**
- `num_outcomes >= 2 && num_outcomes <= 4`
- `initial_liquidity >= MIN_LIQUIDITY` (10000 = 0.01 ALEO)

**Rules (finalize):**
- Market ID must not already exist
- `deadline > block.height`
- `resolution_deadline > deadline`

**Token transfer:** `credits.aleo/transfer_public_as_signer(program, amount)` — deducts from caller's PUBLIC balance

**Side effects:**
- Creates `markets[market_id]` with status=ACTIVE
- Creates `amm_pools[market_id]` with reserves split evenly
- Creates `market_fees[market_id]` with zero fees
- Updates `program_credits[0u8]` and `market_credits[market_id]`

**Market ID derivation:**
```
market_id = BHP256::hash_to_field(MarketSeed {
    creator: self.caller,
    question_hash,
    deadline,
    nonce: resolution_deadline
})
```

---

### 6.2 buy_shares_private (Line 371)

Buy outcome shares using a private credits record.

**Parameters:**

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `market_id` | private | field | Target market |
| 2 | `outcome` | private | u8 | Outcome to buy (1-4) |
| 3 | `amount_in` | private | u128 | Total spend (including fees) |
| 4 | `expected_shares` | private | u128 | Pre-computed expected shares |
| 5 | `min_shares_out` | private | u128 | Minimum acceptable shares (slippage) |
| 6 | `share_nonce` | private | field | Unique nonce for this share |
| 7 | `credits_in` | private | credits.aleo/credits | Private credits record |

**Returns:** `(OutcomeShare, credits.aleo/credits, Future)` — shares, change record, future

**Rules (transition):**
- `outcome >= 1 && outcome <= 4`
- `amount_in >= MIN_TRADE_AMOUNT` (1000 = 0.001 ALEO)

**Rules (finalize):**
- `market.status == ACTIVE`
- `market.token_type == TOKEN_ALEO`
- `outcome <= market.num_outcomes`
- `block.height <= market.deadline`
- `shares_out >= min_shares_out`
- `shares_out >= expected_shares`
- `shares_out > 0`

**Fees deducted:** 0.5% protocol + 0.5% creator = 1% total (on buy). Remaining goes to pool.

**Token transfer:** `credits.aleo/transfer_private_to_public(credits_in, program, amount)` — fully private

---

### 6.3 sell_shares (Line 507)

Sell outcome shares to withdraw collateral. User specifies `tokens_desired` (gross amount before fees).

**Parameters:**

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `shares` | private | OutcomeShare | Share record to sell from |
| 2 | `tokens_desired` | private | u128 | Gross tokens to withdraw |
| 3 | `max_shares_used` | private | u128 | Max shares willing to burn |

**Returns:** `(OutcomeShare, credits.aleo/credits, Future)` — remainder shares, payout record, future

**Rules (transition):**
- `shares.owner == self.caller`
- `shares.token_type == TOKEN_ALEO`
- `tokens_desired >= MIN_TRADE_AMOUNT`
- `max_shares_used > 0 && <= shares.quantity`

**Rules (finalize):**
- `market.status == ACTIVE`
- `market.token_type == TOKEN_ALEO`
- `outcome <= market.num_outcomes`
- `block.height <= market.deadline`
- `shares_needed <= max_shares_used`
- `shares_needed > 0`

**Fees deducted:** 0.5% protocol + 0.5% creator + 1% LP = 2% total (on sell). Net after all fees is transferred.

**Token transfer:** `credits.aleo/transfer_public_to_private(caller, net_tokens)` — payout is private

---

### 6.4 add_liquidity (Line 654)

Add liquidity to an active market.

**Parameters:**

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `market_id` | private | field | Target market |
| 2 | `amount` | private | u128 | Tokens to deposit |
| 3 | `expected_lp_shares` | private | u128 | Pre-computed LP shares |
| 4 | `lp_nonce` | private | field | Unique nonce |
| 5 | `credits_in` | private | credits.aleo/credits | Private credits record |

**Returns:** `(LPToken, credits.aleo/credits, Future)` — LP token, change record, future

**Rules (transition):**
- `amount >= MIN_LIQUIDITY` (10000)

**Rules (finalize):**
- `market.status == ACTIVE`
- `market.token_type == TOKEN_ALEO`
- `block.height <= market.deadline`
- `computed_shares >= expected_lp_shares`
- `expected_lp_shares > 0`

**LP share formula:** `computed_shares = (amount * pool.total_lp_shares) / pool.total_liquidity`

**Token transfer:** `credits.aleo/transfer_private_to_public(credits_in, program, amount)` — private

---

### 6.5 remove_liquidity (Line 732)

Remove liquidity from an active market.

**Parameters:**

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `lp_token` | private | LPToken | LP token record |
| 2 | `shares_to_remove` | private | u128 | Shares to burn |
| 3 | `min_tokens_out` | private | u128 | Minimum tokens to receive |

**Returns:** `(LPToken, Future)` — remainder LP token, future

**Rules (transition):**
- `lp_token.owner == self.caller`
- `lp_token.token_type == TOKEN_ALEO`
- `shares_to_remove > 0`
- `shares_to_remove <= lp_token.lp_shares`

**Rules (finalize):**
- `market.status == ACTIVE`
- `market.token_type == TOKEN_ALEO`
- `tokens_out >= min_tokens_out`
- `tokens_out > 0`

**Payout formula:** `tokens_out = (shares_to_remove * pool.total_liquidity) / pool.total_lp_shares`

**Token transfer:** `credits.aleo/transfer_public(caller, min_tokens_out)` — public transfer

> **NOTE:** LP can ONLY remove during ACTIVE status. After deadline, LP is locked until resolution or cancellation.

---

### 6.6 redeem_shares (Line 1672)

Redeem winning shares 1:1 after market is finalized.

**Parameters:**

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `shares` | private | OutcomeShare | Winning shares to redeem |

**Returns:** `(credits.aleo/credits, Future)` — payout record, future

**Rules (transition):**
- `shares.owner == self.caller`
- `shares.token_type == TOKEN_ALEO`
- `shares.quantity > 0`

**Rules (finalize):**
- `market.status == RESOLVED`
- `market.token_type == TOKEN_ALEO`
- `resolution.finalized == true`
- `outcome == resolution.winning_outcome`
- Not already claimed (via `share_redeemed`)

**Payout:** 1:1 — each share redeems for exactly 1 microcredit of collateral.

**Token transfer:** `credits.aleo/transfer_public_to_private(caller, quantity)` — private payout

---

### 6.7 claim_refund (Line 1731)

Claim refund for shares on a cancelled market.

**Parameters:**

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `shares` | private | OutcomeShare | Shares to refund |

**Returns:** `(RefundClaim, credits.aleo/credits, Future)` — receipt, payout record, future

**Rules (finalize):**
- `market.status == CANCELLED`
- `market.token_type == TOKEN_ALEO`
- Not already claimed

**Payout:** Full share quantity refunded 1:1.

**Token transfer:** `credits.aleo/transfer_public_to_private(caller, quantity)` — private payout

---

### 6.8 claim_lp_refund (Line 1792)

LP refund on a cancelled market.

**Parameters:**

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `lp_token` | private | LPToken | LP token record |
| 2 | `min_tokens_out` | private | u128 | Minimum tokens to receive |

**Returns:** `(RefundClaim, Future)`

**Rules (finalize):**
- `market.status == CANCELLED`
- `market.token_type == TOKEN_ALEO`
- Not already claimed (via `lp_positions`)
- `tokens_out >= min_tokens_out`

**Payout formula:** `tokens_out = (lp_shares * pool.total_liquidity) / pool.total_lp_shares`

**Token transfer:** `credits.aleo/transfer_public(caller, min_tokens_out)` — public transfer

---

### 6.9 withdraw_lp_resolved (Line 1874)

LP withdrawal from a resolved + finalized market. Uses `market_credits` (real remaining collateral after winner redemptions).

**Parameters:**

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `lp_token` | private | LPToken | LP token record |
| 2 | `min_tokens_out` | private | u128 | Minimum tokens to receive |

**Returns:** `(credits.aleo/credits, Future)` — payout record, future

**Rules (finalize):**
- `market.status == RESOLVED`
- `market.token_type == TOKEN_ALEO`
- `resolution.finalized == true`
- Not already claimed (via `lp_positions`)
- `tokens_out >= min_tokens_out`
- `tokens_out > 0`

**Payout formula:** `tokens_out = (lp_shares * market_credits[market_id]) / pool.total_lp_shares`

> **IMPORTANT:** Uses `market_credits` (decremented by `redeem_shares`), NOT `pool.total_liquidity` (which is frozen after resolution). This means LP payout decreases as winners redeem their shares.

**Token transfer:** `credits.aleo/transfer_public_to_private(caller, min_tokens_out)` — private payout

---

### 6.10 withdraw_creator_fees (Line 2027)

Creator claims accumulated trading fees.

**Parameters:**

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `market_id` | public | field | Target market |
| 2 | `expected_amount` | public | u128 | Amount to withdraw |

**Returns:** `Future`

**Rules (finalize):**
- `market.status == RESOLVED`
- `market.creator == caller`
- `market.token_type == TOKEN_ALEO`
- `resolution.finalized == true`
- Not already claimed (via `creator_fees_claimed`)
- `fees.creator_fees >= expected_amount`

**Token transfer:** `credits.aleo/transfer_public(caller, expected_amount)`

---

## 7. Transitions — USDCX Token

Each ALEO transition has a USDCX counterpart. Key differences:
- Uses `test_usdcx_stablecoin.aleo/transfer_public_as_signer` or `transfer_public` instead of `credits.aleo`
- Token amounts are u128 natively (USDCX uses u128, no u64 cast needed)
- Credit key is `1u8` instead of `0u8`

### 7.1 create_market_usdcx (Line 814)
Same as `create_market` but `token_type = TOKEN_USDCX`. Uses `test_usdcx_stablecoin.aleo/transfer_public_as_signer`.

### 7.2 buy_shares_usdcx (Line 935)
**Parameters:** Same as `buy_shares_private` but **without `credits_in`** (6 params, not 7). Uses `transfer_public_as_signer`.

| # | Name | Visibility | Type |
|---|------|-----------|------|
| 1 | `market_id` | private | field |
| 2 | `outcome` | private | u8 |
| 3 | `amount_in` | private | u128 |
| 4 | `expected_shares` | private | u128 |
| 5 | `min_shares_out` | private | u128 |
| 6 | `share_nonce` | private | field |

### 7.3 sell_shares_usdcx (Line 1058)
Same as `sell_shares`. Uses `test_usdcx_stablecoin.aleo/transfer_public(caller, net_tokens)`.
Returns `(OutcomeShare, Future)` — no credits record output.

### 7.4 add_liquidity_usdcx (Line 1192)
Same as `add_liquidity` but **without `credits_in`** (4 params). Uses `transfer_public_as_signer`.

| # | Name | Visibility | Type |
|---|------|-----------|------|
| 1 | `market_id` | private | field |
| 2 | `amount` | private | u128 |
| 3 | `expected_lp_shares` | private | u128 |
| 4 | `lp_nonce` | private | field |

### 7.5 remove_liquidity_usdcx (Line 1267)
Same as `remove_liquidity`. Uses `test_usdcx_stablecoin.aleo/transfer_public`.

### 7.6 redeem_shares_usdcx (Line 2083)
Same rules as `redeem_shares`. Returns `Future` only (no credits record).

### 7.7 claim_refund_usdcx (Line 2140)
Same rules as `claim_refund`. Returns `(RefundClaim, Future)`.

### 7.8 claim_lp_refund_usdcx (Line 2199)
Same rules as `claim_lp_refund`. Returns `(RefundClaim, Future)`.

### 7.9 withdraw_lp_resolved_usdcx (Line 1953)
Same rules as `withdraw_lp_resolved`. Returns `Future` only.

### 7.10 withdraw_fees_usdcx (Line 2277)
Same rules as `withdraw_creator_fees`.

---

## 8. Transitions — Shared Lifecycle

These transitions work for both ALEO and USDCX markets.

### 8.1 close_market (Line 1348)

Closes an active market after its deadline has passed. Anyone can call.

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `market_id` | public | field | Market to close |

**Rules:**
- `market.status == ACTIVE`
- `block.height > market.deadline`

**Effect:** Status → `CLOSED(2)`

---

### 8.2 resolve_market (Line 1377)

Resolver declares the winning outcome. Starts challenge window.

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `market_id` | public | field | Market to resolve |
| 2 | `winning_outcome` | public | u8 | Declared winner (1-4) |

**Rules:**
- `market.resolver == caller` (ONLY resolver)
- `winning_outcome >= 1 && <= market.num_outcomes`
- Market is CLOSED, or is ACTIVE + past deadline
- `block.height <= market.resolution_deadline`

**Effect:**
- Status → `PENDING_RESOLUTION(5)`
- Creates `market_resolutions[market_id]` with `finalized = false`
- Sets `challenge_deadline = block.height + 2880` (~12 hours)
- Removes any old dispute data (for re-resolution after dispute)

---

### 8.3 finalize_resolution (Line 1434)

Finalizes a resolution after the challenge window passes without disputes. Anyone can call.

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `market_id` | public | field | Market to finalize |

**Rules:**
- `market.status == PENDING_RESOLUTION`
- `resolution.finalized == false`
- `block.height > resolution.challenge_deadline` (challenge window passed)
- No active dispute exists (`!market_disputes.contains(market_id)`)

**Effect:**
- `resolution.finalized = true`
- Status → `RESOLVED(3)`
- Payouts and LP withdrawals now available

---

### 8.4 cancel_market (Line 1482)

Two paths to cancel:
- **Path A (Creator):** Creator cancels own active market with zero volume
- **Path B (Emergency):** Anyone cancels unresolved market past `resolution_deadline`

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `market_id` | public | field | Market to cancel |

**Rules:**
- Path A: `creator == caller && status == ACTIVE && total_volume == 0`
- Path B: `block.height > resolution_deadline && status ∉ {RESOLVED, CANCELLED}`
- At least one path must be valid

**Effect:**
- Status → `CANCELLED(4)`
- Removes resolution and dispute data
- Refunds available via `claim_refund` / `claim_lp_refund`

---

## 9. Transitions — Dispute / Challenge

Dispute bonds are **always in ALEO**, regardless of market token type.

### 9.1 dispute_resolution (Line 1533)

File a dispute during the challenge window.

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `market_id` | private | field | Market to dispute |
| 2 | `proposed_outcome` | private | u8 | Alternative outcome |
| 3 | `dispute_nonce` | private | field | Unique nonce |
| 4 | `credits_in` | private | credits.aleo/credits | Bond payment |

**Returns:** `(DisputeBondReceipt, credits.aleo/credits, Future)`

**Rules:**
- `market.status == PENDING_RESOLUTION`
- `resolution.finalized == false`
- `block.height <= resolution.challenge_deadline`
- `proposed_outcome != resolution.winning_outcome`
- `proposed_outcome >= 1 && <= market.num_outcomes`
- No existing dispute (`!market_disputes.contains(market_id)`)

**Effect:**
- Status → `CLOSED(2)` (back for re-resolution)
- Removes current resolution
- Stores dispute data
- Bond: 1.0 ALEO transferred to program

---

### 9.2 claim_dispute_bond (Line 1613)

Reclaim bond after market is resolved in disputer's favor.

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `receipt` | private | DisputeBondReceipt | Bond receipt |

**Rules:**
- `receipt.owner == caller`
- `market.status == RESOLVED`
- `resolution.winning_outcome == receipt.proposed_outcome` (dispute upheld)
- Not already claimed

**Token transfer:** `credits.aleo/transfer_public(caller, bond_amount)`

---

## 10. Transitions — Multi-Sig Treasury

### 10.1 init_multisig (Line 2332)

Initialize the multi-sig configuration. Can only be called once.

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `signer_1` | public | address | First signer |
| 2 | `signer_2` | public | address | Second signer |
| 3 | `signer_3` | public | address | Third signer |
| 4 | `threshold` | public | u8 | Required approvals (2-3) |

**Rules:** Config must not already exist. Threshold must be 2 or 3.

---

### 10.2 propose_treasury_withdrawal (Line 2364)

Propose a withdrawal from the protocol treasury.

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `amount` | public | u128 | Amount to withdraw |
| 2 | `recipient` | public | address | Recipient |

**Returns:** `(field, Future)` — proposal_id, future

**Rules:**
- Caller must be a configured signer
- Proposal ID must not exist
- `protocol_treasury[0u8] >= amount`
- Auto-approves for the proposer

---

### 10.3 approve_proposal (Line 2419)

Approve a pending proposal.

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `proposal_id` | public | field | Proposal to approve |

**Rules:** Caller must be a signer. Must not have already approved.

---

### 10.4 execute_proposal (Line 2448) — ALEO

Execute an approved proposal (ALEO treasury withdrawal).

| # | Name | Visibility | Type | Description |
|---|------|-----------|------|-------------|
| 1 | `proposal_id` | public | field | Proposal to execute |
| 2 | `amount` | public | u128 | Must match proposal |
| 3 | `recipient` | public | address | Must match proposal |

**Rules:**
- Approval count >= threshold
- `proposal.amount == amount && proposal.recipient == recipient`
- `protocol_treasury[0u8] >= amount`

**Token transfer:** `credits.aleo/transfer_public(recipient, amount)`

---

### 10.5 exec_proposal_usdcx (Line 2515) — USDCX

Same as `execute_proposal` but withdraws USDCX from `protocol_treasury[1u8]`.

---

## 11. Fee Structure

### Buy Fees (1% total)
| Fee | BPS | Rate | Destination |
|-----|-----|------|-------------|
| Protocol | 50 | 0.5% | `protocol_treasury` |
| Creator | 50 | 0.5% | `market_fees.creator_fees` |
| **Total** | **100** | **1.0%** | |

Remaining 99% goes to the AMM pool as `amount_to_pool`.

### Sell Fees (2% total)
| Fee | BPS | Rate | Destination |
|-----|-----|------|-------------|
| Protocol | 50 | 0.5% | `protocol_treasury` |
| Creator | 50 | 0.5% | `market_fees.creator_fees` |
| LP | 100 | 1.0% | Stays in pool (increases LP value) |
| **Total** | **200** | **2.0%** | |

Net payout to seller: `tokens_desired - protocol_fee - creator_fee - lp_fee`

### Fee Withdrawal
- **Protocol fees:** Via multi-sig treasury (`execute_proposal`)
- **Creator fees:** Via `withdraw_creator_fees` (only after market RESOLVED + finalized)
- **LP fees:** Automatically accrued in pool reserves (no explicit withdrawal — captured in LP share value)

---

## 12. FPMM AMM Mathematics

### Buy: Complete-Set Minting

For a binary market (2 outcomes), buying outcome `i`:

```
amount_to_pool = amount_in - protocol_fee - creator_fee

r_i_new = r_i * product(r_k / (r_k + a)) for all active k ≠ i
shares_out = (r_i + a) - r_i_new
```

For multi-outcome (3-4), step division avoids u128 overflow:
```
step0 = r_i
step1 = (k=1, k≠i) ? (step0 * r1) / (r1 + a) : step0
step2 = (k=2, k≠i) ? (step1 * r2) / (r2 + a) : step1
step3 = (k=3, k≠i, n≥3) ? (step2 * r3) / (r3 + a) : step2
step4 = (k=4, k≠i, n≥4) ? (step3 * r4) / (r4 + a) : step3
r_i_new = step4
```

Reserve update: `r_k += a` for all active k ≠ i, `r_i = r_i_new`

### Sell: Complete-Set Burning

User specifies `tokens_desired` (gross). Contract computes shares to burn:

```
pool_tokens_out = tokens_desired - lp_fee  (LP fee stays in pool)

step division (same idea, but r_k / (r_k - p)):
r_i_new = r_i * product(r_k / (r_k - p)) for active k ≠ i
shares_needed = r_i_new - r_i + p
```

Reserve update: `r_k -= p` for all active k ≠ i, `r_i = r_i_new`

### Liquidity Add/Remove

**Add:** `lp_shares = (amount * total_lp_shares) / total_liquidity`
Reserves increase proportionally: `add_k = (amount * reserve_k) / total_reserves`

**Remove:** `tokens_out = (shares_to_remove * total_liquidity) / total_lp_shares`
Reserves decrease proportionally: `sub_k = (tokens_out * reserve_k) / total_reserves`

---

## 13. Claim Key System (Double-Claim Prevention)

Every payout uses a unique claim key derived from the record's nonce:

| Claim Type | Key Derivation | Mapping |
|------------|---------------|---------|
| Share redeem | `BHP256(ShareClaimKey { market_id, claimer, share_nonce })` | `share_redeemed` |
| Share refund | `BHP256(ShareClaimKey { market_id, claimer, share_nonce })` | `share_redeemed` |
| LP refund | `BHP256(LPClaimKey { market_id, claimer, lp_nonce })` | `lp_positions` |
| LP resolved | `BHP256(LPClaimKey { market_id, claimer, lp_nonce })` | `lp_positions` |
| Dispute bond | `BHP256(DisputeClaimKey { market_id, claimer, dispute_nonce })` | `share_redeemed` |
| Creator fees | `market_id` directly | `creator_fees_claimed` |

Each claim sets the mapping key to `true`. Second attempt fails with `assert(!already_claimed)`.

---

## 14. Credit Accounting System

Two levels of credit tracking:

### Global: `program_credits`
- Key `0u8` = Total ALEO held by program
- Key `1u8` = Total USDCX held by program
- Incremented on every deposit (buy, add_lp, create_market)
- Decremented on every withdrawal (sell, remove_lp, redeem, refund)

### Per-market: `market_credits`
- Key = `market_id`
- Tracks collateral isolated to each market
- **Critical for LP resolved withdrawal**: `redeem_shares` decreases `market_credits` but NOT `amm_pools.total_liquidity`. So `withdraw_lp_resolved` uses `market_credits` to compute fair LP payout.

### Protocol: `protocol_treasury`
- Key `0u8` = ALEO protocol fees
- Key `1u8` = USDCX protocol fees
- Incremented on every buy/sell
- Decremented via multi-sig `execute_proposal`

---

## 15. v16 Changes from v15

| Change | Before (v15) | After (v16) |
|--------|-------------|-------------|
| `sell_shares` transfer | `transfer_public` | `transfer_public_to_private` (seller privacy) |
| `redeem_shares` transfer | `transfer_public` | `transfer_public_to_private` (winner privacy) |
| `claim_refund` transfer | `transfer_public` | `transfer_public_to_private` (refund privacy) |
| `add_liquidity` transfer | `transfer_public_as_signer` | `transfer_private_to_public` (LP privacy) |
| `dispute_resolution` transfer | `transfer_public_as_signer` | `transfer_private_to_public` (disputer privacy) |
| LP resolved withdrawal | Not available | NEW: `withdraw_lp_resolved` / `withdraw_lp_resolved_usdcx` |
| `transfer_future.await()` | Various positions | Moved to top of ALL finalize functions |

---

## Quick Reference: All 32 Transitions

| # | Transition | Token | Inputs | Status Required | Who Can Call |
|---|-----------|-------|--------|-----------------|-------------|
| 0 | `constructor` | — | 0 | — | Deploy only |
| 1 | `create_market` | ALEO | 7 | — (new) | Anyone |
| 2 | `buy_shares_private` | ALEO | 7 | ACTIVE | Anyone |
| 3 | `sell_shares` | ALEO | 3 | ACTIVE | Share owner |
| 4 | `add_liquidity` | ALEO | 5 | ACTIVE | Anyone |
| 5 | `remove_liquidity` | ALEO | 3 | ACTIVE | LP owner |
| 6 | `create_market_usdcx` | USDCX | 7 | — (new) | Anyone |
| 7 | `buy_shares_usdcx` | USDCX | 6 | ACTIVE | Anyone |
| 8 | `sell_shares_usdcx` | USDCX | 3 | ACTIVE | Share owner |
| 9 | `add_liquidity_usdcx` | USDCX | 4 | ACTIVE | Anyone |
| 10 | `remove_liquidity_usdcx` | USDCX | 3 | ACTIVE | LP owner |
| 11 | `close_market` | Both | 1 | ACTIVE (past deadline) | Anyone |
| 12 | `resolve_market` | Both | 2 | CLOSED/ACTIVE past deadline | Resolver only |
| 13 | `finalize_resolution` | Both | 1 | PENDING (past challenge) | Anyone |
| 14 | `cancel_market` | Both | 1 | See rules | Creator or anyone |
| 15 | `dispute_resolution` | ALEO bond | 4 | PENDING (in challenge) | Anyone |
| 16 | `claim_dispute_bond` | ALEO | 1 | RESOLVED | Bond owner |
| 17 | `redeem_shares` | ALEO | 1 | RESOLVED+finalized | Share owner |
| 18 | `claim_refund` | ALEO | 1 | CANCELLED | Share owner |
| 19 | `claim_lp_refund` | ALEO | 2 | CANCELLED | LP owner |
| 20 | `withdraw_lp_resolved` | ALEO | 2 | RESOLVED+finalized | LP owner |
| 21 | `withdraw_creator_fees` | ALEO | 2 | RESOLVED+finalized | Creator |
| 22 | `redeem_shares_usdcx` | USDCX | 1 | RESOLVED+finalized | Share owner |
| 23 | `claim_refund_usdcx` | USDCX | 1 | CANCELLED | Share owner |
| 24 | `claim_lp_refund_usdcx` | USDCX | 2 | CANCELLED | LP owner |
| 25 | `withdraw_lp_resolved_usdcx` | USDCX | 2 | RESOLVED+finalized | LP owner |
| 26 | `withdraw_fees_usdcx` | USDCX | 2 | RESOLVED+finalized | Creator |
| 27 | `init_multisig` | — | 4 | — (once) | Anyone |
| 28 | `propose_treasury_withdrawal` | — | 2 | — | Signer only |
| 29 | `approve_proposal` | — | 1 | — | Signer only |
| 30 | `execute_proposal` | ALEO | 3 | — (threshold met) | Anyone |
| 31 | `exec_proposal_usdcx` | USDCX | 3 | — (threshold met) | Anyone |
