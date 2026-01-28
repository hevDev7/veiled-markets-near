# 🏗️ Veiled Markets Architecture

## Overview

Veiled Markets is a privacy-preserving prediction market protocol built on Aleo blockchain. This document outlines the technical architecture and design decisions.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            VEILED MARKETS PROTOCOL                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐         ┌────────────────┐         ┌────────────────┐  │
│  │    Frontend    │────────▶│   TypeScript   │────────▶│      Leo       │  │
│  │  (React/Vite)  │         │      SDK       │         │   Contracts    │  │
│  └────────────────┘         └────────────────┘         └────────────────┘  │
│         │                          │                          │             │
│         ▼                          ▼                          ▼             │
│  ┌────────────────┐         ┌────────────────┐         ┌────────────────┐  │
│  │   Leo Wallet   │         │  Aleo Network  │         │  Program State │  │
│  │   Integration  │         │    (Testnet)   │         │  (On-Chain)    │  │
│  └────────────────┘         └────────────────┘         └────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Smart Contracts (Leo)

Located in `/contracts/src/main.leo`

#### Records (Private State)

| Record | Description | Fields |
|--------|-------------|--------|
| `Bet` | Private bet record | owner, market_id, amount, outcome, odds_at_bet, timestamp |
| `WinningsClaim` | Claim record for winners | owner, market_id, amount, claimed |
| `Credits` | Internal token record | owner, amount |

#### Mappings (Public State)

| Mapping | Description |
|---------|-------------|
| `markets` | Market metadata (question, deadline, status) |
| `market_pools` | Aggregate pool totals (YES/NO amounts) |
| `market_resolutions` | Resolution data for settled markets |
| `user_claims` | Tracking to prevent double claims |

#### Key Transitions

1. **create_market** - Create a new prediction market
2. **place_bet** - Place a private bet (amount/position encrypted)
3. **close_market** - Close betting when deadline passes
4. **resolve_market** - Resolve with winning outcome
5. **claim_winnings** - Winners claim their share privately

### 2. TypeScript SDK

Located in `/sdk/src/`

- **client.ts** - Main client class for protocol interaction
- **types.ts** - TypeScript type definitions
- **utils.ts** - Helper functions for calculations

### 3. Frontend Application

Located in `/frontend/src/`

Built with:
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- Framer Motion (animations)
- Zustand (state management)

## Privacy Model

### What's Private

| Data | Privacy Level | Details |
|------|--------------|---------|
| Bet Amount | 🔒 Encrypted | Only owner can decrypt |
| Bet Position | 🔒 Encrypted | Yes/No choice is hidden |
| User Identity | 🔒 Protected | Bets not linked to address |
| Winnings Claim | 🔒 Private | Claim amount hidden |

### What's Public

| Data | Visibility | Purpose |
|------|------------|---------|
| Market Question | 🌍 Public | Everyone sees what's predicted |
| Total Pool Size | 🌍 Public | Aggregate volume visible |
| Pool Distribution | 🌍 Public | YES/NO totals for odds calculation |
| Resolution Outcome | 🌍 Public | Final result is verifiable |

## Zero-Knowledge Proof Flow

```
1. User creates bet locally
   ├── Generates private inputs (amount, position)
   └── Creates ZK proof of valid bet

2. Transaction submitted to network
   ├── Proof verified on-chain
   ├── Private record created
   └── Only pool totals updated publicly

3. Market resolves
   ├── Outcome becomes public
   └── Winners can generate claim proofs

4. Winner claims
   ├── Proves ownership of winning bet
   ├── Receives payout privately
   └── Claim marked to prevent double-spend
```

## Security Considerations

### Smart Contract Security

- All state transitions validated
- Double-claim prevention via mapping
- Only creator can resolve markets
- Deadline enforcement

### Privacy Guarantees

- Individual bets never exposed
- No correlation between bets and addresses
- Aggregate data only reveals totals
- Winnings claimed privately

## Fee Structure

| Fee Type | Rate | Recipient |
|----------|------|-----------|
| Protocol Fee | 1% | Protocol Treasury |
| Creator Fee | 1% | Market Creator |
| **Total** | **2%** | |

## Deployment

### Testnet Deployment

```bash
# Build contracts
cd contracts
leo build

# Deploy to testnet
leo deploy --network testnet
```

### Frontend Deployment

```bash
# Install dependencies
pnpm install

# Build for production
pnpm build

# Deploy to hosting (Vercel/Netlify)
```

## Future Enhancements

1. **Multi-outcome markets** - More than Yes/No
2. **Oracle integration** - Automated resolution
3. **Liquidity mining** - Incentivize market makers
4. **Cross-chain bridges** - Bring liquidity from other chains
5. **Mobile app** - Native iOS/Android experience

