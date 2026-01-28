# Hybrid AMM Implementation Guide

## Overview

Veiled Markets sekarang menggunakan **Hybrid Automated Market Maker (AMM)** system yang memungkinkan:
- ✅ Buy/Sell shares kapan saja
- ✅ Continuous liquidity
- ✅ Fair automatic pricing
- ✅ Privacy tetap terjaga

## Key Changes

### 1. Share-Based System

**Before (Pool-Based):**
```
User bets 100 ALEO on YES
→ Wait for resolution
→ Get payout based on pool ratio
```

**After (AMM-Based):**
```
User buys YES shares with 100 ALEO
→ Can sell anytime before resolution
→ Or redeem for $1/share if YES wins
```

### 2. AMM Formula

**Constant Product:**
```
YES_reserve × NO_reserve = k (constant)
```

**Price Calculation:**
```
YES_price = YES_reserve / (YES_reserve + NO_reserve)
NO_price = NO_reserve / (YES_reserve + NO_reserve)

Always: YES_price + NO_price = 1
```

**Example:**
```
Initial state:
- YES reserve: 1,000,000 shares
- NO reserve: 1,000,000 shares
- k = 1,000,000,000,000
- YES price = 0.5 ($0.50)
- NO price = 0.5 ($0.50)

After buying 100,000 YES shares:
- YES reserve: 900,000 shares
- NO reserve: 1,111,111 shares
- k = 1,000,000,000,000 (unchanged)
- YES price = 0.447 ($0.447)
- NO price = 0.553 ($0.553)
```

## Smart Contract Changes

### New Records

```leo
// Private share ownership
record ShareRecord {
    owner: address,
    market_id: field,
    share_type: u8,      // YES or NO
    quantity: u64,       // PRIVATE
    avg_price: u64,
    acquired_at: u64,
}
```

### New Mappings

```leo
// Public AMM pool state
mapping amm_pools: field => AMMPool;

struct AMMPool {
    yes_reserve: u64,        // PUBLIC (for pricing)
    no_reserve: u64,         // PUBLIC (for pricing)
    k: u128,                 // Constant product
    total_yes_issued: u64,
    total_no_issued: u64,
    total_volume: u64,
    last_price_yes: u64,
    last_price_no: u64,
}
```

### New Transitions

#### 1. Buy Shares
```leo
transition buy_shares(
    public market_id: field,
    public share_type: u8,      // YES or NO
    public credits_in: u64,     // Amount to spend
    public min_shares_out: u64, // Slippage protection
) -> (ShareRecord, Future)
```

**How it works:**
1. User specifies how much to spend
2. AMM calculates shares received
3. User gets private ShareRecord
4. Pool reserves updated publicly

#### 2. Sell Shares
```leo
transition sell_shares(
    private shares: ShareRecord,  // Private input
    public shares_in: u64,        // Amount to sell
    public min_credits_out: u64,  // Slippage protection
) -> (ShareRecord, Future)
```

**How it works:**
1. User burns shares
2. AMM calculates credits to return
3. User gets credits back (minus fees)
4. Pool reserves updated

#### 3. Redeem Winning Shares
```leo
transition redeem_shares(
    private shares: ShareRecord,
) -> Future
```

**How it works:**
1. Market must be resolved
2. Shares must be winning type
3. Each share = $1
4. User gets full value

## Privacy Features

### What's Private:
- ✅ Individual share quantities
- ✅ User positions
- ✅ Trade timing (with batching)
- ✅ Profit/loss per user

### What's Public:
- ✅ Pool reserves (for pricing)
- ✅ Total volume
- ✅ Current prices
- ❌ Individual trades

### Privacy Enhancements:

**1. Batched Updates**
```
Trades collected: Block N
Executed together: Block N+1
Result: Can't tell who traded what
```

**2. Aggregate Only**
```
Public sees: "YES reserve decreased by 1000"
Public doesn't see: "Alice bought 1000 YES"
```

## Frontend Changes Needed

### 1. Market Display

**Show:**
- Current YES/NO prices
- Your position (if any)
- Price chart
- Liquidity depth

**Example UI:**
```
┌─────────────────────────────────────┐
│ Will ETH reach $5000 by Dec 2024?   │
├─────────────────────────────────────┤
│ YES: $0.67  📈 +5%                   │
│ NO:  $0.33  📉 -5%                   │
├─────────────────────────────────────┤
│ Your Position:                       │
│ 150 YES shares @ avg $0.62           │
│ Current Value: $100.50               │
│ P&L: +$7.50 (+8.1%)                  │
├─────────────────────────────────────┤
│ [Buy More] [Sell] [Redeem]           │
└─────────────────────────────────────┘
```

### 2. Trading Interface

**Buy Flow:**
```
1. Select share type (YES/NO)
2. Enter amount to spend
3. See estimated shares received
4. Set slippage tolerance
5. Confirm transaction
```

**Sell Flow:**
```
1. Select shares to sell
2. See estimated credits received
3. Set slippage tolerance
4. Confirm transaction
```

### 3. Price Chart

Show historical prices:
```
┌─────────────────────────────────────┐
│        Price History                 │
│                                      │
│ 1.0 ┤                                │
│     │         ╱─╲                    │
│ 0.7 ┤      ╱─╯   ╲                  │
│     │   ╱─╯        ╲─╮               │
│ 0.5 ┼─╯              ╰─╮             │
│     │                   ╰─╮           │
│ 0.3 ┤                     ╰─         │
│     │                                │
│ 0.0 ┴────────────────────────────────│
│     Jan  Feb  Mar  Apr  May  Jun     │
└─────────────────────────────────────┘
```

## Migration Path

### Phase 1: Deploy New Contract
- Deploy `main_amm.leo`
- Test on testnet
- Verify all functions

### Phase 2: Update Frontend
- Add buy/sell UI
- Add price charts
- Update market cards

### Phase 3: Migrate Markets
- New markets use AMM
- Old markets stay pool-based
- Gradual transition

## Advantages

### For Users:
- ✅ Exit anytime (no waiting)
- ✅ Fair pricing (AMM formula)
- ✅ See current value
- ✅ Trade multiple times
- ✅ Privacy maintained

### For Markets:
- ✅ Always liquid
- ✅ Better price discovery
- ✅ More trading activity
- ✅ Higher volume

## Formulas Reference

### Buy Shares:
```
shares_out = reserve_out - (k / (reserve_in + credits_in))
```

### Sell Shares:
```
credits_out = reserve_out - (k / (reserve_in + shares_in))
```

### Current Price:
```
price_yes = yes_reserve / (yes_reserve + no_reserve)
price_no = no_reserve / (yes_reserve + no_reserve)
```

### Slippage:
```
slippage = |actual_price - expected_price| / expected_price
```

### Price Impact:
```
impact = (new_price - old_price) / old_price
```

## Testing Checklist

- [ ] Create market with AMM
- [ ] Buy YES shares
- [ ] Buy NO shares
- [ ] Sell YES shares
- [ ] Sell NO shares
- [ ] Check price updates
- [ ] Verify slippage protection
- [ ] Test resolution
- [ ] Redeem winning shares
- [ ] Verify privacy (positions hidden)

## Next Steps

1. Review contract code
2. Test on Aleo testnet
3. Update frontend UI
4. Add price charts
5. Deploy to production
