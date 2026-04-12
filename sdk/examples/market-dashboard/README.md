# Market Dashboard Example

Minimal standalone web app that reads Veiled Markets data from the SDK.
Demonstrates:

- `createClient()` + `setIndexer()` for FAMM market browsing
- `VeiledMarketsClient.getTrendingMarkets()` with live on-chain pool enrichment
- `createTurboClient()` for current rolling Turbo market
- `detectWallet()` browser wallet selection
- Basic UI with no framework dependency beyond React

Run in 3 files — no Tailwind, no design system, just raw SDK usage.

## Setup

```bash
cd sdk/examples/market-dashboard
pnpm install
cp .env.example .env   # fill in SUPABASE_URL + SUPABASE_ANON_KEY
pnpm dev
```

Then open http://localhost:5173.

## What it shows

1. **Markets tab** — top 10 FAMM markets sorted by volume. Each row shows
   the question, pool reserves, outcome prices, and category.

2. **Turbo tab** — current active BTC turbo market with countdown and
   baseline price. Click Buy UP/DOWN to open wallet confirmation (uses
   `detectWallet()` to pick whichever Aleo wallet is installed).

3. **Wallet status** — shows which wallet is detected and the connected
   address (if any).

## Learning points

This example is intentionally tiny (~200 lines total) so you can read
the code end-to-end in 5 minutes and see exactly which SDK methods are
called where. No abstraction layers, no indirection.
