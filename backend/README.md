# Backend

Two small services and the operator's scripts for Veiled Markets on NEAR. Both services sign with a key from
`~/.near-credentials/testnet/<account>.json` or from an environment variable, and read `NEAR_RPC_URL` (a
comma-separated list; each call moves to the next endpoint when one fails).

| Service | Start | What it does |
|---|---|---|
| Relayer | `npm run relayer` (port 4100) | Receives a proof and an action from the browser, checks the proof locally, and submits `transact` to the contract. It pays the gas, so the user's account never signs a private action. Key: `RELAYER_PRIVATE_KEY`. |
| Turbo oracle | `npm run turbo-oracle -- --serve --auto-create` (port 4090) | Opens and settles the five-minute BTC, ETH and SOL rounds and serves live prices and an audit log of every price it used. Prices come from Pyth Hermes when `PYTH_API_KEY` is set, otherwise from CoinGecko. Key: `ORACLE_PRIVATE_KEY`. |

`npm test` runs the relayer's request checks and the LP note bookkeeping (10 tests).

## Scripts

Run from this directory with `npx tsx scripts/<name>`.

| Script | Use |
|---|---|
| `quick-market.ts create [minutes]` | Opens a NEAR price question that closes in a few minutes, for a demo of the whole lifecycle. |
| `quick-market.ts open <spec.json> [--near=<n> \| --usdc=<n>]` | Opens a market from a file in `scripts/markets/` (question, rule, source of the result, closing time). |
| `quick-market.ts resolve <id> <outcome>` | Votes, finalizes and confirms a market's result after it closes. |
| `withdraw-lp.ts <id>` | Withdraws the liquidity the operator added to a resolved market. |
| `parlay-legs.ts status \| approve <ids> \| revoke <ids> \| cap <bps>` | Chooses which markets may be parlay legs. |
| `seed-markets.ts` | Opens a starter set of markets on a fresh contract. |
| `testnet-smoke.ts <account> <relayer url>` | Deposits, then withdraws through the relayer, against the live contract. |
| `testnet-parlay-smoke.ts <marketA> <marketB>` | Deposits, then places a private parlay on two markets of the live contract. |

The LP notes of markets opened by these scripts are written to `.seed-lp-notes.json`, which is not committed: it holds
the secrets that withdraw that liquidity.
