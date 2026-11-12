#!/usr/bin/env bash
# Deploys Veiled Markets to NEAR testnet (docs/near/DESIGN.md §7).
#
# Accounts (created once with `near account create-account sponsor-by-faucet-service <name>.testnet ...`):
#   veiled-markets.testnet  owner; the contract lives in a versioned subaccount (v1, v2, ...)
#   veiled-relayer.testnet  submits private `transact` calls (backend/src/near-relayer.ts)
#   veiled-oracle.testnet   opens and resolves turbo rounds (backend/src/near-turbo-oracle.ts)
#   veiled-tokens.testnet   parent of the mock USDCX token (slot 2, not offered in the app)
#
# Slot 3 is Circle's official testnet USDC (faucet.circle.com, "NEAR Testnet"), the only stablecoin the app offers.
#
# Usage: near/scripts/deploy-testnet.sh <version>     e.g. v1
# Requires the wasm built first (see near/contract/README or the plan) and near-cli-rs.
set -euo pipefail
source "$(dirname "$0")/../env.sh"

VERSION=${1:?version, e.g. v1}
OWNER=veiled-markets.testnet
CONTRACT=$VERSION.$OWNER
ORACLE=veiled-oracle.testnet
TOKENS=veiled-tokens.testnet
USDCX=usdcx.$TOKENS
# Circle's testnet USDC. The live v1 contract got it by `set_token_account(3, …)` after its upgrade.
USAD=3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af
NET="network-config testnet-fastnear"
WASM=$CARGO_TARGET_DIR/near/veiled/veiled.wasm
FT_WASM=$CARGO_TARGET_DIR/near/mock_ft/mock_ft.wasm

exists() {
  curl -s -X POST ${NEAR_RPC_URL:-https://test.rpc.fastnear.com} -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" \
    | grep -q '"amount"'
}

subaccount() { # name funder amount
  if exists "$1"; then echo "exists: $1"; return; fi
  near account create-account fund-myself "$1" "$3" autogenerate-new-keypair save-to-legacy-keychain \
    sign-as "$2" $NET sign-with-legacy-keychain send
}

# Mock faucet token for slot 2 (deployed once; versions of the market contract share it). Slot 3 is Circle's.
for t in "$USDCX:USD Coin X (testnet):USDCX"; do
  IFS=: read -r acct name symbol <<<"$t"
  if exists "$acct"; then echo "exists: $acct"; continue; fi
  subaccount "$acct" "$TOKENS" '3 NEAR'
  near contract deploy "$acct" use-file "$FT_WASM" with-init-call new \
    json-args "{\"name\":\"$name\",\"symbol\":\"$symbol\"}" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
    $NET sign-with-legacy-keychain send
done

# Resolution committee (5 members, governance tier 2).
COMMITTEE=()
for i in 1 2 3 4 5; do
  subaccount "c$i.$OWNER" "$OWNER" '0.2 NEAR'
  COMMITTEE+=("\"c$i.$OWNER\"")
done

# Demo windows: 4-second ticks, so 75 ticks = 5 minutes. Aleo defaults are in types.rs (Config::default).
CONFIG='{"vote_window":75,"dispute_window":75,"winner_claim_priority":75,"disputed_timeout":900,
"vote_bond":"100000","min_voters":1,"dispute_bond_multiplier":3,"min_trade":"1000","min_liquidity":"10000",
"protocol_fee_bps":"50","creator_fee_bps":"50","lp_fee_bps":"100","committee_quorum":3}'

subaccount "$CONTRACT" "$OWNER" '6 NEAR'
INIT=$(tr -d '\n' <<EOF
{"owner":"$OWNER","oracle_operator":"$ORACLE","committee":[$(IFS=,; echo "${COMMITTEE[*]}")],
"usdcx_token":"$USDCX","usad_token":"$USAD","config":$CONFIG}
EOF
)
near contract deploy "$CONTRACT" use-file "$WASM" with-init-call new json-args "$INIT" \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' $NET sign-with-legacy-keychain send

# The contract must hold a storage deposit on Circle USDC to receive it.
near contract call-function as-transaction "$USAD" storage_deposit json-args "{\"account_id\":\"$CONTRACT\",\"registration_only\":true}" \
  prepaid-gas '30 Tgas' attached-deposit '0.00125 NEAR' sign-as "$OWNER" $NET sign-with-legacy-keychain send

near contract call-function as-read-only "$CONTRACT" get_tree_info json-args '{}' $NET now
echo "Deployed $CONTRACT"
