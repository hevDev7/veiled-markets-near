#!/usr/bin/env bash
# Code-only redeploy of the Veiled contract: state is kept (no init call), so it only works while the
# contract's state struct keeps the same layout.
# Usage: near/scripts/upgrade-testnet.sh [contract]      default: v1.veiled-markets.testnet
set -euo pipefail
cd "$(dirname "$0")/.."
source ./env.sh
CONTRACT=${1:-v1.veiled-markets.testnet}
NET="network-config testnet-fastnear"
(cd contract/contracts/veiled && cargo near build non-reproducible-wasm --no-abi)
WASM="$CARGO_TARGET_DIR/near/veiled/veiled.wasm"
near contract deploy "$CONTRACT" use-file "$WASM" without-init-call $NET sign-with-legacy-keychain send
near contract call-function as-read-only "$CONTRACT" get_tree_info json-args '{}' $NET now
echo "Upgraded $CONTRACT"
