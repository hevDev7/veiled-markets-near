# Resolution rules

How a Veiled Markets result is decided, and when a market is cancelled instead. Voters, disputers, the committee and
the AI resolver all apply these rules. The contract does not read them: it counts bonds and committee votes. What makes
the rules bind is the bond each voter risks, and a committee that decides disputes by them.

## 1. What decides a market

**The market's own text.** A market is decided by its question, its rules (the description), its outcome labels and
the resolution source it names, as written on chain when it was created. That text cannot be edited afterwards
(`get_market` → `metadata`). Where the question and the rules differ, the rules win.

**The moment that counts.** If the question names a date and time, that decides what counts. If it names none, what
was true at the market's trading deadline counts. All times are UTC.

**The source, in this order:**

1. The resolution source the market names.
2. If that source is unavailable, contradicts itself or never publishes the figure, the event's official primary
   source (the organizer, the agency, the issuer).
3. Failing both, a clear consensus of reliable public reporting.

A correction the source publishes before the dispute window ends counts. One published after the market resolved
does not reopen it.

**Reading the question.** Words have their plain meaning. Numbers are taken as the source publishes them, with no
rounding unless the rules ask for it. "Above" and "below" are strict: a close of exactly $100,000 is not above
$100,000. A "Will X happen by D?" market whose X has not happened by D resolves **No**.

## 2. When a market is cancelled

A market that these rules cannot decide is not forced onto an outcome. That is the case when:

- the question is ambiguous, so that careful readers following the rules would pick different outcomes;
- the event was called off or moved past the question's date, for a question about its result (a question about
  whether it happens resolves No instead);
- the named source never publishes, and neither does an official primary source, and there is no clear consensus;
- the question rests on something false, such as an event that does not exist.

The contract cancels a market in exactly three ways, and refunds every position, liquidity share and bond:

| Way | Who or what |
|---|---|
| Before any trade | The creator calls `cancel_market` while the market is active and has no volume. |
| No result in time | No vote is counted before the market's resolution deadline. |
| No decision in time | A dispute the committee has not decided within its time limit (24 hours on testnet). |

So for a market that should be cancelled: do not vote an outcome. If someone does, dispute it (for any other outcome),
and the committee lets its time limit pass instead of choosing. The market is then cancelled, and every bond comes
back, the dispute bond included.

## 3. Voting

- Vote for the outcome these rules give, not the one you hold shares in. A bond on a losing outcome is forfeited to
  the treasury.
- Attach a link to the evidence your vote relies on (`vote_outcome(…, evidence)`, at most 300 bytes). It is stored
  with your vote and shown next to it in the app.
- The first voter of the winning outcome is the market's **resolver**. The call that settles the market pays them
  their bond back plus a share of the market's protocol fees (half, by default), with nothing to claim.

## 4. Disputes and the committee

- During the dispute window (one hour on testnet) anyone can dispute the voted outcome for another one, with a bond
  of three times the bonds already posted.
- A disputed market goes to the committee: five accounts, one vote each, three votes on one outcome with no tie at
  the top to decide. The committee reads the market's text, the votes' evidence and the source, and applies these
  rules. Its decision takes effect without any further call.
- If the committee's outcome is the disputer's, the dispute bond comes back (with the resolver reward when nobody had
  voted for that outcome). Otherwise it is forfeited.
- **Today the five committee accounts are all run by the project's operator**, so on testnet the team decides every
  dispute. A production deployment needs a committee the operator does not control.

## 5. The AI resolver

`backend/src/near-ai-resolver.ts` applies these rules with a model that runs in NEAR AI Cloud's TEE. Its request
holds the question, the rules, the numbered outcomes, the current date and the text of the named source, and tells the
model to treat the source text as data and to answer null when the source does not settle the question. It can only
read a source given as a URL: on a market whose source is a name or a description, the model has nothing to read and
abstains. It votes only
when the model's confidence is at least 0.8 and the model TEE's signature over the exact request and response checks
out against an attestation fetched with a fresh nonce. Each vote links a receipt with the reasoning, the signature and
the attestation. It votes as `ai.veiled-markets.testnet` and stands like any other voter: its vote can be voted
against, disputed and overruled.

## 6. Timeline on testnet

| Stage | Length | What ends it |
|---|---|---|
| Vote window | 15 minutes from the first vote | the clock; a window short of its quorum reopens with the next vote |
| Dispute window | 1 hour after the vote window | the clock; the result is final if nobody disputed |
| Committee | up to 24 hours from the dispute | three matching committee votes, or the time limit (cancelled) |
| Winners first | 1 hour after the dispute window | then liquidity providers and the creator can withdraw |

No call is needed to move a market from one stage to the next: the contract's views show its current stage, and the
next call that touches the market (the first redeem, a refund, a bond claim, or `settle_market`) writes it on chain.

## 7. What these rules cannot do

The contract enforces the windows, the bonds, the committee's quorum and the payouts. It cannot tell whether a vote
followed these rules. On testnet the bond is 0.1 NEAR and one voter is enough, so a single account can decide a market
that nobody disputes within the hour. These are demo settings, not production ones.
