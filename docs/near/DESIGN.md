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

Init: `new(owner, oracle_operator, committee: [AccountId; 5], usdcx_token, usad_token, config: ConfigArgs)`.
`ConfigArgs` holds the Aleo constants in ticks and micro units (defaults = Aleo values; the testnet deploy shortens
the windows so a demo resolves in minutes): `vote_window, dispute_window, winner_claim_priority, disputed_timeout,
vote_bond, min_voters, min_trade, min_liquidity, protocol_fee_bps, creator_fee_bps, lp_fee_bps`.

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
- Committee escalation (governance tier 2): `initiate_escalation, committee_vote_resolve, finalize_committee_vote,
  governance_resolve`. A finalized committee decision applies without `governance_resolve`.
- Views mirror the Aleo mappings: `get_market, get_pool, get_fees, get_tally, get_dispute, get_market_credits,
  get_markets(from, limit), get_governance_values, has_voted(market_id, account), get_height`.

Turbo (port of `veiled_turbo_v9.aleo`, pari-mutuel: winners split the round's pool, so there is no vault): the
operator calls `create_turbo_market, resolve_turbo_market, emergency_cancel_turbo, prune_turbo`; bets and claims are
private via `transact`. Bets are taken for the first four fifths of a round (`betting_deadline` in the view). Views
`get_turbo_market, get_latest_turbo, get_turbo_markets(from, limit), get_turbo_count, get_turbo_exposure`.

Market ids and turbo ids share one counter, so a `/market/:id` route is unambiguous.

## 5. Off-chain services

- Relayer (`backend/src/near-relayer.ts`): `POST /relay {proof, public, ext_data}` submits `transact` from the
  relayer account (300 TGas) and returns `{tx_hash, status, result | error}`. The user's account never signs a
  private action. Testnet fee 0.
- Turbo oracle (`backend/src/near-turbo-oracle.ts`): the Aleo oracle's logic and HTTP endpoints (`/health, /quote,
  /stream, /chain, /chain/symbol`) with NEAR calls. Same trust model as Aleo: the operator account submits Pyth
  Hermes prices (CoinGecko when no `PYTH_API_KEY` is set); the contract checks bounds and the operator identity.
- AI resolver (`backend/src/near-ai-resolver.ts`, optional): for each market whose trading closed and that has no
  vote, it fetches the named resolution source (public http(s) only, every hop's address checked), asks a model in
  NEAR AI Cloud's TEE for the outcome, checks the model TEE's ECDSA signature over `model:sha256(request):
  sha256(response)` against the signers in an attestation fetched with a fresh nonce, and votes when the model's
  confidence is at least 0.8. The vote's evidence is the receipt's URL and SHA-256; the receipts are served at
  `/receipts/<market>.json`. It casts an ordinary bonded vote.
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
