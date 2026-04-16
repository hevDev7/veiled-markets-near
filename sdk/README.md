# @veiled-markets/sdk

> TypeScript SDK for [Veiled Markets](https://veiledmarkets.xyz) — privacy-preserving prediction markets on the Aleo blockchain.

[![npm version](https://img.shields.io/npm/v/@veiled-markets/sdk.svg)](https://www.npmjs.com/package/@veiled-markets/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-191%20passing-brightgreen.svg)](#testing)

Complete client library for the Veiled Markets protocol — covers FPMM AMM markets, Turbo (5-minute UP/DOWN) markets, governance proposals, parlay multi-leg bets, the Supabase indexer, and Pyth Hermes oracle verification. Works in both Node.js (bots, schedulers, services) and the browser (via wallet adapters).

**Live Telegram Bot:** [@veiledmarkets_bot](https://t.me/veiledmarkets_bot) — interact with both Turbo and FPMM markets via Telegram (built with this SDK).

## Features

- **Six clients in one package** — `VeiledMarketsClient`, `TurboClient`, `VeiledGovernanceClient`, `ParlayClient`, `IndexerClient`, `PythHermesClient`
- **Off-chain quoting** — exact mirrors of on-chain `*_fin` math (FPMM constant-product, parimutuel turbo, fee math, LP shares, dispute bonds)
- **Wallet adapters** — Shield, Puzzle, Leo (browser); auto-detection helpers
- **Node.js executor** — submit transactions from backend bots without a browser wallet (`NodeExecutor` wraps `snarkos developer execute`)
- **Tri-token support** — ALEO, USDCX, USAD via parallel deployed contracts
- **Type-safe** — full TypeScript types for every transition input, mapping read, and event payload
- **Tested** — 191 unit tests across math, executor, indexer, parlay, turbo, governance, wallet detection
- **Dual ESM + CJS** — works in modern bundlers (Vite, Next.js, esbuild) and legacy Node CommonJS

## Install

```bash
npm install @veiled-markets/sdk @provablehq/sdk
# or
pnpm add @veiled-markets/sdk @provablehq/sdk
# or
yarn add @veiled-markets/sdk @provablehq/sdk
```

`@provablehq/sdk` is a peer dependency — install it alongside.

## Quick start

### 1. Browser — buy shares with a wallet

```ts
import {
  createClient,
  detectWallet,
  ShieldWalletAdapter,
  TokenType,
} from '@veiled-markets/sdk'

// Connect any installed Aleo wallet (auto-detect Shield/Puzzle/Leo)
const wallet = await detectWallet()
await wallet.connect()

const client = createClient({ network: 'testnet' })

// Quote and buy 1 ALEO of "Yes" shares on a market
const tx = await client.buyShares({
  marketId: '6714456500308939988571643410938688456589125073371172049141846839565066416064field',
  outcome: 1,                  // 1 = first outcome (Yes), 2 = No, 3/4 for multi-outcome
  amountMicro: 1_000_000n,     // 1 ALEO in micro units
  tokenType: TokenType.ALEO,
})

const result = await wallet.executeTransaction(tx)
console.log('tx id:', result.transactionId)
```

### 2. Browser — Turbo 5-minute UP/DOWN bet

```ts
import { createTurboClient, quoteBuyUpDown } from '@veiled-markets/sdk'

const turbo = createTurboClient({ network: 'testnet' })

// Get the current active BTC market from the operator backend
const market = await turbo.getCurrentMarket('BTC')

// Quote your potential payout BEFORE submitting
const quote = quoteBuyUpDown({
  pool: await turbo.getPool(market.market_id),
  side: 'UP',
  amountMicro: 1_000_000n,    // 1 ALEO
})
console.log(`Bet 1 ALEO UP → potential payout: ${Number(quote.payoutIfWin) / 1e6} ALEO`)

// Build and submit the buy_up_down transaction
const call = turbo.buildBuyUpDown({
  marketId: market.market_id,
  side: 'UP',
  amountMicro: 1_000_000n,
})
await wallet.executeTransaction(call)
```

### 3. Node.js — automated bet scheduler

```ts
import {
  createTurboClient,
  createNodeExecutor,
  TURBO_MIN_TRADE_AMOUNT,
} from '@veiled-markets/sdk'

const turbo = createTurboClient({ network: 'testnet' })
const executor = createNodeExecutor({
  privateKey: process.env.OPERATOR_PRIVATE_KEY!,
  network: 'testnet',
})

// Wait for a new BTC market to open, then bet 0.5 ALEO UP
const market = await turbo.waitForNewMarket('BTC', { pollIntervalMs: 5_000 })

const call = turbo.buildBuyUpDown({
  marketId: market.market_id,
  side: 'UP',
  amountMicro: 500_000n,
})

const result = await executor.execute(call)
console.log('on-chain tx:', result.txId)
```

`DRY_RUN=1` env var makes `NodeExecutor` skip the actual broadcast and return a `dryrun_*` placeholder tx id — useful for local development without burning credits.

### 4. Read off-chain indexer (Supabase)

```ts
import { createIndexerClient } from '@veiled-markets/sdk'

const indexer = createIndexerClient({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_ANON_KEY!,
})

// Top 10 markets by 24h volume
const top = await indexer.listMarkets({
  sortBy: 'volume_24h',
  limit: 10,
  status: 'active',
})

// Full audit trail for a single Turbo market_id (create + resolve events)
const audit = await indexer.getTurboAudit('6714456...field')
```

### 5. Verify Turbo oracle attestation against Pyth Hermes

```ts
import { createPythHermesClient, PYTH_FEED_IDS } from '@veiled-markets/sdk'

const pyth = createPythHermesClient()

// Cross-check operator's on-chain claim against Pyth's authoritative price
const verification = await pyth.verifyTurboMarket({
  symbol: 'BTC',
  publishTimeIso: '2026-04-12T00:58:21.000Z',
  operatorClaimedPrice: 73_094.24,
  toleranceBps: 10,             // 0.1% tolerance
})

if (!verification.matched) {
  console.error('OPERATOR MISBEHAVIOR — claim does not match Pyth historical')
}
```

### 6. Submit a governance proposal

```ts
import { createGovernanceClient, ESCALATION_TIER_COMMUNITY } from '@veiled-markets/sdk'

const gov = createGovernanceClient({ network: 'testnet' })

// Propose lowering the protocol fee from 50 bps to 30 bps
const call = gov.buildCreateProposal({
  proposalType: 2,              // FEE_CHANGE
  target: '1field',             // CONFIG_PROTOCOL_FEE_BPS
  payload1: 30n,                // new value: 30 bps
  payload2: '0field',
})

await wallet.executeTransaction(call)
```

## API surface

### Clients

| Class | Contract | Purpose |
|---|---|---|
| `VeiledMarketsClient` | `veiled_markets_v37/_usdcx_v7/_usad_v14` | FPMM AMM markets — create, buy/sell shares, add/remove LP, dispute, claim |
| `TurboClient` | `veiled_turbo_v9.aleo` | 5-min UP/DOWN markets — buy, claim winnings, claim refund, off-chain quote |
| `VeiledGovernanceClient` | `veiled_governance_v6.aleo` | Proposals (fee/param/pause/treasury/resolver), voting, escalation, finalization |
| `ParlayClient` | `veiled_parlay_v3.aleo` | Multi-leg parlay bets across all 3 token markets |
| `IndexerClient` | Supabase REST | Off-chain queries: market list, volumes, governance feed, turbo audit trail |
| `PythHermesClient` | `hermes.pyth.network` | Independent price verification for Turbo markets |

### Wallet adapters (browser)

| Adapter | Wallet |
|---|---|
| `ShieldWalletAdapter` | [Shield Wallet](https://shieldwallet.io) |
| `PuzzleWalletAdapter` | [Puzzle Wallet](https://puzzle.online) |
| `LeoWalletAdapter` | [Leo Wallet](https://leo.app) |
| `detectWallet()` | Auto-detect first installed |
| `listInstalledWallets()` | List all detected adapters |

### Node executor

`NodeExecutor` wraps `snarkos developer execute` for backend services — submit transactions without a browser wallet. Reads `OPERATOR_PRIVATE_KEY` from env, supports `DRY_RUN=1` for local testing.

### Off-chain math (mirrors on-chain `*_fin`)

- `quoteContractBuy(reserves, outcome, amountIn, fees)` — exact FPMM buy quote
- `quoteContractSell(reserves, outcome, sharesIn, fees)` — exact FPMM sell quote
- `quoteContractAddLiquidity(reserves, amount, totalLpShares)` — LP mint math
- `quoteBuyUpDown(pool, side, amount)` — Turbo parimutuel quote
- `quoteTurboPayout(share, pool, closingPrice, baselinePrice)` — claim quote
- `calculateContractMinDisputeBond(totalBonded)` — dispute bond floor (3× total)
- `calculateContractWinnerClaimUnlock(disputeDeadline)` — winner priority window
- `calculateParlayQuote(legs, stake, fees)` — parlay combined odds + payout

All functions use exact integer math matching the Leo `final fn` implementations — no floating point drift, off-chain quote always equals on-chain settlement.

## Configuration

### Network

```ts
const client = createClient({
  network: 'testnet',          // or 'mainnet' (when live)
  rpcUrl: 'https://api.explorer.provable.com/v1/testnet',  // optional override
  explorerUrl: 'https://testnet.explorer.provable.com',     // optional override
})
```

### Turbo backend (oracle URL)

```ts
const turbo = createTurboClient({
  network: 'testnet',
  oracleUrl: 'http://localhost:4090',   // backend pyth-oracle.ts URL
})
```

### Supabase indexer

```ts
const indexer = createIndexerClient({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,
})
```

## Examples

The repository includes 3 runnable examples in [`examples/`](./examples/):

| Example | Description |
|---|---|
| [`turbo-bot/`](./examples/turbo-bot) | CLI bot that auto-bets a fixed side every new Turbo round |
| [`market-dashboard/`](./examples/market-dashboard) | Vite + React dashboard reading from indexer + Pyth verification |
| [`governance-monitor/`](./examples/governance-monitor) | Discord/Slack notifier for new governance proposals |

Run an example:

```bash
cd examples/turbo-bot
pnpm install
DRY_RUN=1 OPERATOR_PRIVATE_KEY=APrivateKey1zk... pnpm tsx bot.ts BTC UP 0.5
```

## Testing

```bash
pnpm test
```

Current test coverage: **191 tests** across 8 files —

| File | Tests | Covers |
|---|---|---|
| `utils.test.ts` | 55 | Format/parse credits, time, addresses, validation |
| `parlay.test.ts` | 36 | Combined odds math, leg validation, payout |
| `turbo-client.test.ts` | 31 | TurboClient builders + parimutuel quoting |
| `client.test.ts` | 30 | VeiledMarketsClient + RPC fallback caching |
| `contract-math.test.ts` | 13 | FPMM constant-product (buy/sell/4-way/LP) |
| `indexer.test.ts` | 12 | Supabase REST query builder + filters |
| `pyth-client.test.ts` | 10 | Hermes URL builder + verification logic |
| `executor.test.ts` | 4 | NodeExecutor dry-run + arg encoding |

All tests use exact-value `assertEquals` (no `assert(true)` stubs). Math functions are tested against the same expected values as the on-chain Leo `@test` functions to ensure off-chain quote = on-chain settlement.

## Contracts

The SDK targets these deployed contracts on Aleo testnet:

| Contract | Program ID | Purpose |
|---|---|---|
| ALEO market | `veiled_markets_v37.aleo` | FPMM AMM, ALEO token |
| USDCX market | `veiled_markets_usdcx_v7.aleo` | FPMM AMM, USDCX stablecoin |
| USAD market | `veiled_markets_usad_v14.aleo` | FPMM AMM, USAD stablecoin |
| Governance | `veiled_governance_v6.aleo` | Proposals, escalation, cross-program exec |
| Turbo | `veiled_turbo_v9.aleo` | 5-min UP/DOWN, shared vault, Pyth oracle |
| Parlay | `veiled_parlay_v3.aleo` | Multi-leg parlay bets |

All program IDs are exported as constants from `@veiled-markets/sdk`:

```ts
import { PROGRAM_IDS } from '@veiled-markets/sdk'

PROGRAM_IDS.ALEO_MARKET    // 'veiled_markets_v37.aleo'
PROGRAM_IDS.USDCX_MARKET   // 'veiled_markets_usdcx_v7.aleo'
PROGRAM_IDS.USAD_MARKET    // 'veiled_markets_usad_v14.aleo'
PROGRAM_IDS.GOVERNANCE     // 'veiled_governance_v6.aleo'
PROGRAM_IDS.TURBO          // 'veiled_turbo_v9.aleo'
PROGRAM_IDS.PARLAY         // 'veiled_parlay_v3.aleo'
```

## Privacy model

All trading transitions use `credits.aleo::transfer_private_to_public` (or the USDCX/USAD equivalents) on the input side — bet amounts and outcome choices are encrypted record fields, never revealed in the public ledger. Payouts use `transfer_public_to_private` to return funds as fresh private records.

The SDK preserves this privacy model end-to-end: transaction builders accept and emit Aleo record plaintexts, never plaintext addresses tied to bet amounts.

## Browser vs Node.js bundles

Most exports are isomorphic. The Node.js-only export is `NodeExecutor`, which imports `node:child_process`. If you bundle the full SDK for the browser, your bundler will warn about this — to silence the warning, import only the modules you need:

```ts
// Browser-safe (no node:child_process)
import { createClient, ShieldWalletAdapter } from '@veiled-markets/sdk'

// Node.js only
import { createNodeExecutor } from '@veiled-markets/sdk'
```

A future v0.6.0 will split these into sub-entrypoints (`@veiled-markets/sdk/browser`, `@veiled-markets/sdk/node`) to fully eliminate the warning.

## Changelog

| Version | Changes |
|---|---|
| `0.5.3` | Fix: pass `outcomeLabels` from indexer to enriched markets; parse on-chain struct fields to correct types (BigInt for u128); camelCase + snake_case dual keys |
| `0.5.2` | Fix: struct field parsing with newline separators, snake_case to camelCase conversion |
| `0.5.1` | Fix: parse on-chain mapping struct values to BigInt instead of raw strings |
| `0.5.0` | Initial public release — 6 clients, 191 tests, tri-token support |

## Versioning

The SDK follows [semver](https://semver.org). During the 0.x phase, breaking changes may occur in minor versions. From 1.0.0 onwards, breaking changes will only occur in major versions.

Each release is tagged against a specific contract deployment — see the [Contracts](#contracts) table above for the current target.

## Links

- **Live demo:** https://veiledmarkets.xyz
- **Telegram Bot:** https://t.me/veiledmarkets_bot (SDK integration example)
- **Bot source:** https://github.com/hevDev7/veiled-markets-near/tree/main/bot-test
- **npm:** https://www.npmjs.com/package/@veiled-markets/sdk
- **Project repo:** https://github.com/hevDev7/veiled-markets-near
- **Provable Explorer:** https://testnet.explorer.provable.com
- **Aleo Discord:** https://discord.gg/aleo
- **Bug reports:** [GitHub Issues](https://github.com/hevDev7/veiled-markets-near/issues)

## License

MIT — see [LICENSE](./LICENSE).

---

Built on [Aleo](https://aleo.org) · Privacy-first prediction markets · No KYC, no public bets, no compromise.
