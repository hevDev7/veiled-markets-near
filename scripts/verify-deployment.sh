#!/bin/bash

# ============================================================================
# VEILED MARKETS - Deployment Verification Script
# ============================================================================
# Verify that the veiled_markets.aleo program is deployed correctly
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROGRAM_NAME="veiled_markets"
DEFAULT_NETWORK="testnet"
NETWORK="${1:-$DEFAULT_NETWORK}"

# Set endpoint based on network
case $NETWORK in
    testnet)
        ENDPOINT="https://api.explorer.provable.com/v1/testnet"
        EXPLORER="https://testnet.explorer.provable.com"
        ;;
    mainnet)
        ENDPOINT="https://api.explorer.provable.com/v1/mainnet"
        EXPLORER="https://explorer.provable.com"
        ;;
    *)
        echo -e "${RED}Error: Unknown network: ${NETWORK}${NC}"
        echo "Usage: $0 [testnet|mainnet]"
        exit 1
        ;;
esac

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║        VEILED MARKETS - DEPLOYMENT VERIFICATION              ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

echo -e "${YELLOW}Checking ${PROGRAM_NAME}.aleo on ${NETWORK}...${NC}"
echo ""

# Check if program exists
PROGRAM_URL="${ENDPOINT}/program/${PROGRAM_NAME}.aleo"
echo -e "Fetching program from: ${PROGRAM_URL}"
echo ""

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${PROGRAM_URL}")

if [ "$RESPONSE" == "200" ]; then
    echo -e "${GREEN}✓ Program found on ${NETWORK}!${NC}"
    echo ""
    
    # Get program details
    PROGRAM_DATA=$(curl -s "${PROGRAM_URL}")
    
    echo -e "${BLUE}Program Details:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Check for key components
    if echo "$PROGRAM_DATA" | grep -q "create_market"; then
        echo -e "  ${GREEN}✓${NC} create_market transition found"
    else
        echo -e "  ${RED}✗${NC} create_market transition NOT found"
    fi
    
    if echo "$PROGRAM_DATA" | grep -q "place_bet"; then
        echo -e "  ${GREEN}✓${NC} place_bet transition found"
    else
        echo -e "  ${RED}✗${NC} place_bet transition NOT found"
    fi
    
    if echo "$PROGRAM_DATA" | grep -q "resolve_market"; then
        echo -e "  ${GREEN}✓${NC} resolve_market transition found"
    else
        echo -e "  ${RED}✗${NC} resolve_market transition NOT found"
    fi
    
    if echo "$PROGRAM_DATA" | grep -q "claim_winnings"; then
        echo -e "  ${GREEN}✓${NC} claim_winnings transition found"
    else
        echo -e "  ${RED}✗${NC} claim_winnings transition NOT found"
    fi
    
    if echo "$PROGRAM_DATA" | grep -q "markets"; then
        echo -e "  ${GREEN}✓${NC} markets mapping found"
    else
        echo -e "  ${RED}✗${NC} markets mapping NOT found"
    fi
    
    if echo "$PROGRAM_DATA" | grep -q "market_pools"; then
        echo -e "  ${GREEN}✓${NC} market_pools mapping found"
    else
        echo -e "  ${RED}✗${NC} market_pools mapping NOT found"
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "${BLUE}Explorer URL:${NC}"
    echo "${EXPLORER}/program/${PROGRAM_NAME}.aleo"
    echo ""
    
else
    echo -e "${RED}✗ Program NOT found on ${NETWORK}${NC}"
    echo ""
    echo "HTTP Response: ${RESPONSE}"
    echo ""
    echo "The program may not be deployed yet, or the deployment may have failed."
    echo ""
    echo "To deploy, run:"
    echo "  export ALEO_PRIVATE_KEY=<your-private-key>"
    echo "  ./scripts/deploy.sh --network ${NETWORK}"
    exit 1
fi

echo -e "${GREEN}Verification complete!${NC}"
