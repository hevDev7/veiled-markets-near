# Parimutuel Pool System

## Overview

Veiled Markets menggunakan **Parimutuel Pool System** (bukan AMM) untuk prediction markets. Sistem ini mirip dengan horse racing betting dan lebih cocok untuk binary prediction markets.

## Why Parimutuel, Not AMM?

### Parimutuel Advantages
✅ **No Liquidity Providers Needed** - All bets go into pools
✅ **Fair Odds** - Determined by market participants, not algorithms
✅ **Simple & Transparent** - Easy to understand payout formula
✅ **No Impermanent Loss** - No LP risk
✅ **Better for Binary Markets** - Perfect for Yes/No predictions

### AMM Disadvantages for Prediction Markets
❌ Requires initial liquidity
❌ Complex pricing curves
❌ Impermanent loss for LPs
❌ Not ideal for binary outcomes
❌ Can be manipulated with large trades

## How It Works

### 1. Pool Structure

```
┌─────────────────────────────────┐
│      PREDICTION MARKET          │
├─────────────────────────────────┤
│                                 │
│  ┌──────────┐   ┌──────────┐   │
│  │ YES Pool │   │ NO Pool  │   │
│  │ 1,000 Ⱥ  │   │  500 Ⱥ   │   │
│  └──────────┘   └──────────┘   │
│                                 │
│  Total Pool: 1,500 Ⱥ            │
│                                 │
└─────────────────────────────────┘
```

### 2. Betting Process

**User places bet:**
1. Choose outcome (YES or NO)
2. Specify amount (e.g., 100 ALEO)
3. Bet goes into chosen pool
4. Odds update automatically

**Example:**
```
Before bet:
- YES pool: 1,000 ALEO
- NO pool: 500 ALEO
- YES odds: 66.7%
- NO odds: 33.3%

User bets 100 ALEO on NO:
- YES pool: 1,000 ALEO (unchanged)
- NO pool: 600 ALEO (increased)
- YES odds: 62.5% (decreased)
- NO odds: 37.5% (increased)
```

### 3. Payout Formula

```
Payout = (Total Pool / Winning Pool) × Bet Amount × (1 - Fees)
```

**Components:**
- `Total Pool` = YES pool + NO pool
- `Winning Pool` = Pool of the winning outcome
- `Bet Amount` = How much user bet
- `Fees` = 2% (1% protocol + 1% creator)

**Example Calculation:**

```
Market State:
- YES pool: 1,000 ALEO
- NO pool: 500 ALEO
- Total: 1,500 ALEO

User bet: 100 ALEO on YES

If YES wins:
- Winning pool: 1,000 ALEO
- Payout = (1,500 / 1,000) × 100 × 0.98
- Payout = 1.5 × 100 × 0.98
- Payout = 147 ALEO
- Profit = 147 - 100 = 47 ALEO (47% return)

If NO wins:
- User loses 100 ALEO
```

### 4. Odds Calculation

```
YES Odds = YES Pool / Total Pool
NO Odds = NO Pool / Total Pool

Always: YES Odds + NO Odds = 100%
```

**Example:**
```
YES pool: 1,000 ALEO
NO pool: 500 ALEO
Total: 1,500 ALEO

YES Odds = 1,000 / 1,500 = 66.7%
NO Odds = 500 / 1,500 = 33.3%
```

### 5. Potential Multiplier

```
Multiplier = (Total Pool / Your Pool) × (1 - Fees)
```

**Example:**
```
If you bet on YES:
- Multiplier = (1,500 / 1,000) × 0.98 = 1.47x

If you bet on NO:
- Multiplier = (1,500 / 500) × 0.98 = 2.94x
```

## Contract Implementation

### Data Structures

```leo
// Market state (public)
struct Market {
    id: field,
    creator: address,
    question_hash: field,
    category: u8,
    deadline: u64,
    resolution_deadline: u64,
    status: u8,
    created_at: u64,
}

// Pool data (public)
struct MarketPool {
    market_id: field,
    total_yes_pool: u64,
    total_no_pool: u64,
    total_bets: u64,
    total_unique_bettors: u64,
}

// User bet (private)
record Bet {
    owner: address,
    market_id: field,
    amount: u64,
    outcome: u8, // 1 = YES, 2 = NO
    timestamp: u64,
}
```

### Key Functions

#### 1. Create Market
```leo
transition create_market(
    question_hash: field,
    category: u8,
    deadline: u64,
    resolution_deadline: u64
) -> field
```

#### 2. Place Bet
```leo
transition place_bet(
    market_id: field,
    amount: u64,
    outcome: u8,
    bettor: address
) -> Bet
```

Updates pool:
- If outcome = YES: `total_yes_pool += amount`
- If outcome = NO: `total_no_pool += amount`

#### 3. Resolve Market
```leo
transition resolve_market(
    market_id: field,
    winning_outcome: u8
) -> MarketResolution
```

#### 4. Claim Winnings
```leo
transition claim_winnings(
    bet: Bet,
    market_resolution: MarketResolution
) -> u64
```

Calculates payout:
```leo
let total_pool = yes_pool + no_pool;
let winning_pool = if winning_outcome == 1 { yes_pool } else { no_pool };
let gross_payout = (bet.amount * total_pool) / winning_pool;
let fees = (gross_payout * 200u64) / 10000u64; // 2%
let net_payout = gross_payout - fees;
```

## Fee Structure

```
Total Fees: 2%
├── Protocol Fee: 1%
└── Creator Fee: 1%
```

**Example:**
```
Gross Payout: 147 ALEO
Fees (2%): 2.94 ALEO
├── Protocol: 1.47 ALEO
└── Creator: 1.47 ALEO
Net Payout: 144.06 ALEO
```

## Advantages Over Traditional Betting

### 1. Transparent Odds
- Odds visible to everyone
- Updated in real-time
- No hidden house edge

### 2. Fair Pricing
- Market-determined odds
- No bookmaker manipulation
- Reflects true market sentiment

### 3. Privacy
- Bet amounts are private
- Positions are encrypted
- Only you know your bets

### 4. No Counterparty Risk
- Funds locked in smart contract
- Automatic payout on resolution
- No trust required

## Comparison: Parimutuel vs AMM

| Feature | Parimutuel | AMM |
|---------|-----------|-----|
| Liquidity | Self-sufficient | Requires LPs |
| Pricing | Pool ratio | Bonding curve |
| Complexity | Simple | Complex |
| Best For | Binary outcomes | Multi-asset swaps |
| LP Risk | None | Impermanent loss |
| Slippage | None | Yes |
| Initial Capital | None needed | Requires seeding |

## Real-World Example

### Market: "Will Bitcoin reach $150K by Q1 2026?"

**Initial State:**
```
YES pool: 0 ALEO
NO pool: 0 ALEO
```

**After 10 bets:**
```
YES pool: 5,000 ALEO (7 bets)
NO pool: 3,000 ALEO (3 bets)
Total: 8,000 ALEO

Current Odds:
- YES: 62.5%
- NO: 37.5%

Potential Payouts:
- YES: 1.57x (if YES wins)
- NO: 2.61x (if NO wins)
```

**User Action:**
```
Alice bets 1,000 ALEO on YES

New State:
YES pool: 6,000 ALEO
NO pool: 3,000 ALEO
Total: 9,000 ALEO

Updated Odds:
- YES: 66.7%
- NO: 33.3%

Alice's Potential Payout:
If YES wins: (9,000 / 6,000) × 1,000 × 0.98 = 1,470 ALEO
Profit: 470 ALEO (47% return)
```

## Privacy Features

### What's Public
✅ Total pool sizes
✅ Number of bets
✅ Market question
✅ Odds/percentages
✅ Resolution outcome

### What's Private
🔒 Individual bet amounts
🔒 User positions (YES/NO)
🔒 User identities
🔒 Winning amounts
🔒 Claim transactions

## Best Practices

### For Bettors
1. **Check Odds** - Higher odds = higher risk, higher reward
2. **Bet Early** - Better odds before pool grows
3. **Diversify** - Don't put all funds in one market
4. **Understand Fees** - 2% reduces your payout
5. **Wait for Resolution** - Can't withdraw before market closes

### For Market Creators
1. **Clear Questions** - Unambiguous outcomes
2. **Reasonable Deadlines** - Enough time for betting
3. **Verifiable Resolution** - Use reliable sources
4. **Fair Categories** - Choose appropriate category
5. **Promote Market** - More bets = better odds

## Conclusion

Parimutuel system adalah pilihan ideal untuk prediction markets karena:
- ✅ Simple dan mudah dipahami
- ✅ Fair odds ditentukan oleh market
- ✅ Tidak perlu liquidity providers
- ✅ Privacy tetap terjaga dengan ZK proofs
- ✅ Transparent dan verifiable on-chain

Sistem ini terbukti efektif di horse racing dan sports betting selama puluhan tahun, dan sekarang dibawa ke blockchain dengan privacy guarantees dari Aleo!
