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
  NEAR: 1 micro = 10^18 yoctoNEAR. USDCX/USAD mock tokens: 6 decimals, 1 token unit = 1 micro.
- Token types: 1 = NEAR (the frontend keeps its internal key `ALEO`, displayed as `NEAR`), 2 = USDCX, 3 = USAD.
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
- `ft_on_transfer(sender_id, amount, msg)` from the USDCX/USAD contracts; `msg` = `{"deposit":{"owner_blind","memo"}}`
  or `{"create_market":{...CreateMarketArgs}}`.
- `transact(proof, public, ext_data) -> TransactResult`
  - `proof = {a:[x,y], b:[[x0,x1],[y0,y1]], c:[x,y]}` decimal strings in snarkjs order.
  - `public = {root, nullifier1, nullifier2, change_commitment, kind, asset, sub, out_amount, ext_data_hash}`.
  - `ext_data` JSON: `{action, new_owner_blind, new_memo, change_memo, relayer?, fee}`; `action.type` one of
    `withdraw{recipient}` (kind 1), `buy{market_id, outcome, min_shares_out}` (kind 1), `sell{tokens_desired}` (kind 2),
    `add_liquidity{market_id, min_lp_shares}` (kind 1), `redeem` (kind 2), `refund` (kind 2),
    `withdraw_lp{min_tokens_out}` (kind 3), `turbo_buy{market_id, side}` (kind 1), `turbo_claim` (kind 4).
  - Returns `{change_index, new_index, new_commitment, new_kind, new_asset, new_sub, new_amount}`.
- Views: `get_tree_info() -> {next_index, root, depth}`, `get_leaves(from, limit) -> [{index, commitment, note?, memo}]`,
  `is_spent(nullifier)`, `is_known_root(root)`.

Markets (port of `veiled_markets_v37.aleo` with the working-tree fixes; one contract for all three tokens):
- `create_market(args)` payable (NEAR) or via `ft_transfer_call` (stablecoins). `CreateMarketArgs = {question_hash,
  category, num_outcomes, deadline, resolution_deadline, metadata (JSON text <= 2048 bytes: question, description,
  outcome labels, resolution source, image), lp_owner_blind, lp_memo}`. The creator's LP position is minted as an LP
  note (private), as the Aleo program minted an LPToken record.
- Public resolution calls from NEAR accounts (voters and disputers are public on Aleo too), bonds in NEAR:
  `close_market, vote_outcome (payable bond), finalize_votes, confirm_resolution, dispute_resolution (payable bond),
  cancel_market, claim_voter_bond, claim_dispute_bond, withdraw_creator_fees`.
- Committee escalation (governance tier 2): `initiate_escalation, committee_vote_resolve, finalize_committee_vote,
  governance_resolve`.
- Views mirror the Aleo mappings: `get_market, get_pool, get_fees, get_tally, get_dispute, get_market_credits,
  get_markets(from, limit), get_governance_values, has_voted(market_id, account), get_height`.

Turbo (port of `veiled_turbo_v9.aleo`): operator calls `create_turbo_market, resolve_turbo_market, emergency_cancel,
deposit_vault, withdraw_vault, withdraw_turbo_fees`; bets and claims are private via `transact`. Views
`get_turbo_market, get_turbo_pool, get_turbo_markets(from, limit), get_vault`.

Market ids and turbo ids share one counter, so a `/market/:id` route is unambiguous.

## 5. Off-chain services

- Relayer (`backend/src/near-relayer.ts`): `POST /relay {proof, public, ext_data}` submits `transact` from the
  relayer account (300 TGas) and returns `{tx_hash, status, result | error}`. The user's account never signs a
  private action. Testnet fee 0.
- Turbo oracle (`backend/src/near-turbo-oracle.ts`): the Aleo oracle's logic and HTTP endpoints (`/health, /quote,
  /stream, /chain, /chain/symbol`) with NEAR calls. Same trust model as Aleo: the operator account submits Pyth
  Hermes prices (CoinGecko when no `PYTH_API_KEY` is set); the contract checks bounds and the operator identity.
- Supabase is optional on NEAR: market list and metadata come from the contract.

## 6. Out of scope for the hackathon build

Parlay, community governance proposals, resolver registry, reward epochs and the multisig treasury stay Aleo-only.
Their pages render their existing empty states. A production deployment needs a multi-party phase-2 ceremony for the
circuit key and a relayer fee market.
