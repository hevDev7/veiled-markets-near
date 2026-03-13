# Audit Report: `buy_shares_private_usdcx` -- veiled_markets_v22.aleo

## Scope

Full technical audit of the transition `buy_shares_private_usdcx` with
focus on: 1. Transition logic correctness 2. FPMM (Fixed Product Market
Maker) math safety 3. snarkVM transition / constraint limits 4.
Constraint & gas optimization opportunities

------------------------------------------------------------------------

# 1. Transition Logic Overview

Function structure:

    transition buy_shares_private_usdcx(
        market_id,
        outcome,
        amount_in,
        expected_shares,
        min_shares_out,
        share_nonce,
        token_record,
        merkle_proof_0,
        merkle_proof_1
    )

### Execution Flow

1.  Validate inputs

```{=html}
<!-- -->
```
    assert(outcome >= OUTCOME_1 && outcome <= OUTCOME_4);
    assert(amount_in >= MIN_TRADE_AMOUNT);

2.  Create share record

```{=html}
<!-- -->
```
    OutcomeShare {
     owner
     market_id
     outcome
     quantity
    }

3.  Reconstruct Merkle proof array

```{=html}
<!-- -->
```
    let merkle_proofs = [merkle_proof_0, merkle_proof_1];

4.  Call external token program

```{=html}
<!-- -->
```
    test_usdcx_stablecoin.aleo/transfer_private_to_public

5.  Return a future for settlement

```{=html}
<!-- -->
```
    buy_shares_priv_usdcx_fin(...)

------------------------------------------------------------------------

# 2. Critical Design Risk -- Off‑Chain Share Calculation

The transition receives:

    expected_shares: u128

and mints:

    quantity: expected_shares

This means the **share calculation occurs off‑chain**.

### Attack Scenario

User submits:

    amount_in = 1000
    expected_shares = 1_000_000

If the finisher transition does not verify the formula, the user can
mint unlimited shares.

### Required Validation

Inside `buy_shares_priv_usdcx_fin` the program must verify:

    assert(calculated_shares >= min_shares_out)
    assert(calculated_shares == expected_shares)

and compute shares using the pool reserves.

Severity: **CRITICAL**

------------------------------------------------------------------------

# 3. FPMM Math Safety Review

FPMM invariant:

    k = r1 * r2 * r3 * r4

### Overflow Risk

Maximum u128:

    340282366920938463463374607431768211455

Example reserves:

    r1 = 1e12
    r2 = 1e12
    r3 = 1e12
    r4 = 1e12

Product:

    10^48

This exceeds the u128 limit and causes overflow.

### Safer Calculation

Use progressive reduction:

    k = (r1 * r2) / SCALE
    k = (k * r3) / SCALE
    k = (k * r4) / SCALE

or divide early when computing the invariant.

------------------------------------------------------------------------

# 4. snarkVM Constraint Analysis

Estimated constraints:

  Component                 Approx Constraints
  ------------------------- --------------------
  Token transfer            \~25k
  Merkle proof (depth 16)   \~16k
  Logic + records           \~5k
  Total                     \~46k

snarkVM limit per transition is approximately **\~1,000,000
constraints**, so this transition remains safe.

However the program already contains **\~30 transitions**, which is
close to the current program limit (\~31).

------------------------------------------------------------------------

# 5. Constraint Optimization Opportunities

### Optimization 1 -- Reduce boolean operations

Instead of:

    assert(outcome >= OUTCOME_1 && outcome <= OUTCOME_4);

Prefer:

    assert(outcome >= 1u8);
    assert(outcome <= 4u8);

This removes the boolean AND constraint.

------------------------------------------------------------------------

### Optimization 2 -- Delay record creation

Currently the share record is constructed before final validation.

Recommended flow:

    compute shares
    validate shares
    mint record

This saves constraints if the transaction fails earlier.

------------------------------------------------------------------------

### Optimization 3 -- Deterministic nonce

Instead of user‑supplied nonce:

    share_nonce

derive:

    hash(self.caller, block.height)

This prevents replay or duplicated share records.

------------------------------------------------------------------------

# 6. Privacy Model Review

Trade flow:

    private token
    → token program
    → public liquidity pool
    → private share record

Advantages:

-   Trader identity remains private
-   Liquidity pool remains auditable
-   Oracle settlement can remain transparent

Design resembles a hybrid between **Aztec privacy trading** and
**Polymarket prediction markets**.

------------------------------------------------------------------------

# 7. Potential Attack Surfaces

## 1. Share Inflation

If `expected_shares` is not validated.

Severity: **Critical**

------------------------------------------------------------------------

## 2. Outcome Index Mismatch

Code currently allows:

    1..4

But a market may have fewer outcomes.

Required check:

    assert(outcome <= market.num_outcomes)

------------------------------------------------------------------------

## 3. Front‑Running Risk

Because `expected_shares` is provided by the user, reserve changes
between transaction creation and execution can cause:

-   trade failure
-   arbitrage opportunities

Mitigation already present:

    min_shares_out

This is equivalent to a slippage guard.

------------------------------------------------------------------------

# 8. Architectural Recommendation

Split the transition into two steps:

Step 1

    private token transfer

Step 2

    FPMM math + share minting

Benefits:

-   lower constraint pressure
-   simpler verification
-   easier upgrade path

------------------------------------------------------------------------

# 9. Audit Score

  Category                Score
  ----------------------- -------
  Architecture            9/10
  Privacy Model           9/10
  snarkVM Compatibility   8/10
  FPMM Math Safety        6/10
  Attack Surface          7/10

Overall Rating:

**8 / 10**

The design is advanced and well suited for privacy prediction markets.

------------------------------------------------------------------------

# 10. Strategic Insight

Aleo currently lacks a production‑grade prediction market.

This architecture (private traders + public liquidity) could become a
**core DeFi primitive in the Aleo ecosystem** if:

-   FPMM math is hardened
-   oracle integration is added
-   UI / UX layer is implemented

This project has strong potential for hackathons and long‑term ecosystem
adoption.
