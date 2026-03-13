#!/bin/bash
# ============================================================================
# fix_merkleproof_type.sh
# ============================================================================
# Post-build fix: Leo 3.5.0 compiles [MerkleProof; 2] arrays with fully-
# qualified path (test_usdcx_stablecoin.aleo/MerkleProof) but snarkVM parser
# can't handle imported struct paths inside array brackets.
#
# Replaces: [test_usdcx_stablecoin.aleo/MerkleProof; 2u32]
# With:     [MerkleProof; 2u32]
#
# Usage: cd contracts && leo build && ./scripts/fix_merkleproof_type.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_FILE="$CONTRACT_DIR/build/main.aleo"

if [ ! -f "$BUILD_FILE" ]; then
    echo "Error: Build file not found: $BUILD_FILE"
    echo "  Run 'leo build' first."
    exit 1
fi

# Check if fix is needed
if grep -q 'test_usdcx_stablecoin.aleo/MerkleProof' "$BUILD_FILE"; then
    sed -i 's/\[test_usdcx_stablecoin\.aleo\/MerkleProof;/[MerkleProof;/g' "$BUILD_FILE"
    echo "Fixed MerkleProof type in $BUILD_FILE"
    echo "  [test_usdcx_stablecoin.aleo/MerkleProof; 2u32] -> [MerkleProof; 2u32]"
else
    echo "No fix needed - MerkleProof type already unqualified"
fi
