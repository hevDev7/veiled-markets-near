#!/bin/bash

# Test Create Market Script
# This script tests the create_market function using Aleo CLI

echo "========================================="
echo "Testing veiled_markets.aleo - create_market"
echo "========================================="
echo ""

# Configuration
PROGRAM_ID="veiled_markets.aleo"
FUNCTION="create_market"
PRIVATE_KEY="APrivateKey1zkp2hcw63PzWVN385KsjeRkKFs76TeogaMrXfsAViFRVAgE"  # Replace with your key
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
