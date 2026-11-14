# Veiled Markets on NEAR: design

Status: design for the NEAR HACKATHON 2026 port (deadline 2026-11-14T23:59:00Z). Pre-hackathon baseline is git tag
`pre-hackathon`; all NEAR work is on branch `near-hackathon` (rule Q-003). The Aleo product exists already (Q-002), and
only the NEAR integration below is new.

## 1. Goal and constraints

- Keep every page of the existing React/Vite frontend. Only the data layer (wallet, chain reads, transactions,
  private records) is replaced. Unavoidable UI differences: wallet picker (NEAR wallets), token label NEAR, explorer
  links, Aleo-only debug widgets hidden.
- Bets stay private: no transaction that places a bet, sells, redeems or claims carries the bettor's NEAR account.
  As on Aleo, market id, outcome and amounts of a trade are public (the AMM pool is public state). What is hidden is
  which account holds which position.
- Testnet only (Q-010). One contract account holds the note pool, markets, resolution, committee escalation and turbo
  markets, so every private action is a single synchronous call (no cross-contract atomicity problems).

## 2. Units and time

- Amounts: 6-decimal micro units for every token, identical to the Aleo microcredit math, so the frontend's AMM math
  (`frontend/src/lib/amm.ts`, `sdk/src/contract-math.ts`) is reused unchanged.
  NEAR: 1 micro = 10^18 yoctoNEAR. USDC (and the retired mock token): 6 decimals, 1 token unit = 1 micro.
- Token types: 1 = NEAR, 2 = the early mock USDCX (retired: it still holds old balances, so it was not re-pointed),
  3 = Circle's testnet USDC `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`, set on the live
  contract with the owner-only `set_token_account(3, …)`. The frontend's internal key for slot 3 is `USDCX` (shown as
  USDC) and for slot 2 `USAD`; see `TOKEN` in `frontend/src/lib/near/config.ts`.
- Height: virtual height `h = floor(block_timestamp_ms / 4000)` (one tick per 4 s, the Aleo testnet block time the
  frontend already assumes). All deadlines and windows are in ticks. View `get_height()`.

## 3. Private notes (the "veil")

A note is a hidden UTXO in a depth-20 Poseidon Merkle tree (circomlib Poseidon parameters on BN254):

```
pk         = Poseidon(sk)
ownerBlind = Poseidon(pk, blinding)
commitment = Poseidon(kind, asset, sub, amount, ownerBlind)
nullifier  = Poseidon(sk, commitment)
```

| kind | meaning | asset | sub | amount |
|---|---|---|---|---|
| 1 | private balance | token type 1/2/3 | 0 | micro units |
| 2 | outcome shares | market id | outcome 1..4 | shares |
| 3 | LP position | market id | 0 | LP shares |
| 4 | turbo position | turbo market id | side 1 UP / 2 DOWN | net stake |

Circuit `near/circuits/spend.circom` (Groth16, PSE perpetual powers of tau 2^15): spends two notes of the same
(kind, asset, sub) (the second may be a zero-amount dummy, whose Merkle check is skipped), releases `outAmount` to the
contract and creates one change note for the same owner. Public signals, in order:
`root, nullifier1, nullifier2, changeCommitment, kind, asset, sub, outAmount, extDataHash`.

`extDataHash = sha256(ext_data UTF-8 bytes)` read big-endian with the top 3 bits cleared. `ext_data` is the exact JSON
text the relayer forwards; the contract hashes the raw string and then parses it, so the relayer cannot change the
action, recipient, fee or the owner of the note the contract mints.

The tree inserts leaves in pairs (change note, minted note); a deposit inserts (note, 0). Zero leaf = 0,
`zeros[i+1] = Poseidon(zeros[i], zeros[i])`. The contract keeps the last 32 roots.

Note discovery: every leaf stores its commitment, the public note fields when the contract minted it, and an opaque
memo. Memos are AES-GCM ciphertexts made by the frontend with a key derived from the note secret key; a wallet finds
its notes by trying to decrypt memos. The note secret key is derived from a NEP-413 `signMessage` signature, so the
same wallet recovers its notes on any device. A wallet that declines to sign gets a random key kept in that browser's
storage instead; its notes are then spendable only from that browser.

## 4. Contract API (account `veiled` on testnet; JSON args, numbers > 2^53 as strings)

Init: `new(owner, oracle_operator, committee, usdcx_token, usad_token, config: ConfigArgs)`. The committee has 1 to 15
members with no duplicates, and `committee_quorum` must be more than half of them and at most all.
`ConfigArgs` holds the Aleo constants in ticks and micro units (defaults = Aleo values; the testnet deploy shortens
the windows so a demo resolves in minutes): `vote_window, dispute_window, winner_claim_priority, disputed_timeout,
vote_bond, min_voters, min_trade, min_liquidity, protocol_fee_bps, creator_fee_bps, lp_fee_bps`.

Governance (`src/governance.rs`; a Sputnik DAO account can hold the owner role or sit on the committee):
- `propose_owner(new_owner: Option<AccountId>)` by the owner (`None` withdraws the proposal), then `accept_owner()` by
  the proposed account. Two steps, so a typo or an account that cannot act never gets the contract.
- `set_oracle_operator(oracle_operator)` and `set_committee(members, quorum)` by the owner, with the init rules
  above. A committee decision counts only the votes of accounts on the committee at the time it is finalized.
- `upgrade()` by the owner takes the new wasm as the raw call input, not JSON (Sputnik's `UpgradeRemote` proposal
  sends a stored blob that way). One receipt deploys it and calls the new code's `migrate`, so code that has no
  `migrate`, or whose `migrate` fails, is rolled back with the deploy. Every later build keeps a `migrate`
  (`#[private] #[init(ignore_state)]`; this one only reads the state back).
- `set_trading_closer(trading_closer: Option<AccountId>)` by the owner names the account (the AI resolver) that may
  call `close_trading` on the markets the owner opened to it (Markets, below); `None` removes it (raw key `tc`).
- View `get_governance() -> {owner, pending_owner, oracle_operator, committee, committee_quorum, trading_closer}`.
  Events (NEP-297, standard `veiled`): `owner_proposed, owner_changed, oracle_operator_set, trading_closer_set,
  committee_set, contract_migrated`.
- The new state lives under raw storage keys, so builds that predate it upgrade by a plain deploy. Their first move
  to this build has to be one, since the code on chain has no `upgrade` yet. A DAO owner only governs the code once
  the contract account no longer has a full-access key.

Note pool:
- `deposit_near(owner_blind, memo)` payable; attached deposit must be a positive multiple of 10^18 yocto.
- `ft_on_transfer(sender_id, amount, msg)` from the slot 2/3 token contracts; `msg` = `{"deposit":{"owner_blind","memo"}}`,
  `{"create_market":{...CreateMarketArgs}}` or `{"fund_parlay_pool":{}}`.
- `transact(proof, public, ext_data) -> TransactResult`
  - `proof = {a:[x,y], b:[[x0,x1],[y0,y1]], c:[x,y]}` decimal strings in snarkjs order.
  - `public = {root, nullifier1, nullifier2, change_commitment, kind, asset, sub, out_amount, ext_data_hash}`.
  - `ext_data` JSON: `{action, new_owner_blind, new_memo, change_memo, relayer?, fee}`; `action.type` one of
    `withdraw{recipient}` (kind 1), `buy{market_id, outcome, min_shares_out}` (kind 1), `sell{tokens_desired}` (kind 2),
    `add_liquidity{market_id, min_lp_shares}` (kind 1), `redeem` (kind 2), `refund` (kind 2),
    `withdraw_lp{min_tokens_out}` (kind 3), `turbo_buy{market_id, side}` (kind 1), `turbo_claim` (kind 4).
  - `sell` pays for every share offered: `tokens_desired` is the least the seller accepts and the pool releases as
    much as the shares cover (the Aleo program released exactly `tokens_desired` and burned the rest). `refund`
    returns, outcome by outcome, the collateral paid into that outcome (`get_market` → `outcome_collateral`), so
    cheap shares of one outcome cannot draw on another outcome's collateral.
  - Leaf memos are at most 400 bytes; every reserve of a pool keeps at least one unit.
  - Returns `{change_index, new_index, new_commitment, new_kind, new_asset, new_sub, new_amount}`.
- Views: `get_tree_info() -> {next_index, root, depth}`, `get_leaves(from, limit) -> [{index, commitment, note?, memo}]`,
  `is_spent(nullifier)`, `is_known_root(root)`.

Markets (port of `veiled_markets_v37.aleo` with the working-tree fixes; one contract for all three tokens):
- `create_market(args)` payable (NEAR) or via `ft_transfer_call` (stablecoins). `CreateMarketArgs = {question_hash,
  category, num_outcomes, deadline, resolution_deadline, metadata (JSON text <= 2048 bytes: question, description,
  outcome labels, resolution source, image), lp_owner_blind, lp_memo}`. The creator's LP position is minted as an LP
  note (private), as the Aleo program minted an LPToken record. `resolution_deadline` must leave two vote windows
  and one dispute window after `deadline`.
- Public resolution calls from NEAR accounts (voters and disputers are public on Aleo too), bonds in NEAR:
  `close_market, vote_outcome(market_id, outcome, evidence?) (payable bond), dispute_resolution (payable bond),
  cancel_market, claim_voter_bond, claim_dispute_bond, withdraw_creator_fees`. A vote window that ends short of the
  quorum reopens with the next vote, and a market with a voted outcome is confirmed or disputed, never cancelled.
  The owner sets the windows, bond and quorums with `set_resolution_config`; total fees are capped at 10%.
- Settlement on use (no keeper). `MarketState::advance(height)` moves a market through every stage its clock has
  reached: count a vote whose window closed with the quorum, confirm a result whose dispute window passed, apply a
  finalized committee decision, cancel a dispute past `disputed_timeout` or a market past its resolution deadline
  with no vote counted. Views (`get_market`, `get_markets`) return the advanced copy; every call that touches a market
  (redeem, refund, LP exit, parlay settlement and claims, bond and fee claims, disputes, committee calls,
  `settle_market`) persists it first. The dispute deadline is fixed when the vote window opens (one dispute window
  after it), so a late call cannot stretch it. `finalize_votes`, `confirm_resolution` and `governance_resolve` remain
  as optional single steps.
- Resolver reward. The first voter of each outcome is recorded (raw key `fv`). The call that resolves a market pays
  the first voter of the winning outcome (or, if nobody voted for it, the disputer who proposed it) their bond plus
  `resolver_reward_bps` of the market's protocol fees from the treasury (default 5000; owner:
  `set_resolver_reward_bps`), and logs `resolver_paid`. `vote_outcome` stores an optional evidence link of at most
  300 bytes (`get_vote_evidence`, event `vote_evidence`). The new state lives under raw storage keys, so the upgrade
  needs no migration.
- Ending trading early. A market asking whether something happens before a date is decided the day it happens, and
  until its deadline anyone could buy the known result. `close_trading(market_id, evidence?)` sets the deadline to the
  tick before the call and the status to CLOSED, as a passed deadline would, so voting starts at once; the resolution
  deadline is unchanged, a deadline never moves later, and nothing reopens trading. The owner may close any open
  market; the trading closer only a market the owner opened with `set_early_close(market_id, allowed)` (raw key
  `ec` followed by the id, view field `early_close`), since anyone can create a market that names a page they
  control. A committee member alone may not. It works while paused. `evidence` (at most 300 bytes) is only logged, in the event
  `trading_closed {market_id, by, previous_deadline, deadline, evidence}`; `set_early_close` logs `early_close_set`.
- Committee escalation (governance tier 2): `initiate_escalation, committee_vote_resolve, finalize_committee_vote,
  governance_resolve`. A finalized committee decision applies without `governance_resolve`.
- Views mirror the Aleo mappings: `get_market, get_pool, get_fees, get_tally, get_dispute, get_market_credits,
  get_markets(from, limit), get_governance_values, has_voted(market_id, account), get_height`.

Turbo (port of `veiled_turbo_v9.aleo`, pari-mutuel: winners split the round's pool, so there is no vault): the
operator calls `create_turbo_market, resolve_turbo_market, emergency_cancel_turbo, prune_turbo`; bets and claims are
private via `transact`. Bets are taken for the first four fifths of a round (`betting_deadline` in the view). Views
`get_turbo_market, get_latest_turbo, get_turbo_markets(from, limit), get_turbo_count, get_turbo_exposure`.

Turbo prices from an oracle contract (`src/turbo_oracle.rs`), instead of the operator:
- The owner names a Pyth-compatible contract and a close window: `set_turbo_oracle(oracle, close_window_secs)`
  (10 to 300 s; 20 s advised, see Limits). It then sets a feed per symbol: `set_turbo_feed(symbol_id, feed_id)`
  (64 hex digits). Pyth's NEAR receiver (`pyth-oracle.near`, `pyth-oracle.testnet`) and OutLayer's
  `price-oracle.near` serve the same views. Testnet Pyth knows only the beta feed ids: BTC/USD is `f9c0172b…` there,
  not mainnet's `e62df6c8…`. A feed can be replaced but not removed. From then on `create_turbo_market` and
  `resolve_turbo_market` refuse that symbol (`ERR_ORACLE_FEED`).
- `open_turbo_round(symbol_id, deadline)` by the operator: the contract asks the oracle for
  `get_price_no_older_than(feed, 60)`, and the price becomes the baseline through the same checks as before. The
  transaction returns the round id.
- `settle_turbo_round(market_id)` by anyone from the deadline height until the close window ends in block time
  (`ERR_RESOLUTION_WINDOW` after that). The contract reads `get_price_unsafe(feed)` and settles only with a price
  published from the start of the deadline tick (unix second `deadline × 4`) to the end of the close window. A
  price from earlier fails with `ERR_PRICE_TOO_EARLY` and the call can be repeated inside the window; a later one
  fails with `ERR_PRICE_TOO_LATE`. The confidence,
  maximum move, tie (DOWN wins) and empty-side (CANCELLED) rules stay the same. A round that nobody settles inside
  its window is refunded through `emergency_cancel_turbo` after its resolution deadline.
- Prices convert as `price × 10^(expo + 6)` to micro-USD; only positive prices are accepted. View
  `get_turbo_oracle() -> {oracle, close_window_secs, feeds: [{symbol_id, feed_id}]}`.
- Limits. Pyth on NEAR keeps only the latest price, and anyone can store any verified update newer than it,
  however old. Nobody else pushes BTC there: on 2026-11-14 the stored price was 80 days old on mainnet and months
  old on testnet. So the window bounds two things. It must outlast the keeper's push and read; shorter, a losing
  bettor stores a price published after the window first and forces a refund. Hence the 10 s floor; 20 s is
  advised. And since a round settles only while its window is open in block time, nobody can come back later and
  push the window's most convenient price. Whoever settles first may still choose among the prices published so
  far, which a prompt keeper keeps to a few seconds.
  OutLayer's `price-oracle.near` signs its prices in its TEE, but anyone can trigger a push (at most every 20 s per
  asset), so a settler can pick the timing, though not the price; its window must hold one update. It is not
  usable as configured. On 2026-11-14 its Pyth-compatible views knew neither the Pyth BTC nor the NEAR feed id. Its
  docs show `price` as a JSON number where Pyth sends a string, and the callback accepts only strings. Its views
  must also fit the 10 TGas the contract gives the oracle call. Check all three before pointing `set_turbo_oracle`
  at it.

Market ids and turbo ids share one counter, so a `/market/:id` route is unambiguous.

## 5. Off-chain services

- Relayer (`backend/src/near-relayer.ts`): `POST /relay {proof, public, ext_data}` submits `transact` from the
  relayer account (300 TGas) and returns `{tx_hash, status, result | error}`. The user's account never signs a
  private action. Testnet fee 0.
  - Gasless stablecoin deposits (`POST /meta {signed_delegate}`; off unless `RELAYER_META=1`): the wallet signs the
    deposit's `ft_transfer_call` as a NEP-366 delegate action (NEAR Connect `signDelegateActions`), and the relayer
    submits it, paying the gas and the 1 yocto (about 0.0095 NEAR per deposit on the sandbox). It accepts exactly
    that action (`backend/src/meta-tx.ts`):
    - a token the contract lists, called with the Veiled contract as receiver;
    - a `{"deposit":{owner_blind, memo}}` message, where owner_blind is a non-zero field element;
    - 1 yocto and 100 to 300 TGas;
    - a valid ed25519 signature by a full-access key of the sender, with an unused nonce, on an action that has not
      expired;
    - a sender that holds the amount.

    It relays at most `RELAYER_META_PER_SENDER` (3) deposits per sender per minute. The app uses it only when the
    wallet offers it and `/health` reports `meta: true`; otherwise the user signs and pays as before. A refused
    delegate action is reported, never re-sent as a signed call. NEAR deposits attach NEAR, so the user always
    signs them.
  - Cross-chain USDC through 1Click (`/oneclick/*`; mainnet only, off unless `ONECLICK_ENABLED=1`; source
    `backend/src/oneclick.ts`).
    - Bring-in: 1Click delivers USDC from another chain to the user's own NEAR account, and a deposit then moves it
      into the pool. It does not use `customRecipientMsg`: a deposit the contract refuses would go back to NEAR
      Intents, not to the user.
    - Take-out: the quote names a 1Click deposit address on NEAR, and a private withdraw pays it. A refund comes back
      to the user's NEAR account as public USDC.
    - Terms: USDC only, EXACT_INPUT, 0.5% slippage. The partner key (`ONECLICK_API_KEY`) stays on the server.
    - Every signed quote is appended to `ONECLICK_QUOTE_LOG` before it is handed out.
    - The app uses a quote only when 1Click's ed25519 signature over it verifies (`VITE_ONECLICK_SIGNER`, 1Click's
      published key by default) and its signed fields are what the user asked for: assets, amount, recipient,
      refund address, exact input, at most 0.5% slippage, no custom message. A real quote must promise at least the
      previewed minimum less 0.5%. So a relayer cannot swap in another deposit address or recipient.
    - A real (not dry) quote registers the NEAR accounts it needs on USDC (`storage_deposit`, registration only),
      within `ONECLICK_REGISTER_PER_HOUR` (30).
    - The app shows it only on a mainnet build with `VITE_ONECLICK=1`.
- Turbo oracle (`backend/src/near-turbo-oracle.ts`): the Aleo oracle's logic and HTTP endpoints (`/health, /quote,
  /stream, /chain, /chain/symbol`) with NEAR calls. Same trust model as Aleo: the operator account submits Pyth
  Hermes prices (CoinGecko when no `PYTH_API_KEY` is set); the contract checks bounds and the operator identity.
  With `TURBO_PRICES=contract` it opens and settles rounds through `open_turbo_round` and `settle_turbo_round`, so
  the contract takes both prices from its oracle and the service's own quotes only drive the charts. Before an open
  it checks, with free views, that the contract is not paused and names it the oracle operator. It retries a settle
  that comes too early until the close window ends; after that it leaves the round to the stale sweep
  (`emergency_cancel_turbo`) and opens the next one.
  With Pyth as the oracle, `TURBO_PYTH_PUSH_HERMES` (testnet: `https://hermes-beta.pyth.network`, which needs
  `PYTH_API_KEY`) makes it store Hermes updates on the Pyth contract (`update_price_feeds`, fee from
  `get_update_fee_estimate`), but only when the stored price is of no use:
  - before an open, when that price is more than 10 s old;
  - before a settle, when it is older than the deadline. It then stores the first update of the deadline second
    (`/v2/updates/price/{deadline × 4}`), the same one on every attempt.

  `update_price_feeds` returns before Pyth verifies the update, so the keeper reads the stored price back. A push
  that stored nothing pauses that feed's pushes (10 s, doubling up to 10 min).
- AI resolver (`backend/src/near-ai-resolver.ts`, optional): for each market whose trading closed and that has no
  vote, it fetches the named resolution source (public http(s) only, every hop's address checked), asks a model in
  NEAR AI Cloud's TEE for the outcome, checks the model TEE's ECDSA signature over `model:sha256(request):
  sha256(response)` against the signers in an attestation fetched with a fresh nonce, and votes when the model's
  confidence is at least 0.8. The vote's evidence is the receipt's URL and SHA-256; the receipts are served at
  `/receipts/<market>.json`. It casts an ordinary bonded vote, and asks again every `AI_RETRY_ABSTAINED_MINUTES` (60)
  about a market it abstained on.
  - Early closes: once `get_governance` names its account the trading closer, it reads, every
    `AI_EARLY_CLOSE_MINUTES` (60), the source of each open market with `early_close` set and more than 75 ticks of
    trading left (at most `AI_EARLY_CLOSE_PER_PASS`, 3, a pass), and asks the model in the same TEE whether the
    outcome is already settled. With a settled answer naming an outcome, a confidence of at least
    `AI_EARLY_CLOSE_CONFIDENCE` (0.9) and a checked signature, it calls `close_trading` with the receipt's URL and
    SHA-256 as the evidence. A source it cannot read is skipped without asking the model. Receipts:
    `/receipts/<market>.early.json`, listed at `/receipts/early`.
  - With `OUTLAYER_PROJECT` and `OUTLAYER_PAYMENT_KEY` set, the source is read inside OutLayer's TEE by the operator's
    published source-reader build instead (`backend/src/outlayer.ts`; off on the hosted demo). The receipt names the
    call and its attestation and keeps the call's input and output, whose SHA-256 the attestation holds; the model is
    given the text that build returned, and a call without an attestation is refused. Once either variable is set, a
    problem with them stops voting instead of falling back to reading on the server.
  - The same service keeps the market → creating-transaction index (`backend/src/market-index.ts`) from FastNEAR's
    Transactions API and serves it at `GET /market-tx`, so market pages link to `/market/<tx hash>` without every
    browser paging an explorer API. The browser takes those links as suggestions: a `/market/<hash>` page shows the
    market the chain says that transaction created, and a `/market/<id>` page moves to its hash only once the chain
    confirms it (`frontend/src/lib/near/market-tx.ts`).
- Supabase is optional on NEAR: market list and metadata come from the contract.

## 6. Out of scope for the hackathon build

Community governance proposals, resolver registry and staking, reward epochs and the multisig treasury stay
Aleo-only (the per-market resolver reward above is NEAR's own).
Parlays were ported later (`near/contract/contracts/veiled/src/parlay.rs`, note kind 5 = parlay ticket; see the
Parlays section of the in-app Docs page). Legs are markets the owner approved (`set_parlay_leg`), and a ticket pays
at most a set share of its thinnest leg's pool depth (`set_parlay_leg_cap`, 1% by default), because leg odds are
read from the pools.
Their pages render their existing empty states. A production deployment needs a multi-party phase-2 ceremony for the
circuit key and a relayer fee market.
