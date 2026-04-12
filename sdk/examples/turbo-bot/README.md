# Turbo Bot Example

Automated scheduler that bets a fixed amount on the current Turbo market
for a target symbol (default BTC) every round. Demonstrates:

- `TurboClient` for on-chain reads
- `quoteBuyUpDown()` for exact share calculation
- `NodeExecutor` for full Node.js transaction submission flow
- `IndexerClient` to track historical round performance

## Setup

```bash
cd sdk/examples/turbo-bot
pnpm install
export OPERATOR_PRIVATE_KEY=APrivateKey1zkp...    # bettor, NOT operator
export SUPABASE_URL=https://xxx.supabase.co        # optional (for stats)
export SUPABASE_ANON_KEY=sb_publishable_...        # optional
```

## Usage

```bash
# Bet 1 ALEO on UP each round (dry-run first!)
DRY_RUN=1 node --loader ts-node/esm bot.ts BTC UP 1

# For real (spends testnet ALEO):
node --loader ts-node/esm bot.ts BTC UP 1
```

The bot polls the backend oracle every 30 seconds, detects new active
markets via `/chain/symbol`, and submits a `buy_up_down` tx as soon as a
fresh round is created.

## Strategies

Beyond fixed-side betting, you can edit `bot.ts` to implement:

- **Contrarian**: bet the side with less stake (better parimutuel odds)
- **Momentum**: compare current Pyth vs baseline; bet UP if diff > +0.5%
- **Win-rate scaling**: query IndexerClient for recent round outcomes and
  scale bet size based on your win rate

The SDK provides all the pieces; the strategy is up to you.
