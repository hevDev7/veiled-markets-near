# 🎯 Veiled Markets

<div align="center">

![Veiled Markets Banner](./docs/assets/banner.png)

### **Predict Freely. Bet Privately.**

*The first privacy-preserving prediction market built on Aleo blockchain*

[![Aleo](https://img.shields.io/badge/Built%20on-Aleo-00D4AA?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iIzAwRDRBQSIvPjwvc3ZnPg==)](https://aleo.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)](https://react.dev)

[Demo](https://veiled.markets) · [Documentation](./docs) · [Smart Contracts](./contracts) · [Frontend](./frontend)

</div>

---

## 🌟 Overview

**Veiled Markets** revolutionizes prediction markets by leveraging Aleo's zero-knowledge architecture to provide complete privacy for market participants. Unlike traditional prediction markets where all bets are visible on-chain, Veiled Markets ensures:

- 🔒 **Private Betting** — Your bet amount and position remain encrypted
- 🛡️ **MEV Protection** — No front-running or sandwich attacks possible
- 🎭 **Anonymous Participation** — Express your true beliefs without social pressure
- 📊 **Fair Markets** — No whale manipulation or herding behavior
- ✅ **Verifiable Outcomes** — Cryptographic proofs ensure fair resolution

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VEILED MARKETS PROTOCOL                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐           │
│   │   Frontend   │────▶│  SDK/Client  │────▶│ Leo Contracts │           │
│   │   (React)    │     │ (TypeScript) │     │   (Aleo VM)   │           │
│   └──────────────┘     └──────────────┘     └──────────────┘           │
│                                                    │                     │
│                              ┌─────────────────────┴─────────────────┐  │
│                              ▼                                       ▼  │
│                    ┌──────────────┐                      ┌───────────┐  │
│                    │ Market State │                      │ User Bets │  │
│                    │  (Public)    │                      │ (Private) │  │
│                    └──────────────┘                      └───────────┘  │
│                                                                          │
│   PUBLIC DATA:                        PRIVATE DATA:                      │
│   • Market question                   • Individual bet amounts           │
│   • Total pool size                   • User positions (Yes/No)          │
│   • Resolution deadline               • User identities                  │
│   • Outcome (after resolution)        • Winning claims                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- [Aleo SDK](https://developer.aleo.org/getting_started) (v1.0+)
- [Node.js](https://nodejs.org) (v18+)
- [pnpm](https://pnpm.io) (v8+)

### Installation

```bash
# Clone the repository
git clone https://github.com/veiled-markets/veiled-markets.git
cd veiled-markets

# Install dependencies
pnpm install

# Build smart contracts
cd contracts && leo build

# Start frontend development server
cd ../frontend && pnpm dev
```

## 📁 Project Structure

```
veiled-markets/
├── contracts/              # Leo smart contracts
│   ├── src/
│   │   └── main.leo       # Core prediction market logic
│   ├── build/             # Compiled Aleo instructions
│   └── program.json       # Contract configuration
├── frontend/              # React frontend application
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── hooks/         # React hooks
│   │   ├── lib/           # Utilities & SDK integration
│   │   ├── pages/         # Page components
│   │   └── styles/        # Global styles & theme
│   └── public/            # Static assets
├── sdk/                   # TypeScript SDK
│   ├── src/
│   │   ├── client.ts      # Aleo client wrapper
│   │   ├── types.ts       # Type definitions
│   │   └── utils.ts       # Helper functions
│   └── package.json
├── docs/                  # Documentation
└── README.md
```

## 🎯 Features

### For Market Creators
- Create binary (Yes/No) or multi-outcome markets
- Set resolution deadlines and oracle sources
- Earn creator fees from market activity

### For Participants
- Place private bets without revealing position or amount
- View real-time aggregated market odds
- Claim winnings privately after market resolution

### For Everyone
- Transparent market rules with private participation
- Cryptographic proof of fair resolution
- No counterparty risk — funds secured by smart contract

## 🔐 Privacy Model

| Data Type | Visibility | Description |
|-----------|------------|-------------|
| Market Question | 🌍 Public | Everyone can see what's being predicted |
| Total Pool | 🌍 Public | Aggregate betting volume is visible |
| Your Bet Amount | 🔒 Private | Only you know how much you bet |
| Your Position | 🔒 Private | Only you know if you bet Yes/No |
| Your Identity | 🔒 Private | Bets are not linked to your address |
| Winnings Claim | 🔒 Private | Claim without revealing how much you won |

## 🛠️ Technology Stack

- **Smart Contracts**: Leo (Aleo's ZK programming language)
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + Framer Motion
- **State Management**: Zustand
- **Web3 Integration**: Aleo SDK + Wallet Adapters

## 💼 Supported Wallets

| Wallet | Status | Features |
|--------|--------|----------|
| 🧩 **Puzzle Wallet** | ✅ Supported | Full integration, recommended |
| 🦁 **Leo Wallet** | ✅ Supported | Basic integration |
| 🎮 **Demo Mode** | ✅ Available | Test without real wallet |

### Wallet Features
- **Real-time balance updates** (public + private credits)
- **Transaction signing** via wallet extension
- **Record decryption** for private bet viewing
- **Network switching** (testnet/mainnet)

## 📜 License

MIT License — see [LICENSE](./LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

---

<div align="center">

**Built with 💜 for the Aleo Ecosystem**

[Website](https://veiled.markets) · [Twitter](https://twitter.com/veiledmarkets) · [Discord](https://discord.gg/veiledmarkets)

</div>

