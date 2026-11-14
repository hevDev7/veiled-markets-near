# Backend

Three small services and the operator's scripts for Veiled Markets on NEAR. Each service signs with a key from
`~/.near-credentials/testnet/<account>.json` or from an environment variable, and reads `NEAR_RPC_URL` (a
comma-separated list; each call moves to the next endpoint when one fails).

| Service | Start | What it does |
|---|---|---|
| Relayer | `npm run relayer` (port 4100) | Receives a proof and an action from the browser, checks the proof locally, and submits `transact` to the contract. It pays the gas, so the user's account never signs a private action. With `RELAYER_META=1` it also submits stablecoin deposits the user signed as NEP-366 delegate actions (`POST /meta`), paying their gas, so an account holding USDC but no NEAR can still deposit. On mainnet, `ONECLICK_ENABLED=1` adds `/oneclick/*`: quotes and status for moving USDC between another chain and Veiled through 1Click. Details: [`docs/near/DESIGN.md`](../docs/near/DESIGN.md) §5. Key: `RELAYER_PRIVATE_KEY`. |
| Turbo oracle | `npm run turbo-oracle -- --serve --auto-create` (port 4090) | Opens and settles the five-minute BTC, ETH and SOL rounds and serves live prices and an audit log of every price it used. Prices come from Pyth Hermes when `PYTH_API_KEY` is set, otherwise from CoinGecko. With `TURBO_PRICES=contract` the contract takes both prices of a round from the oracle contract its owner named (`set_turbo_oracle`, `set_turbo_feed`), and with a Pyth oracle `TURBO_PYTH_PUSH_HERMES` stores a Hermes update on it whenever the stored price is too old to open or settle a round, then reads it back (details in [`docs/near/DESIGN.md`](../docs/near/DESIGN.md)). Key: `ORACLE_PRIVATE_KEY`. |
| AI resolver | `npm run ai-resolver` (port 4091) | Asks a model in NEAR AI Cloud's TEE which outcome a closed market's source supports, checks the TEE's signature over the exact request and response against a fresh attestation, and casts the first bonded vote when the model is confident, linking a public receipt as the vote's evidence. It casts no vote without `AI_RESOLVER_PUBLIC_URL` (the address its receipts are served from) or with `DRY_RUN=1`. Once the contract names it the trading closer, it also ends trading early on the markets the owner opened to it when their source shows the answer. It also answers the create page's source check and, with an Anthropic key, AI drafting and review, keeps the app's market → transaction index (`GET /market-tx`), and with an OutLayer project of the operator's can read sources inside OutLayer's TEE (all below). Keys: `NEARAI_API_KEY`, `AI_RESOLVER_PRIVATE_KEY`, and `MARKET_AI_API_KEY` for drafting. Rules it follows: [`docs/near/RESOLUTION.md`](../docs/near/RESOLUTION.md). |

`npm test` runs the relayer's request checks, the AI resolver's checks (votes and early closes), the source reader,
catalog and check, the create page's endpoints and rate limits, AI drafting and review and their Claude client
(stubbed, no key needed), the turbo keeper's on-chain price pushes, the gasless deposit checks, the 1Click client
(stubbed), the market index (FastNEAR stubbed), the OutLayer client and source reader (OutLayer stubbed), the LP note
bookkeeping, the spec files, the demo price question and the owner scripts' read-back (219 tests).
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
its share of Node's thread pool.

### AI drafting and review

With `MARKET_AI_API_KEY` set (an Anthropic key, in `backend/.env` or the service's environment), the same service asks
Claude (`src/market-ai.ts`, `src/anthropic-model.ts`) for two things; without it both endpoints answer 503 "AI drafting
is not set up".

- `POST /draft` with `{ idea, category? }` (an idea of 10 to 500 characters) answers `{ draft: { question, rules,
  source, category, closes_at, resolution_deadline_at }, source_check, warnings }`. The model gets the current time,
  the categories, the rules style and the source catalog. The server checks the draft (a question ending in "?", rules
  starting `This market will resolve to "Yes" if`, trading closing at least 15 minutes ahead, a resolution deadline at
  least 6 hours after it, at most 2,048 bytes of text, and for a Coinbase candles source a `start` equal to the
  closing minute in Unix seconds with `end` after it) and runs the source check on its source. When either fails, the
  model is asked once more and told why, so one draft is at most two model calls. A source that fails twice comes back
  with `source_check.ok: false`, and the page will not publish it. `warnings` lists what the model assumed and the
  failed check, if any.
- `POST /review` with `{ question, rules, source, closes_at, resolution_deadline_at }` answers `{ scores: { clarity,
  verifiability, time_bounds, source_quality }, critiques, ready }`. The model reads the market and the text the
  resolver would read from the source today (up to 20,000 characters, marked as data, not instructions) and scores
  each from 1 to 10. For a catalog source, which shows nothing before the moment that counts (Coinbase answers HTTP
  400 "Start cannot be in the future", Nasdaq an empty table, Frankfurter an earlier date), it reads the same API for
  a recent past date, as the source check does, and is told so. `ready` is set by the server: every score is at
  least 7.

Each call asks for JSON in a fixed schema (structured outputs) at medium effort, with server-side fallback on, so a
request Claude declines is retried on the model Anthropic recommends; a refusal that remains answers 422, and any other
failure of the model 502. A body the endpoint cannot use answers 400 before it counts against the limits below. Each
model call logs its token use.

`npm run ai-resolver -- --serve-only` serves `/health`, `/receipts`, `/market-tx`, the check and the AI endpoints
without voting, and needs no `NEARAI_API_KEY`. `/health` shows `drafting` (the model in use, or `off`),
`source_reader` (`this server`, the OutLayer project, or what is wrong with its settings) and `market_index`.

| Variable | Default | Use |
|---|---|---|
| `MARKET_AI_ORIGINS` | `https://veiledmarkets.xyz,http://localhost:3100` | Browser origins the check answers (CORS) |
| `MARKET_AI_API_KEY` | (none) | Anthropic API key; turns on `/draft` and `/review` |
| `MARKET_AI_MODEL` | `claude-opus-5-5` | The Claude model for drafting and review |
| `MARKET_AI_CLIENT_PER_HOUR` | `10` | AI drafting and review requests per client per hour |
| `MARKET_AI_DAILY_CAP` | `150` | AI drafting and review requests per UTC day, across all clients |

### Ending trading early

A market asking whether something happens before a date is decided the day it happens, and until its deadline anyone
could bet on the known result. The contract's `close_trading` ends trading at once (the owner on any open market, the
trading closer only on markets the owner opened with `set_early_close`). Once `get_governance` names this service's
account the trading closer, the service reads the source of each open market with `early_close` set, every
`AI_EARLY_CLOSE_MINUTES`, and asks the model in NEAR AI Cloud's TEE whether the outcome is already settled. It calls
`close_trading` only when the model says so with at least `AI_EARLY_CLOSE_CONFIDENCE` and the TEE signature checks,
with the receipt's link and hash as the evidence. It skips a market whose source it cannot read without asking the
model, and a market with five minutes (75 ticks) or less of trading left. Receipts are served at
`/receipts/<id>.early.json` and listed at `/receipts/early`; `/health` shows `early_close` with `permitted`.

| Variable | Default | Use |
|---|---|---|
| `AI_EARLY_CLOSE_MINUTES` | `60` | Minutes between checks of one market; `0` turns early closes off |
| `AI_EARLY_CLOSE_CONFIDENCE` | `0.9` | The model's confidence needed to close trading |
| `AI_EARLY_CLOSE_PER_PASS` | `3` | Markets checked per pass |

### Market links (`GET /market-tx`)

Market pages are addressed by the hash of the transaction that created the market (`/market/<hash>`). The contract
cannot know that hash, so the service builds the market → hash index (`src/market-index.ts`) from FastNEAR's
Transactions API:

- `POST /v0/account` lists the contract's successful transactions (200 a page);
- `POST /v0/transactions` returns their receipts (20 at a time), and each `market_created` event the contract logged
  names a market.

Each poll lists again from 1,000 blocks below the last height, so a transaction that succeeds late is still found. The
index is saved to `MARKET_INDEX_FILE` as it grows. Building it from nothing takes about 280 requests on testnet (5 a
second); after that a poll runs every 15 s.

`GET /market-tx` answers `{contract, byId}`, gzipped when the browser accepts it, with an ETag so an unchanged index
costs a 304. Pages read it at most every 15 s and take its links as suggestions only: a `/market/<hash>` page shows
the market the chain says that transaction created, and a `/market/<id>` page moves to its hash only once the chain
confirms it, so a wrong index entry cannot make one URL show different markets in different browsers. The links a
browser checked on chain (a market it created, a hash it opened) are kept and win over the index; the index's own
are read again on each page load. A page links to `/market/<id>` until a market's hash is known.

| Variable | Default | Use |
|---|---|---|
| `MARKET_INDEX_FILE` | `<AI_RECEIPTS_DIR>/market-index.json` | Where the index is kept: on the service's volume, so a restart does not rebuild it |
| `MARKET_INDEX_API` | `https://tx.test.fastnear.com` for a `.testnet` contract, else `https://tx.main.fastnear.com` | FastNEAR's Transactions API |
| `MARKET_INDEX_SECONDS` | `15` (at least 5) | Seconds between polls; a minute after FastNEAR answers 429 |
| `FASTNEAR_API_KEY` | (none) | Optional key from <https://dashboard.fastnear.com>: FastNEAR rate-limits keyless clients harder |

### Reading sources in OutLayer

On the hosted demo the resolver fetches a market's source on its own server, so a receipt's source rests on the
operator's word. With `OUTLAYER_PROJECT` and `OUTLAYER_PAYMENT_KEY` set, it asks a build published on
[OutLayer](https://outlayer.ai) to read the source inside OutLayer's Intel TDX TEE, and gives the model the text that
build returned (`src/outlayer.ts`). The model call itself stays in NEAR AI Cloud's TEE, with its signature check.

The receipt's `source.outlayer` names the call (`api`, `project`, `version_key` when one is pinned, `call_id`,
`attestation_url`, `compute_cost`, `time_ms`) and keeps its `input` and `output` as OutLayer returned them. A call
that comes back without an https attestation link is refused, and the market is tried again later. OutLayer's
attestation for a call names the build that ran and two SHA-256 hashes: `input_hash`, over the input as OutLayer's
coordinator serialised it (keys in the order sent), and `output_hash`, over the bytes the build wrote. To check a
receipt:

1. Read the market from the contract. Check that `input.url` is its resolution source as `sourceUrl` in
   `src/ai-resolver-core.ts` reads it, and that the other input fields are the limits below.
2. Fetch the call's attestation from OutLayer's own API, not from the receipt's link:
   `https://api.outlayer.ai/attestations/by-call/<call_id>` (`https://testnet-api.outlayer.ai/…` on testnet).
3. Check that `input_hash` and `output_hash` are the SHA-256 of `JSON.stringify(input)` and `JSON.stringify(output)`
   from the receipt: compact JSON, keys in the order the receipt stores them, non-ASCII characters unescaped. The
   build writes its answer in exactly that form (**Output** below).
4. Check that the build it names is the published source-reader build, and the version the receipt names, if any.
5. Check that `output.text` is the source text in `request_body`, the request NEAR AI's TEE signed.

What these checks leave open:

- The resolver does not run them itself. OutLayer's API reference does not give the attestation's document format,
  nor how a reader ties one to the TDX-attested worker keys registered on chain (OutLayer's `WORKER_ATTESTATION.md`
  covers how workers are admitted). Until OutLayer documents that, step 2 rests on OutLayer's API.
- The operator still decides when a source is read and which call a receipt names: an operator who made several
  calls for one market could publish the one it liked. `fetched_at` is this server's clock, and a page can change
  between reads.

The build is the operator's to write, from this contract:

- **Input** (JSON on stdin): `{url, max_bytes, max_chars, max_redirects, timeout_ms, total_ms, user_agent}`. The
  resolver sends 1,000,000, 20,000, 3, 10,000, 15,000 and `VeiledMarkets-AIResolver/1.0`.
- **Fetching**: fetch `url` with that user agent and follow at most `max_redirects` redirects. Every address it
  fetches must pass `sourceUrl`'s rule in `src/ai-resolver-core.ts`: http or https on the default port, no user
  info, no localhost, `.local` or `.internal` name, no private IP literal. Stop a request after `timeout_ms` and the
  whole read after `total_ms`, and keep at most `max_bytes` of the body.
- **Output** (JSON on stdout: compact, keys in this order, non-ASCII characters unescaped, no trailing newline, so
  that `JSON.stringify` of the answer gives back the bytes written): `{"bytes":…,"final_url":…,"sha256":…,"status":…,"text":…}`.
  - `bytes`: the body's size.
  - `final_url`: the address after redirects.
  - `sha256`: the body's SHA-256 in lowercase hex.
  - `status`: the HTTP status.
  - `text`: the body's text by `htmlToText`'s rules in `src/ai-resolver-core.ts` (drop script, style, noscript, svg
    and template elements and comments; replace other tags with spaces; decode `&nbsp; &amp; &lt; &gt; &quot; &#39;
    &apos;`; collapse whitespace; trim), cut to `max_chars` UTF-16 code units.

  `{"error":"…"}` when the source cannot be read.
- **Target**: `wasm32-wasip2`. HTTP needs WASI preview 2; OutLayer's `ai-example` repository shows an HTTP client.

The resolver refuses an answer outside the contract and tries the market again on a later pass. That covers text over
20,000 characters, a hash that is not SHA-256 hex, a size over 1 MB, a status outside 100–599, or a final address
that may not be read.

The operator's steps (OutLayer CLI: `cargo install --git https://github.com/out-layer/outlayer-cli`):

1. `outlayer login testnet` (or `outlayer login` for mainnet) with the account that will own the project.
2. `outlayer create veiled-source-reader`, then write the build above in it.
3. Push it to a public git repository and run `outlayer deploy veiled-source-reader`. OutLayer builds it from the
   repository, so anyone can read the source of the build an attestation names.
4. `outlayer keys create` prints the payment key (`<owner>:<nonce>:<secret>`, shown once). Fund it: on mainnet,
   `outlayer keys topup <nonce> <NEAR>`.
5. Try it: `outlayer run <owner>/veiled-source-reader '{"url":"https://example.com/","max_bytes":1000000,…}'`.
6. Set `OUTLAYER_PROJECT` and `OUTLAYER_PAYMENT_KEY` in the service's environment, then restart it. To pin the
   build, also set `OUTLAYER_VERSION` (`outlayer versions` lists the keys). Check that `/health` shows
   `source_reader: "OutLayer <owner>/veiled-source-reader"`.

Every call is async, and the client polls it every 2 s for up to 2 minutes. A 503 is sent again after its
`Retry-After` (at most 60 s, at most 3 times). Any other refusal, or a request that got no answer, ends the call:
`/call` takes no idempotency key, so a resend could run and charge it twice. The market is tried again on a later
pass (`AI_RETRY_ABSTAINED_MINUTES`).

Once either variable is set, a problem with them stops the resolver from reading sources: each market records the
problem and `/health` names it. It never falls back to reading sources itself. The create page's `/check-source` and
`/review` always read on this server.

| Variable | Default | Use |
|---|---|---|
| `OUTLAYER_PROJECT` | (none) | `<owner account>/<project name>` of the source-reader build |
| `OUTLAYER_PAYMENT_KEY` | (none) | `<owner>:<nonce>:<secret>`, a funded OutLayer payment key |
| `OUTLAYER_API` | `https://testnet-api.outlayer.ai` for a `.testnet` contract, else `https://api.outlayer.ai` | OutLayer's API, on the payment key's network |
| `OUTLAYER_VERSION` | the project's active version | A published version to run |
| `OUTLAYER_COMPUTE_LIMIT` | (none) | The most one call may spend on compute, in USD micro-units |

## Scripts

Run from this directory with `npx tsx scripts/<name>`.

| Script | Use |
|---|---|
| `quick-market.ts create [minutes]` | Opens a NEAR price question for the first five-minute mark at least `minutes` away, for a demo of the whole lifecycle. Its source is CoinGecko's price series around that moment, which the AI resolver can read. |
| `quick-market.ts open <spec.json> [--near=<n> \| --usdc=<n>] [--skip-source-check]` | Opens a Yes/No market from a file in `scripts/markets/` (question, rule, source of the result, closing time). Before it signs anything it runs the create page's source check on the source and stops if the resolver could not read it; a spec whose `outcomes` are not `["Yes","No"]` is refused. |
| `quick-market.ts resolve <id> <outcome> [--evidence=<url>] [--settle]` | Casts the bonded vote after the market closes. The first redeem after the dispute window settles it; `--settle` waits and settles it instead. |
| `withdraw-lp.ts <id>` | Withdraws the liquidity the operator added to a resolved market. |
| `parlay-legs.ts status \| approve <ids> \| revoke <ids> \| cap <bps>` | Chooses which markets may be parlay legs, and the share of its thinnest leg's pool depth one ticket may pay. Open tickets keep their legs. |
| `early-close.ts status \| closer <account\|none> \| open <ids> \| withdraw <ids> \| close <id> [--evidence=<url>]` | Names the trading closer (the AI resolver), opens markets to an early close by it or takes that back, and ends a market's trading now as the owner. |
| `seed-markets.ts` | Opens a starter set of markets on a fresh contract. |
| `testnet-smoke.ts <account> <relayer url>` | Deposits, then withdraws through the relayer, against the live contract. |
| `testnet-parlay-smoke.ts <marketA> <marketB>` | Deposits, then places a private parlay on two markets of the live contract. |

The LP notes of markets opened by these scripts are written to `.seed-lp-notes.json`, which is not committed: it holds
the secrets that withdraw that liquidity.
