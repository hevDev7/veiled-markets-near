# 🎯 Veiled Markets

<div align="center">

<img src="./logo-veiled-markets.png" alt="Veiled Markets Logo" width="200"/>

### **Predict Freely. Bet Privately.**

*The first privacy-preserving prediction market built on Aleo blockchain*

[![Aleo](https://img.shields.io/badge/Built%20on-Aleo-00D4AA?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iIzAwRDRBQSIvPjwvc3ZnPg==)](https://aleo.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)](https://react.dev)

[Live Demo](https://veiled-markets.vercel.app) · [Documentation](./docs) · [Smart Contracts](./contracts) · [Blockchain Explorer](https://testnet.explorer.provable.com/program/veiled_markets.aleo)

</div>

---

## 🌟 Overview

**Veiled Markets** revolutionizes prediction markets by leveraging Aleo's zero-knowledge architecture to provide complete privacy for market participants. Unlike traditional prediction markets where all bets are visible on-chain, Veiled Markets ensures:

- 🔒 **Private Betting** — Your bet amount and position remain encrypted
- 🛡️ **MEV Protection** — No front-running or sandwich attacks possible
- 🎭 **Anonymous Participation** — Express your true beliefs without social pressure
- 📊 **Fair Markets** — Parimutuel pool system with transparent odds
- ✅ **Verifiable Outcomes** — All markets verifiable on-chain with transaction links
- 🔗 **Real Blockchain Data** — Live markets fetched directly from Aleo testnet

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VEILED MARKETS PROTOCOL                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐           │
│   │   Frontend   │────▶│ Indexer API  │────▶│ Leo Contracts │           │
│   │   (React)    │     │ (TypeScript) │     │   (Aleo VM)   │           │
│   └──────────────┘     └──────────────┘     └──────────────┘           │
│          │                     │                     │                   │
│          │                     ▼                     ▼                   │
│          │            ┌──────────────┐    ┌──────────────┐              │
│          │            │ Market Index │    │ Market State │              │
│          │            │    (JSON)    │    │  (On-chain)  │              │
│          │            └──────────────┘    └──────────────┘              │
│          │                                        │                      │
│          └────────────────────────────────────────┴──────────────────┐  │
│                                                                       ▼  │
│                                                            ┌───────────┐ │
│                                                            │ User Bets │ │
│                                                            │ (Private) │ │
│                                                            └───────────┘ │
│                                                                          │
│   PUBLIC DATA:                        PRIVATE DATA:                      │
│   • Market question                   • Individual bet amounts           │
│   • Total pool size                   • User positions (Yes/No)          │
│   • Parimutuel odds                   • User identities                  │
│   • Resolution deadline               • Winning claims                   │
│   • Transaction IDs (verifiable)      • Bet history                      │
│   • Block heights                                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Components

1. **Smart Contracts** (`contracts/src/main.leo`)
   - Parimutuel pool system for fair odds
   - Market creation, betting, resolution, and claiming
   - 2% total fees (1% protocol + 1% creator)

2. **Blockchain Indexer** (`backend/src/indexer.ts`)
   - Scans Aleo blockchain for market creation transactions
   - Auto-generates market registry (no hardcoded IDs)
   - Scalable solution for production deployment

3. **Frontend Application** (`frontend/src/`)
   - Real-time market data from blockchain
   - Wallet integration (Puzzle, Leo)
   - On-chain verification links for transparency

4. **SDK** (`sdk/src/`)
   - TypeScript client for contract interaction
   - Transaction building and signing
   - Type-safe API

## 🚀 Quick Start

### Prerequisites

- [Aleo SDK](https://developer.aleo.org/getting_started) (v1.0+)
- [Node.js](https://nodejs.org) (v18+)
- [pnpm](https://pnpm.io) (v8+)
- [Leo](https://developer.aleo.org/leo) (latest)

### Installation

```bash
# Clone the repository
git clone https://github.com/hevDev7/veiled-markets-near.git
cd veiled-markets-near

# Install dependencies
pnpm install

# Setup environment variables
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your configuration

# Build smart contracts
cd contracts
leo build

# Deploy contracts (optional - already deployed on testnet)
leo execute create_market "10001field" "1u8" "14107191u64" "14124471u64" --broadcast

# Start frontend development server
cd ../frontend
pnpm dev
```

### Deployed Contract

The contract is already deployed on Aleo Testnet:
- **Program ID**: `veiled_markets.aleo`
- **Deployment TX**: [at1j2f9r4mdls0n6k55nnscdckhuz7uyqfkuhj9kmer2v2hs6z0u5zsm8xf90](https://testnet.explorer.provable.com/transaction/at1j2f9r4mdls0n6k55nnscdckhuz7uyqfkuhj9kmer2v2hs6z0u5zsm8xf90)
- **Network**: Testnet
- **Explorer**: [View on Explorer](https://testnet.explorer.provable.com/program/veiled_markets.aleo)

### Live Markets

9 real markets are currently active across all categories:
1. **Crypto**: Will Bitcoin reach $100,000 by end of Q1 2026?
2. **Politics**: Will Trump win the 2024 US Presidential Election?
3. **Sports**: Will Lakers win NBA Championship 2026?
4. **Crypto**: Will Ethereum reach $5,000 by March 2026?
5. **Entertainment**: Will Taylor Swift release a new album in 2026?
6. **Tech**: Will Apple release AR glasses in 2026?
7. **Economics**: Will US Fed cut interest rates in Q1 2026?
8. **Science**: Will SpaceX land on Mars by 2030?
9. **Crypto**: Will Ethereum reach $10,000 by end of Q2 2026? ⭐ NEW

All markets are verifiable on-chain with transaction links!

## 📁 Project Structure

```
veiled-markets/
├── contracts/              # Leo smart contracts
│   ├── src/
│   │   └── main.leo       # Core prediction market logic (Parimutuel)
│   ├── build/             # Compiled Aleo instructions
│   ├── create-markets.sh  # Script to create markets via CLI
│   └── program.json       # Contract configuration
├── frontend/              # React frontend application
│   ├── src/
│   │   ├── components/    # UI components (MarketCard, MarketRow, etc.)
│   │   ├── lib/           # Utilities & SDK integration
│   │   │   ├── aleo-client.ts      # Blockchain client
│   │   │   ├── market-store.ts     # Real market data store
│   │   │   ├── question-mapping.ts # Question hash to text mapping
│   │   │   ├── wallet.ts           # Wallet adapters
│   │   │   └── store.ts            # Global state
│   │   ├── pages/         # Page components (Dashboard, MarketDetail)
│   │   └── styles/        # Global styles & theme
│   └── public/            # Static assets
│       └── markets-index.json # Indexed markets from blockchain
├── backend/               # Blockchain indexer service
│   ├── src/
│   │   ├── indexer.ts     # Market indexer logic
│   │   ├── index-markets.ts # CLI script
│   │   └── config.ts      # Configuration
│   └── package.json
├── sdk/                   # TypeScript SDK
│   ├── src/
│   │   ├── client.ts      # Aleo client wrapper
│   │   ├── types.ts       # Type definitions
│   │   └── utils.ts       # Helper functions
│   └── package.json
├── scripts/               # Utility scripts
│   ├── index-markets.sh   # Run blockchain indexer
│   └── generate-question-hash.js # Generate SHA-256 hashes for questions
├── docs/                  # Documentation
│   ├── ARCHITECTURE.md
│   ├── AMM_IMPLEMENTATION.md
│   ├── ON_CHAIN_VERIFICATION.md
│   ├── COPYABLE_MARKET_ID.md
│   └── PRIVACY_ANALYSIS.md
├── INDEXER_GUIDE.md       # Indexer service guide
└── README.md
```

## 🎯 Features

### For Market Creators
- ✅ Create binary (Yes/No) prediction markets
- ✅ Set betting and resolution deadlines (block height-based)
- ✅ Earn 1% creator fee from market activity
- ✅ Markets verifiable on blockchain explorer
- ✅ Support for 7 categories: Politics, Sports, Crypto, Entertainment, Tech, Economics, Science

### For Participants
- ✅ Place private bets without revealing position or amount
- ✅ View real-time parimutuel odds (fair pricing)
- ✅ See potential payout multipliers before betting
- ✅ Claim winnings privately after market resolution
- ✅ Copy market IDs with one click
- ✅ Verify markets on-chain via transaction links

### For Everyone
- ✅ Transparent market rules with private participation
- ✅ Parimutuel pool system (no AMM, no liquidity providers needed)
- ✅ 2% total fees (1% protocol + 1% creator)
- ✅ No counterparty risk — funds secured by smart contract
- ✅ Real-time data fetched from Aleo blockchain
- ✅ Auto-refresh every 30 seconds
- ✅ Block height-based time calculations

### New Features (Latest Update)

#### 🎯 Dynamic Question Mapping System
All market questions are now stored in localStorage and managed dynamically through the question-mapping system. No more hardcoded questions in the codebase!

- Questions mapped by SHA-256 hash (converted to Aleo decimal format)
- Automatic initialization on app startup
- Easy to add new markets without code changes
- Fallback to hash preview if question not found

#### 🔗 On-Chain Verification
Every market card displays a "Verify On-Chain" button that links to the creation transaction on Aleo blockchain explorer. This proves markets are genuinely hosted on-chain, not mock data.

#### 📋 Copyable Market IDs
Market IDs are displayed in truncated format (e.g., `2226266059...41034862field`) with a copy button for easy sharing while keeping the UI clean.

#### 🔄 Blockchain Indexer
Automated service that scans the blockchain for market creation transactions, eliminating the need for hardcoded market IDs. Scalable solution for production deployment.

#### 📊 Real Market Data
All 9 markets fetch live data from Aleo testnet:
- Real pool sizes
- Actual bet counts
- Live block heights
- Accurate time remaining
- Dynamic question text from localStorage

## 🔐 Privacy Model

| Data Type | Visibility | Description |
|-----------|------------|-------------|
| Market Question | 🌍 Public | Everyone can see what's being predicted |
| Total Pool Size | 🌍 Public | Aggregate betting volume is visible |
| Parimutuel Odds | 🌍 Public | Fair odds based on pool distribution |
| Transaction IDs | 🌍 Public | Verifiable on blockchain explorer |
| Block Heights | 🌍 Public | Transparent deadline tracking |
| Your Bet Amount | 🔒 Private | Only you know how much you bet |
| Your Position | 🔒 Private | Only you know if you bet Yes/No |
| Your Identity | 🔒 Private | Bets are not linked to your address |
| Winnings Claim | 🔒 Private | Claim without revealing how much you won |

### Parimutuel Pool System

Unlike AMM-based prediction markets, Veiled Markets uses a **parimutuel pool system**:

- All bets go into YES and NO pools
- Winners split the total pool proportionally
- No liquidity providers needed
- Fair odds determined by market participants
- Formula: `Payout = (Total Pool / Winning Pool) × (1 - Fees)`

**Example:**
- YES pool: 1,000 ALEO
- NO pool: 500 ALEO
- Total: 1,500 ALEO
- If YES wins: Each 1 ALEO bet on YES returns `(1,500 / 1,000) × 0.98 = 1.47 ALEO`
- Potential multiplier: **1.47x**

## 🛠️ Technology Stack

### Smart Contracts
- **Leo** - Aleo's ZK programming language
- **Aleo VM** - Zero-knowledge virtual machine
- **Parimutuel Logic** - Fair odds calculation

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Zustand** - State management
- **React Router** - Navigation

### Backend
- **TypeScript** - Indexer service
- **Node.js** - Runtime
- **Aleo SDK** - Blockchain interaction

### Infrastructure
- **Vercel** - Frontend hosting
- **Aleo Testnet** - Blockchain network
- **GitHub Actions** - CI/CD (optional)

## 💼 Supported Wallets

| Wallet | Status | Features | Notes |
|--------|--------|----------|-------|
| 🧩 **Puzzle Wallet** | ✅ Fully Supported | Full integration, balance display | Recommended |
| 🦁 **Leo Wallet** | ✅ Supported | Full integration | Works with latest SDK |

### Wallet Features
- ✅ **Real-time balance updates** (public + private credits)
- ✅ **Transaction signing** via wallet extension
- ✅ **Network switching** (testnet/mainnet)
- ✅ **Address display** with copy functionality
- ✅ **Secure connection** with wallet encryption

### Important Notes
- Demo Mode has been removed - users must connect with real wallets
- Puzzle Wallet requires specific network names: `AleoTestnet`, `AleoMainnet`
- Private balance reading may be limited by wallet capabilities

See [WALLET_TROUBLESHOOTING.md](./WALLET_TROUBLESHOOTING.md) for detailed solutions.

## 🔄 Blockchain Indexer

The indexer service automatically scans the Aleo blockchain for market creation transactions, eliminating the need for hardcoded market IDs.

### Running the Indexer

```bash
# Install backend dependencies
cd backend
npm install

# Run indexer
npm run index

# Or use the helper script
cd ..
./scripts/index-markets.sh
```

### Output

The indexer generates `backend/public/markets-index.json` and copies it to `frontend/public/markets-index.json`:

```json
{
  "lastUpdated": "2026-01-28T15:40:51.456Z",
  "totalMarkets": 9,
  "marketIds": ["...", "..."],
  "markets": [
    {
      "marketId": "3582024152336217571382682973364798990155453514672503623063651091171230848724field",
      "transactionId": "at1crl3gd6ukawwrslf3r5vqttg7a8hll84fj2klqtmtwdafntspg9sgcgw2a",
      "creator": "aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8",
      "questionHash": "350929565016816493992297964402345071115472527106339097957348390879136520853field",
      "category": 3,
      "deadline": "14107320u64",
      "resolutionDeadline": "14124600u64",
      "createdAt": 1769614851455,
      "blockHeight": 14067000
    }
  ]
}
```

### Benefits

- ✅ **No hardcoded IDs** - Markets discovered automatically
- ✅ **Scalable** - Handles thousands of markets
- ✅ **Production-ready** - Can be run as cron job
- ✅ **Verifiable** - All data from blockchain

See [INDEXER_GUIDE.md](./INDEXER_GUIDE.md) for detailed documentation.

## 🧪 Development

### Creating Markets via CLI

```bash
cd contracts

# Generate question hash first
node ../scripts/generate-question-hash.js "Will Ethereum reach $10,000 by end of Q2 2026?"
# Output: 350929565016816493992297964402345071115472527106339097957348390879136520853field

# Create a single market
leo execute create_market \
  "350929565016816493992297964402345071115472527106339097957348390879136520853field" \  # question_hash (decimal format)
  "3u8" \             # category (3=Crypto)
  "14107320u64" \     # betting_deadline (block height)
  "14124600u64" \     # resolution_deadline (block height)
  --broadcast

# Create multiple markets
./create-markets.sh

# Or use the new market creation script
./create-new-market.sh
```

### Adding Question Mapping

After creating a market, add the question mapping to `frontend/src/lib/question-mapping.ts`:

```typescript
export function initializeQuestionMappings(): void {
    const mappings: Record<string, string> = {
        // ... existing mappings ...
        
        // Your new market
        '350929565016816493992297964402345071115472527106339097957348390879136520853field':
            'Will Ethereum reach $10,000 by end of Q2 2026?',
    };
    // ...
}
```

The question will automatically appear in the dashboard after refresh!

### Testing

```bash
# Frontend tests
cd frontend
pnpm test

# Contract tests
cd contracts
leo test

# E2E tests (if available)
pnpm test:e2e
```

### Environment Variables

Create `frontend/.env`:

```env
VITE_NETWORK=testnet
VITE_PROGRAM_ID=veiled_markets.aleo
VITE_ALEO_RPC_URL=https://api.explorer.provable.com/v1/testnet
VITE_EXPLORER_URL=https://testnet.explorer.provable.com
```

## 📚 Documentation

- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Parimutuel System](./docs/PARIMUTUEL_SYSTEM.md)
- [Privacy Analysis](./docs/PRIVACY_ANALYSIS.md)
- [On-Chain Verification](./docs/ON_CHAIN_VERIFICATION.md)
- [Copyable Market ID](./docs/COPYABLE_MARKET_ID.md)
- [Indexer Guide](./INDEXER_GUIDE.md)
- [Create Market Guide](./CREATE_MARKET_GUIDE.md)
- [Wallet Troubleshooting](./WALLET_TROUBLESHOOTING.md)
- [Real Data Integration](./REAL_DATA_INTEGRATION.md)

## 📜 License

MIT License — see [LICENSE](./LICENSE) for details.

## 🙏 Acknowledgments

- **Aleo Team** - For the amazing zero-knowledge blockchain platform
- **Leo Language** - For making ZK programming accessible
- **Community** - For feedback and contributions

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🐛 Bug Reports

Found a bug? Please open an issue with:
- Description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if applicable)
- Environment details (OS, browser, wallet)

## 💬 Community & Support

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - General questions and ideas
- **Documentation** - Check the [docs](./docs) folder

---

<div align="center">

**Built with 💜 for the Aleo Ecosystem**

[Live Demo](https://veiled-markets.vercel.app) · [Blockchain Explorer](https://testnet.explorer.provable.com/program/veiled_markets.aleo) · [GitHub](https://github.com/hevDev7/veiled-markets-near)

**Contract Address**: `veiled_markets.aleo` on Aleo Testnet

</div>

