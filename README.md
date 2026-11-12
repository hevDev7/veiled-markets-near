# Veiled Markets on NEAR

<div align="center">

<img src="./logo-veiled-markets.png" alt="Veiled Markets logo" width="160"/>

### Predict freely. Bet privately.

Private prediction markets and 5-minute turbo markets on NEAR testnet.

</div>

- **Event:** NEAR HACKATHON 2026
- **Network:** NEAR testnet. Contract [`v1.veiled-markets.testnet`](https://testnet.nearblocks.io/address/v1.veiled-markets.testnet)
- **Demo:** run it locally (see [Run it](#run-it)). Video: TODO, the X post tagging @NEARProtocol and #NEARHackathon goes here.
- **Design:** [docs/near/DESIGN.md](docs/near/DESIGN.md) · **License:** [MIT](LICENSE)
- **Sister project:** Verdict (see [below](#sister-project-verdict))

## Built before the hackathon, and what is new

Veiled Markets already exists as a product on **Aleo**. It was built before this hackathon. Its original README is
kept at [docs/README-aleo.md](docs/README-aleo.md).

For the hackathon we ported it to NEAR. The pages and components stay the same. NEAR now supplies the data, the
wallet and the private trading that Aleo supplied before.

| | Where |
|---|---|
| **New: zero-knowledge circuit** (Groth16 note pool) | `near/circuits/` |
| **New: NEAR smart contract** (note pool, markets, AMM, resolution, turbo) | `near/contract/` |
| **New: relayer and turbo oracle** | `backend/src/near-relayer.ts`, `backend/src/near-turbo-oracle.ts` |
| **New: NEAR data layer** (wallet, chain reads, prover, notes) | `frontend/src/lib/near/` |
| **New: private balance panel** and NEAR wording in the UI | `frontend/src/components/PrivateBalancePanel.tsx` and small edits |
| Pre-existing: React pages and components, AMM math, Aleo programs, SDK | everything else |

The work is separated in git: tag `pre-hackathon` is the Aleo product before the hackathon, and tag
`hackathon-submission` is this submission. The full diff:
[compare pre-hackathon...hackathon-submission](https://github.com/hevDev7/veiled-markets-near/compare/pre-hackathon...hackathon-submission)
(locally: `git diff pre-hackathon hackathon-submission`).

## How bets stay private

Your private balance and your positions are **notes**: hidden entries in a Merkle tree inside the contract. Only
your browser can read them.

1. **Deposit.** You move NEAR (or USDC) from your wallet into your private balance. This step is public.
2. **Trade.** Your browser builds a zero-knowledge proof that you own enough notes. A **relayer** submits the proof.
   The trade is not signed by your account, so nobody can see which account bought which position.
3. **Withdraw.** You move funds back to any NEAR account. This step is public.

| Public on NEAR | Private |
|---|---|
| Deposits and withdrawals (account and amount) | Which account holds which position |
| Market prices and pool sizes (the AMM is public, as on Aleo) | Your balance inside the pool |
| Each trade's market, outcome and amount | Who placed each trade |
| Resolution votes and bonds | Your trading history |

Tip: deposit before you trade. If your private balance is too small, the app tops it up from your wallet in the same
moment as the trade, and that timing links the trade to you.

Your note keys come from one wallet signature (NEP-413 `signMessage`), so the same wallet finds its notes again on any
device. If the wallet declines to sign, the app keeps a random key in this browser instead, and the notes it owns can
only be spent from this browser.

## Architecture

```
Browser (React, same pages as the Aleo app)
  └─ frontend/src/lib/near/
       ├─ wallet:   NEAR Wallet Selector (Meteor, MyNearWallet)
       ├─ reads:    contract views, served to the pages in the shape they already expect
       ├─ notes:    scan and decrypt your notes, build the Merkle path
       └─ prover:   snarkjs Groth16 proof in a web worker
            │ proof + action
            ▼
Relayer (backend/src/near-relayer.ts) ── transact ──▶ Contract v1.veiled-markets.testnet
                                                        ├─ note pool (depth-20 Poseidon tree, nullifiers)
Turbo oracle (backend/src/near-turbo-oracle.ts)          ├─ markets: FPMM AMM, LP, fees
  opens and resolves 5-minute BTC/ETH/SOL rounds  ──▶   ├─ resolution: votes, disputes, committee
                                                        └─ turbo rounds and vault
```

One contract holds everything, so each private action is a single call with no cross-contract steps.

### Deployed on NEAR testnet

| Account | Role |
|---|---|
| `v1.veiled-markets.testnet` | The contract |
| `veiled-relayer.testnet` | Submits private trades (fee 0 on testnet) |
| `veiled-oracle.testnet` | Opens and resolves turbo rounds |
| `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` | Circle's official testnet USDC (token slot 3). Get it at [faucet.circle.com](https://faucet.circle.com), choosing NEAR Testnet |

Testnet settings: the vote and dispute windows are 5 minutes each, so a demo market resolves quickly. The vote bond
is 0.1 NEAR.

## Run it

Requirements: Node.js 20 or newer, and a NEAR testnet account in Meteor Wallet or MyNearWallet.

```bash
# 1. Relayer (port 4100). Key: RELAYER_PRIVATE_KEY or ~/.near-credentials/testnet/veiled-relayer.testnet.json
cd backend && npm install
npx tsx src/near-relayer.ts

# 2. Turbo oracle (port 4090). Key: ORACLE_PRIVATE_KEY or ~/.near-credentials/testnet/veiled-oracle.testnet.json
#    Prices come from Pyth Hermes when backend/.env has PYTH_API_KEY=<key from app.pyth.com>, otherwise CoinGecko.
npx tsx src/near-turbo-oracle.ts --serve --auto-create

# 3. Frontend (http://localhost:3100)
cd ../frontend && npm install
cp .env.example .env.local   # the NEAR section at the top has working testnet defaults
npm run dev
```

The frontend works against the deployed contract without steps 1 and 2. You need the relayer for private trades and
the oracle for turbo rounds.

To build and deploy your own contract: build the wasm, then run `near/scripts/deploy-testnet.sh v2`. To rebuild the
circuit: `cd near/circuits && npm run build`.

For a demo of the whole market lifecycle, `cd backend && npx tsx scripts/quick-market.ts create 6` opens a NEAR
price question that closes in 6 minutes. After it closes, `npx tsx scripts/quick-market.ts resolve <id> <1=Yes|2=No>`
votes, finalizes and confirms the result (about ten minutes on testnet). Winners can then redeem privately in the app.

`NEAR_RPC_URL` accepts a comma-separated list for the relayer, the oracle and the scripts. Each call moves to the next
endpoint when one times out or rate-limits.

### Tests

| What | Command |
|---|---|
| Circuit | `node --test near/circuits/test/spend.test.mjs` |
| Contract rules (mocked host, fast) | `cd near/contract && cargo test -p veiled` |
| Contract (near-workspaces sandbox) | `cd near/contract && cargo test -p integration-tests` |
| In-place upgrade from the live build | `VEILED_WASM_OLD=<live wasm> cargo test -p integration-tests --test upgrade` |
| Relayer checks | `cd backend && npx tsx --test src/relay-guards.test.ts` |
| Browser note keys and math | `cd frontend && npm test` |
| Live testnet smoke test | `cd backend && npx tsx scripts/testnet-smoke.ts` |

## Not on NEAR yet

Governance proposals, resolver staking and rewards still exist only on Aleo. The app hides their buttons on NEAR.
Dispute escalation to the committee and parlays do work on NEAR.

## Parlays

A parlay combines 2 to 4 outcomes on different markets and pays only if every leg wins. Legs must be markets the
owner approved for parlays. The contract prices each leg from the live market pools (at most 100× per leg and 1000×
combined, and a payout of at most 1% of the thinnest leg's pool depth), so the quote in the app is the contract's own.
Placing is a private action like a trade: the stake comes from your private balance and the contract gives you a
private ticket note. A losing leg settles the ticket at once; otherwise it settles when every leg is final, and a
cancelled leg refunds the stake. A winning ticket pays its payout minus 2%. Payouts come from a house pool that must
cover 110% of all open tickets; anyone can add to it on the My Parlays page.

## Known limits

What the testnet deployment trusts, and what a production deployment still needs:

- **Resolution.** A market resolves by bonded vote, then a dispute window, then (if disputed) a committee of five
  accounts the operator runs. The testnet uses demo settings so a market resolves in minutes: one voter is enough, the
  bond is 0.1 NEAR and each window is 5 minutes. With those settings one account can decide a market unless someone
  disputes within 5 minutes. The owner can set production values with `set_resolution_config` (more voters, hour-long
  windows, a real bond); correct voters and disputers are not yet paid from forfeited bonds, so honest resolution
  still depends on bettors and the committee watching.
- **Cancelled markets.** A cancelled market refunds each outcome what its buyers paid in (pro rata within that
  outcome), so a refund cannot draw on another outcome's collateral. Markets created before that rule (ids up to
  the upgrade) keep the old pro-rata refund.
- **Parlay pool.** Leg odds are read from the markets' own pools, which anyone with capital can move. Only markets the
  owner approved can be legs, and one ticket pays at most 1% of its thinnest leg's pool depth. The pool is still
  operator-funded risk capital, not a guaranteed product.
- **Turbo rounds.** Bets close for the last fifth of a round, because a shared pool cannot fairly take bets when the
  result is all but known. The operator still supplies the baseline and closing price (see Turbo prices below).
- **Storage and capacity.** Every private action adds two leaves and two nullifiers (about 700 bytes) that the
  contract pays for from its own NEAR, and the note tree holds 524,288 actions in total. A production deployment needs
  a storage fee per action and a deeper or rotating tree; the testnet contract is topped up by the operator.
- **Private balance key.** The key is derived from a wallet signature and kept in the browser's storage. A wallet
  that cannot sign messages gets a browser-only key, which the app tells you to back up. Sign the key message only on
  veiledmarkets.xyz.
- **Privacy.** Amounts are public; what is hidden is which account holds which position. A deposit made right before
  a bet can be linked to it by timing, so fund the private balance ahead of time.
- **Operator keys.** The contract account still has a full-access key and can be redeployed by the operator.
- **Testnet trusted setup.** The circuit key comes from a single phase-2 contribution on top of the public
  Perpetual Powers of Tau. A mainnet launch needs a multi-party ceremony.
- **Turbo prices.** The oracle operator submits prices, and the contract checks the operator and the price bounds.
  The oracle reads Pyth Hermes when it has an API key, and streams only the feeds that key is entitled to. Without
  a key it falls back to CoinGecko spot prices, which refresh about once a minute.
- **Relayer.** The relayer pays gas and cannot change a trade, because the proof binds the action, the recipient and the
  fee. A production relayer would charge a fee.

## Sister project: Verdict

Verdict is our other NEAR HACKATHON 2026 project. It is a prediction market
that resolves itself by reading NEAR state with a view call, so no person or vote decides who won.
The two projects answer different questions:

- **Veiled Markets:** who holds a position stays private.
- **Verdict:** who won is decided by the chain, not by a resolver.

## License

[MIT](LICENSE)
