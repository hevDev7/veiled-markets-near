#!/bin/bash

# Test Create Market Script
# This script tests the create_market function using Aleo CLI

echo "========================================="
echo "Testing veiled_markets.aleo - create_market"
echo "========================================="
echo ""

# Configuration
PROGRAM_ID="veiled_markets_v37.aleo"
FUNCTION="create_market"

# Private key MUST be provided via env var. NEVER commit a real key here.
# Set in .env (gitignored) and `source .env` before running, or:
#   PRIVATE_KEY=APrivateKey1zkp... ./test-create-market.sh
if [ -z "$PRIVATE_KEY" ]; then
  echo "Error: PRIVATE_KEY env var not set."
  echo "Set it in .env (gitignored) or export it before running:"
  echo "  export PRIVATE_KEY=APrivateKey1zkp..."
  exit 1
fi

QUERY_URL="https://api.explorer.provable.com/v1"
BROADCAST_URL="https://api.explorer.provable.com/v1/testnet/transaction/broadcast"
FEE=1000000  # 1 credit

# Market parameters
QUESTION_HASH="b24ae0f66b7ca0a84dcb3af06c050cd752f5ca3dc5ed1f1fa8da3dc720d473field"
CATEGORY="3u8"  # Crypto
DEADLINE="14227140u64"  # Block height for betting deadline
RESOLUTION_DEADLINE="14244420u64"  # Block height for resolution deadline

echo "Parameters:"
echo "  Program: $PROGRAM_ID"
echo "  Function: $FUNCTION"
echo "  Question Hash: $QUESTION_HASH"
echo "  Category: $CATEGORY (Crypto)"
echo "  Deadline: $DEADLINE"
echo "  Resolution Deadline: $RESOLUTION_DEADLINE"
echo "  Fee: $FEE microcredits"
echo ""

echo "Executing transaction..."
echo ""

# Execute the transaction
snarkos developer execute \
  "$PROGRAM_ID" \
  "$FUNCTION" \
  "$QUESTION_HASH" \
  "$CATEGORY" \
  "$DEADLINE" \
  "$RESOLUTION_DEADLINE" \
  --private-key "$PRIVATE_KEY" \
  --query "$QUERY_URL" \
  --broadcast "$BROADCAST_URL" \
  --fee $FEE

echo ""
echo "========================================="
echo "Transaction submitted!"
echo "Check the transaction ID above on:"
echo "https://testnet.explorer.provable.com/"
echo "========================================="
