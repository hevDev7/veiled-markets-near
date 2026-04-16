#!/bin/bash
# ============================================================================
# Veiled Turbo — Testnet Deployment Script
# ============================================================================
# Deploys the current veiled_turbo program (read from program.json) to Aleo
# testnet using the operator wallet. Currently: veiled_turbo_v8.aleo.
# Run from contracts-turbo-v1/ directory.
#
# Prerequisites:
#   - leo 4.0.0+ in PATH
#   - snarkos in PATH
#   - .env at repo root with ALEO_PRIVATE_KEY (must be funded)
#   - Operator address must match ORACLE_OPERATOR constant in src/main.leo
# ============================================================================

set -euo pipefail

# Load env
if [ -f ../.env ]; then
    set -a
    source ../.env
    set +a
fi

# Derive program ID from program.json so this script stays in sync across
# deploys (v1 → v8 → future versions) without manual edits.
PROGRAM_ID="$(grep -oE '"program"\s*:\s*"[^"]+"' program.json | sed -E 's/.*"([^"]+)"$/\1/')"
NETWORK="testnet"
# snarkos developer deploy needs:
#   --endpoint:  base URL for state queries (e.g. /v1)
#   --broadcast: FULL URL of the broadcast endpoint (not just base)
QUERY_ENDPOINT="${ALEO_RPC_URL:-https://api.explorer.provable.com/v1}"
BROADCAST_URL="${ALEO_BROADCAST_URL:-https://api.explorer.provable.com/v1/testnet/transaction/broadcast}"
PRIORITY_FEE="${ALEO_PRIORITY_FEE:-1000000}"

if [ ! -f "program.json" ]; then
    echo "❌ Run from contracts-turbo-v1/ directory"
    exit 1
fi

if [ -z "${ALEO_PRIVATE_KEY:-}" ]; then
    echo "❌ ALEO_PRIVATE_KEY not set"
    exit 1
fi

echo "🚀 Veiled Turbo — Testnet Deployment"
echo "========================================"
echo "  Program:   $PROGRAM_ID"
echo "  Network:   $NETWORK"
echo "  Query:     $QUERY_ENDPOINT"
echo "  Broadcast: $BROADCAST_URL"
echo ""

echo "🔨 Building..."
leo build
echo ""

echo "🧪 Running logic tests..."
leo test
echo ""

echo "📦 Deploying $PROGRAM_ID..."
echo "    (this requires ~10-30 ALEO depending on program size)"
echo ""
read -p "Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# snarkos deploy must run from the build/ directory where main.aleo lives
cd build
snarkos developer deploy \
    --endpoint "$QUERY_ENDPOINT" \
    --broadcast "$BROADCAST_URL" \
    --private-key "$ALEO_PRIVATE_KEY" \
    --priority-fee "$PRIORITY_FEE" \
    --network 1 \
    "$PROGRAM_ID"
cd ..

echo ""
echo "✅ Deployment broadcast. Check:"
echo "   https://explorer.provable.com/testnet/program/$PROGRAM_ID"
