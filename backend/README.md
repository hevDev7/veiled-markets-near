# Backend

Three small services and the operator's scripts for Veiled Markets on NEAR. Each service signs with a key from
`~/.near-credentials/testnet/<account>.json` or from an environment variable, and reads `NEAR_RPC_URL` (a
comma-separated list; each call moves to the next endpoint when one fails).

| Service | Start | What it does |
|---|---|---|
| Relayer | `npm run relayer` (port 4100) | Receives a proof and an action from the browser, checks the proof locally, and submits `transact` to the contract. It pays the gas, so the user's account never signs a private action. Key: `RELAYER_PRIVATE_KEY`. |
| Turbo oracle | `npm run turbo-oracle -- --serve --auto-create` (port 4090) | Opens and settles the five-minute BTC, ETH and SOL rounds and serves live prices and an audit log of every price it used. Prices come from Pyth Hermes when `PYTH_API_KEY` is set, otherwise from CoinGecko. Key: `ORACLE_PRIVATE_KEY`. |
| AI resolver | `npm run ai-resolver` (port 4091) | Asks a model in NEAR AI Cloud's TEE which outcome a closed market's source supports, checks the TEE's signature over the exact request and response against a fresh attestation, and casts the first bonded vote when the model is confident, linking a public receipt as the vote's evidence. It casts no vote without `AI_RESOLVER_PUBLIC_URL` (the address its receipts are served from) or with `DRY_RUN=1`. It also answers the create page's source check (below). Keys: `NEARAI_API_KEY`, `AI_RESOLVER_PRIVATE_KEY`. Rules it follows: [`docs/near/RESOLUTION.md`](../docs/near/RESOLUTION.md). |

`npm test` runs the relayer's request checks, the AI resolver's checks, the source reader, catalog and check, the
create page's endpoints and rate limits, the LP note bookkeeping, the spec files and the demo price question (75 tests).
`DRY_RUN=1 npm run ai-resolver -- --once` asks the model about every market waiting for a vote and writes receipts to
`ai-receipts/` without voting.

### The create page's source check

`GET /check-source?url=<source>` on the AI resolver service answers whether the resolver can read a source, with the
same reader it votes with (`src/source-reader.ts`: public addresses only, IPv6 forms of private IPv4 addresses
included; DNS pinned to the vetted address; at most 3 redirects; 10 s a request and 15 s for the whole read, DNS
included; 1 MB). The answer (`src/source-check.ts`) has `ok`, a `problem` when it is not (`not_a_url`,
`private_address`, `fetch_failed`, `http_error`, `too_little_text`, `unexpected_shape`), a `message` to show, and the
first 2,000 characters of the text the resolver would get. Any source needs at least 200 characters of text; Coinbase
candles, Nasdaq daily history and Frankfurter rates (`src/source-catalog.ts`) are checked with a past date and the
shape of the answer instead. Each client gets 30 checks a minute and 2 at a time; a passed answer is reused for 60 s
and a failed one for 5 s; at most 4 checks run at once, with at most 2 DNS lookups pending, so the voting loop keeps
its share of Node's thread pool. `POST /draft` and `POST /review` answer 503 until AI drafting is set up.

`npm run ai-resolver -- --serve-only` serves `/health`, `/receipts` and the check without voting, and needs no
`NEARAI_API_KEY`.

| Variable | Default | Use |
|---|---|---|
| `MARKET_AI_ORIGINS` | `https://veiledmarkets.xyz,http://localhost:3100` | Browser origins the check answers (CORS) |
| `MARKET_AI_CLIENT_PER_HOUR` | `10` | AI drafting and review calls per client per hour |
| `MARKET_AI_DAILY_CAP` | `150` | AI drafting and review calls per UTC day, across all clients |

## Scripts

Run from this directory with `npx tsx scripts/<name>`.

| Script | Use |
|---|---|
| `quick-market.ts create [minutes]` | Opens a NEAR price question for the first five-minute mark at least `minutes` away, for a demo of the whole lifecycle. Its source is CoinGecko's price series around that moment, which the AI resolver can read. |
| `quick-market.ts open <spec.json> [--near=<n> \| --usdc=<n>] [--skip-source-check]` | Opens a Yes/No market from a file in `scripts/markets/` (question, rule, source of the result, closing time). Before it signs anything it runs the create page's source check on the source and stops if the resolver could not read it; a spec whose `outcomes` are not `["Yes","No"]` is refused. |
| `quick-market.ts resolve <id> <outcome> [--evidence=<url>] [--settle]` | Casts the bonded vote after the market closes. The first redeem after the dispute window settles it; `--settle` waits and settles it instead. |
| `withdraw-lp.ts <id>` | Withdraws the liquidity the operator added to a resolved market. |
| `parlay-legs.ts status \| approve <ids> \| revoke <ids> \| cap <bps>` | Chooses which markets may be parlay legs. |
| `seed-markets.ts` | Opens a starter set of markets on a fresh contract. |
| `testnet-smoke.ts <account> <relayer url>` | Deposits, then withdraws through the relayer, against the live contract. |
| `testnet-parlay-smoke.ts <marketA> <marketB>` | Deposits, then places a private parlay on two markets of the live contract. |

The LP notes of markets opened by these scripts are written to `.seed-lp-notes.json`, which is not committed: it holds
the secrets that withdraw that liquidity.
