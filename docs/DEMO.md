# 🎬 Veiled Markets Demo Guide

## Quick Demo Script

This guide walks through a complete demo of Veiled Markets for hackathon judges.

---

## 🚀 Starting the Demo

```bash
# Navigate to project
cd veiled-markets

# Install dependencies
pnpm install

# Start frontend
pnpm dev
```

Open http://localhost:3000

---

## 📋 Demo Flow

### 1. Landing Page (30 seconds)

**Show:**
- Hero section with tagline "Predict Freely. Bet Privately."
- Three key features: Hidden Positions, MEV Protected, Anonymous Betting
- Stats showing protocol activity

**Say:**
> "Veiled Markets is the first prediction market where your bets are truly private. Built on Aleo's zero-knowledge architecture, we solve the fundamental problems with existing prediction markets."

---

### 2. Connect Wallet (15 seconds)

**Action:** Click "Connect Wallet" button

**Show:**
- Wallet connection flow
- Address displayed with privacy badge

**Say:**
> "Users connect their Aleo wallet. Even though we're connected, our betting activity will remain private from other users."

---

### 3. Browse Markets (30 seconds)

**Action:** Scroll to Markets section

**Show:**
- Category filters (Crypto, Economics, Sports, etc.)
- Market cards with aggregated odds
- Privacy indicators on each card

**Say:**
> "Here we see active markets. Notice the aggregated odds - 62.5% YES for Bitcoin reaching $150K. This represents the collective wisdom of all bettors, but nobody can see individual positions."

---

### 4. Place a Private Bet (60 seconds)

**Action:** Click on a market card to open betting modal

**Step 1: Choose Position**
> "I'll bet YES on Bitcoin reaching $150K. Notice the current odds show 1.57x potential payout."

**Step 2: Enter Amount**
> "I'll bet 100 ALEO. The modal shows my potential payout of 157 ALEO if I win."

**Step 3: Privacy Notice**
> "See this privacy notice - my bet amount and position are encrypted using zero-knowledge proofs. The only thing that updates publicly is the total pool size."

**Step 4: Submit**
> "When I submit, a ZK proof is generated locally, verifying my bet is valid without revealing the details."

**Show:** Success confirmation with privacy badge

---

### 5. Explain Privacy Model (45 seconds)

**Show:** Scroll to "How It Works" section

**Say:**
> "Let me explain what makes this different from Polymarket or other prediction markets:

> 1. **On Polymarket**, everyone can see who bet what. Whales get front-run, people follow the herd, and bettors face social pressure.

> 2. **On Veiled Markets**, your bet is encrypted. The smart contract verifies it's valid using zero-knowledge proofs, but nobody - not even us - can see your position.

> 3. Only the aggregate pool totals are public, which is necessary for odds calculation."

---

### 6. Technical Deep Dive (Optional - 60 seconds)

**For technical judges, show the code:**

```bash
# Show Leo smart contract
cat contracts/src/main.leo
```

**Key points:**
- `Bet` record is private - only owner can decrypt
- `place_bet` transition updates public pool without revealing individual bet
- ZK proof verifies bet validity

---

## 🎯 Key Talking Points

### Why Aleo?

> "Aleo is the only blockchain that provides programmable privacy at the application layer. This isn't just encryption - it's zero-knowledge proofs that allow computation on private data."

### Why Prediction Markets Need Privacy?

1. **No MEV/Front-running** - Bots can't see your order
2. **No Whale Tracking** - No herding behavior
3. **No Social Pressure** - Bet your true beliefs
4. **No Manipulation** - Can't fake volume

### Real-World Impact

> "Imagine you work at Apple and want to bet on an AI announcement. On public markets, this could be insider trading evidence. On Veiled Markets, you can express your prediction without exposure."

---

## 🏆 Differentiators

| Feature | Polymarket | Veiled Markets |
|---------|------------|----------------|
| Bet Privacy | ❌ Public | ✅ Encrypted |
| MEV Protection | ❌ None | ✅ Built-in |
| Identity Privacy | ❌ Linked | ✅ Anonymous |
| Odds Calculation | ✅ Real-time | ✅ Real-time |
| Decentralized | ⚠️ Partial | ✅ Fully |

---

## 📱 Screenshots for Presentation

1. **Hero Section** - Shows value proposition
2. **Markets Grid** - Shows variety and aggregated odds
3. **Betting Modal** - Shows privacy indicators
4. **Success State** - Shows ZK proof confirmation
5. **How It Works** - Shows 4-step flow

---

## 🎤 Closing Statement

> "Veiled Markets demonstrates that privacy and transparency aren't opposites. With zero-knowledge proofs, we can have fair, verifiable markets where individuals maintain their privacy. This is only possible on Aleo."

---

## ❓ Anticipated Questions

**Q: How do you prevent cheating if bets are private?**
> "Zero-knowledge proofs verify every bet is valid without revealing the content. The math guarantees correctness."

**Q: How do odds work if individual bets are hidden?**
> "Only aggregate pool totals are public. This is enough for odds calculation while keeping individual positions private."

**Q: What about regulatory compliance?**
> "Aleo supports selective disclosure. Users can prove compliance (e.g., not from restricted jurisdiction) without revealing identity."

**Q: Is this production ready?**
> "This is a hackathon MVP. Production would need audits, oracle integration, and liquidity bootstrapping."

