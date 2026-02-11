#!/bin/bash

# ============================================================================
# VEILED MARKETS - Deployment Verification Script
# ============================================================================
# Verify that the deployed Veiled Markets program is available and complete
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULT_NETWORK="testnet"
NETWORK="$DEFAULT_NETWORK"

# Load .env if present
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
fi

PROGRAM_FROM_MANIFEST=""
if [ -f "$PROJECT_ROOT/contracts/program.json" ]; then
    PROGRAM_FROM_MANIFEST="$(sed -n 's/.*"program"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PROJECT_ROOT/contracts/program.json" | head -n 1)"
fi

PROGRAM_NAME="${ALEO_PROGRAM_NAME:-${PROGRAM_FROM_MANIFEST%.aleo}}"
PROGRAM_NAME="${PROGRAM_NAME:-veiled_markets_v4}"
PROGRAM_NAME="${PROGRAM_NAME%.aleo}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --network)
            NETWORK="$2"
            shift 2
            ;;
        --program)
            PROGRAM_NAME="${2%.aleo}"
            shift 2
            ;;
        testnet|mainnet)
            NETWORK="$1"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --network <network>   testnet | mainnet (default: testnet)"
            echo "  --program <name>      Program name with or without .aleo"
            echo "  -h, --help            Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown option: $1${NC}"
            echo "Use --help to see available options."
            exit 1
            ;;
    esac
done

# Set endpoint based on network
case $NETWORK in
    testnet)
        ENDPOINT_DEFAULT="https://api.explorer.provable.com/v1/testnet"
        EXPLORER="https://testnet.explorer.provable.com"
        ;;
    mainnet)
        ENDPOINT_DEFAULT="https://api.explorer.provable.com/v1/mainnet"
        EXPLORER="https://explorer.provable.com"
        ;;
    *)
        echo -e "${RED}Error: Unknown network: ${NETWORK}${NC}"
        echo "Usage: $0 --network [testnet|mainnet] [--program <name>]"
        exit 1
        ;;
esac

if [ -n "$ALEO_RPC_URL" ]; then
    if [[ "$ALEO_RPC_URL" == */testnet || "$ALEO_RPC_URL" == */mainnet ]]; then
        ENDPOINT="${ALEO_RPC_URL%/}"
    else
        ENDPOINT="${ALEO_RPC_URL%/}/${NETWORK}"
    fi
else
    ENDPOINT="$ENDPOINT_DEFAULT"
fi

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

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${PROGRAM_URL}" || true)

if [ -z "$RESPONSE" ] || [ "$RESPONSE" == "000" ]; then
    echo -e "${RED}✗ Could not reach explorer endpoint${NC}"
    echo ""
    echo "Endpoint: ${ENDPOINT}"
    echo "Program URL: ${PROGRAM_URL}"
    echo ""
    echo "Check network connectivity and try again."
    exit 1
fi

if [ "$RESPONSE" == "200" ]; then
    echo -e "${GREEN}✓ Program found on ${NETWORK}!${NC}"
    echo ""
    
    # Get program details
    PROGRAM_DATA=$(curl -s "${PROGRAM_URL}" || true)
    if [ -z "$PROGRAM_DATA" ]; then
        echo -e "${RED}✗ Program endpoint responded but returned empty payload${NC}"
        exit 1
    fi
    
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

    if echo "$PROGRAM_DATA" | grep -q "commit_bet"; then
        echo -e "  ${GREEN}✓${NC} commit_bet transition found"
    else
        echo -e "  ${YELLOW}○${NC} commit_bet transition not found"
    fi

    if echo "$PROGRAM_DATA" | grep -q "reveal_bet"; then
        echo -e "  ${GREEN}✓${NC} reveal_bet transition found"
    else
        echo -e "  ${YELLOW}○${NC} reveal_bet transition not found"
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
