#!/bin/bash
# ============================================================================
# VEILED GOVERNANCE — Deployment Script
# ============================================================================
# Deploy veiled_governance_v1.aleo to Aleo testnet
# Prerequisites: snarkos CLI installed, private key set
# ============================================================================

set -e

# Configuration
PROGRAM_DIR="contracts-governance"
PROGRAM_ID="veiled_governance_v1.aleo"
NETWORK="testnet"
PRIORITY_FEE="1000000"  # 1 credit

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🏛️  Veiled Governance — Deployment${NC}"
echo "=================================="
echo "Program: ${PROGRAM_ID}"
echo "Network: ${NETWORK}"
echo ""

# Check environment
if [ -z "$PRIVATE_KEY" ]; then
    echo -e "${RED}❌ PRIVATE_KEY not set. Export it first:${NC}"
    echo "  export PRIVATE_KEY=APrivateKey1..."
    exit 1
fi

# Check for snarkos
if ! command -v snarkos &> /dev/null; then
    echo -e "${RED}❌ snarkos not found. Install it first.${NC}"
    exit 1
fi

# Check for leo (optional — for compilation)
if command -v leo &> /dev/null; then
    echo -e "${YELLOW}📦 Compiling with Leo...${NC}"
    cd "$PROGRAM_DIR"
    leo build
    cd ..
    echo -e "${GREEN}✅ Compilation successful${NC}"
else
    echo -e "${YELLOW}⚠️  leo not found, skipping compilation. Using pre-built artifacts.${NC}"
fi

# Deploy
echo ""
echo -e "${YELLOW}🚀 Deploying to ${NETWORK}...${NC}"
echo ""

snarkos developer deploy \
    --private-key "$PRIVATE_KEY" \
    --query "https://api.explorer.provable.com/v1/${NETWORK}" \
    --priority-fee "$PRIORITY_FEE" \
    --broadcast "https://api.explorer.provable.com/v1/${NETWORK}/transaction/broadcast" \
    "${PROGRAM_ID}" \
    --path "${PROGRAM_DIR}/build/"

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
echo "  3. Run governance indexer:"
echo "     cd backend && npx tsx src/governance-indexer.ts"
echo ""
echo "  4. Run Supabase migration:"
echo "     psql \$DATABASE_URL < supabase-governance-schema.sql"
