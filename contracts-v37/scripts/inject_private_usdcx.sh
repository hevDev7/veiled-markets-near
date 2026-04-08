#!/bin/bash
# ============================================================================
# inject_private_usdcx.sh
# ============================================================================
# Injects the buy_shares_private_usdcx transition into the compiled .aleo
# output. Run AFTER `leo build`.
#
# Why: Leo 3.4.0 bug ETYC0372117 — [ImportedProgram/Struct; N] arrays can't
# be passed to imported function calls. Workaround: write transition in Aleo
# instructions using UNQUALIFIED struct names (MerkleProof, not
# test_usdcx_stablecoin.aleo/MerkleProof) to avoid snarkVM parser issues.
#
# Usage: cd contracts && ./scripts/inject_private_usdcx.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_FILE="$CONTRACT_DIR/build/main.aleo"
INJECT_FILE="$CONTRACT_DIR/aleo/buy_shares_private_usdcx_v3.aleo"

# Validate files exist
if [ ! -f "$BUILD_FILE" ]; then
    echo "❌ Build file not found: $BUILD_FILE"
    echo "   Run 'leo build' first."
    exit 1
fi

if [ ! -f "$INJECT_FILE" ]; then
    echo "❌ Injection file not found: $INJECT_FILE"
    exit 1
fi

# Check if already injected
if grep -q "function buy_shares_private_usdcx:" "$BUILD_FILE"; then
    echo "⚠️  buy_shares_private_usdcx already exists in $BUILD_FILE"
    echo "   Skipping injection."
    exit 0
fi

# Strip comments from injection file (Aleo instructions don't support //)
CLEAN_INJECT=$(grep -v '^//' "$INJECT_FILE" | grep -v '^\s*$' | sed '/^$/d')

# Append to build file
{
    cat "$BUILD_FILE"
    echo ""
    echo "$CLEAN_INJECT"
} > "${BUILD_FILE}.tmp"

mv "${BUILD_FILE}.tmp" "$BUILD_FILE"

echo "✅ Injected buy_shares_private_usdcx (unqualified MerkleProof, v3) into $BUILD_FILE"
echo "   Total transitions: $(grep -c '^function ' "$BUILD_FILE")"
