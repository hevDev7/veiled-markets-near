#!/bin/bash
# ============================================================================
# VEILED GOVERNANCE — Deployment Script
# ============================================================================
# Deploy veiled_governance_v4.aleo to Aleo testnet
# Can be run from repo root OR from contracts-governance/ directory
# ============================================================================

set -e

# Detect script directory and resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROGRAM_DIR="$SCRIPT_DIR"

# Read program ID from program.json (single source of truth)
PROGRAM_ID=$(grep -o '"program": "[^"]*"' "$PROGRAM_DIR/program.json" | cut -d'"' -f4)
NETWORK="testnet"
PRIORITY_FEE="0"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🏛️  Veiled Governance — Deployment${NC}"
echo "=================================="
echo "Program: ${PROGRAM_ID}"
echo "Network: ${NETWORK}"
echo "Directory: ${PROGRAM_DIR}"
echo ""

# Load .env if present (check script dir and parent)
if [ -f "$PROGRAM_DIR/.env" ]; then
    echo -e "${YELLOW}📄 Loading .env from $PROGRAM_DIR/.env${NC}"
    set -a
    source "$PROGRAM_DIR/.env"
    set +a
elif [ -f "$PROGRAM_DIR/../.env" ]; then
    echo -e "${YELLOW}📄 Loading .env from repo root${NC}"
    set -a
    source "$PROGRAM_DIR/../.env"
    set +a
fi

# Check environment
if [ -z "$PRIVATE_KEY" ]; then
    echo -e "${RED}❌ PRIVATE_KEY not set.${NC}"
    echo "  Either add it to .env or export it:"
    echo "  export PRIVATE_KEY=APrivateKey1..."
    exit 1
fi

# Check for leo
if ! command -v leo &> /dev/null; then
    echo -e "${RED}❌ leo not found. Install it first.${NC}"
    exit 1
fi

# Build
echo -e "${YELLOW}📦 Compiling with Leo...${NC}"
cd "$PROGRAM_DIR"
leo build
echo -e "${GREEN}✅ Compilation successful${NC}"

# Count transitions
TRANSITION_COUNT=$(grep -c "^function " build/main.aleo)
echo "   Transitions: ${TRANSITION_COUNT}/31"
if [ "$TRANSITION_COUNT" -gt 31 ]; then
    echo -e "${RED}❌ Exceeds 31-transition limit!${NC}"
    exit 1
fi

# Deploy
echo ""
echo -e "${YELLOW}🚀 Deploying ${PROGRAM_ID} to ${NETWORK}...${NC}"
echo ""

leo deploy --network "$NETWORK" --priority-fees "$PRIORITY_FEE" --yes --broadcast

echo ""
echo -e "${GREEN}✅ Deployment submitted!${NC}"
echo ""
echo "Next steps:"
echo "  1. Wait for transaction confirmation (~30s-2m)"
echo "  2. Initialize governance:"
echo "     snarkos developer execute ${PROGRAM_ID} init_governance \\"
echo "       'guardian_1_address' 'guardian_2_address' 'guardian_3_address' '2u8' \\"
echo "       --private-key \$PRIVATE_KEY --query ... --broadcast ..."
echo ""
