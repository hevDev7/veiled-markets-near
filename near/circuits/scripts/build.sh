#!/usr/bin/env bash
# Builds the spend circuit, the Groth16 keys, the Rust verifying-key file and the browser prover files.
# Heavy intermediates live outside the repo, in BUILD_CACHE (set by near/env.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
source ../env.sh
PTAU="${PTAU:-$BUILD_CACHE/ptau/ppot_0080_15.ptau}"   # PSE Perpetual Powers of Tau, 80 contributions, 2^15
OUT_PUBLIC=../../frontend/public/zk
OUT_RUST=../contract/contracts/veiled/src/vk.rs
mkdir -p build "$OUT_PUBLIC"

circom spend.circom --r1cs --wasm --sym -o build
npx snarkjs groth16 setup build/spend.r1cs "$PTAU" "$BUILD_CACHE/spend_0000.zkey"
# Phase-2 contribution. Testnet only: a mainnet deployment needs a multi-party ceremony.
ENTROPY="$(head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')"
npx snarkjs zkey contribute "$BUILD_CACHE/spend_0000.zkey" build/spend_final.zkey \
  --name="veiled-near testnet" -e="$ENTROPY" >/dev/null
npx snarkjs zkey export verificationkey build/spend_final.zkey build/verification_key.json

cp build/spend_js/spend.wasm "$OUT_PUBLIC/spend.wasm"
cp build/spend_final.zkey "$OUT_PUBLIC/spend_final.zkey"
cp build/verification_key.json "$OUT_PUBLIC/verification_key.json"
node scripts/gen-vk-rs.mjs build/verification_key.json "$OUT_RUST"
echo "circuit built: $(npx snarkjs r1cs info build/spend.r1cs 2>&1 | grep -o 'Constraints: [0-9]*')"
