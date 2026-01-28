#!/bin/bash

# ============================================================================
# VEILED MARKETS - Environment Check Script
# ============================================================================
# Validates that all required environment variables are configured
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load .env file if it exists
SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
fi

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           VEILED MARKETS - ENVIRONMENT CHECK                  ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

ERRORS=0
WARNINGS=0

# Function to check required variable
check_required() {
    local var_name=$1
    local var_value="${!var_name}"
    
    if [ -z "$var_value" ]; then
        echo -e "  ${RED}✗ $var_name is NOT SET (required)${NC}"
        ((ERRORS++))
    else
        # Mask sensitive values
        if [[ "$var_name" == *"PRIVATE"* ]] || [[ "$var_name" == *"KEY"* ]]; then
            echo -e "  ${GREEN}✓ $var_name is set (${var_value:0:10}...)${NC}"
        else
            echo -e "  ${GREEN}✓ $var_name = $var_value${NC}"
        fi
    fi
}

# Function to check optional variable
check_optional() {
    local var_name=$1
    local default=$2
    local var_value="${!var_name}"
    
    if [ -z "$var_value" ]; then
        echo -e "  ${YELLOW}○ $var_name is not set (default: $default)${NC}"
        ((WARNINGS++))
    else
        echo -e "  ${GREEN}✓ $var_name = $var_value${NC}"
    fi
}

# Check deployment variables
echo -e "${YELLOW}Deployment Variables:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_required "ALEO_PRIVATE_KEY"
check_optional "ALEO_ADDRESS" "derived from private key"
check_optional "ALEO_VIEW_KEY" "derived from private key"
echo ""

# Check network variables
echo -e "${YELLOW}Network Variables:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_optional "ALEO_NETWORK" "testnet"
check_optional "ALEO_RPC_URL" "https://api.explorer.provable.com/v1/testnet"
check_optional "ALEO_BROADCAST_URL" "auto"
check_optional "ALEO_PRIORITY_FEE" "1000000"
echo ""

# Check program variables
echo -e "${YELLOW}Program Variables:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_optional "ALEO_PROGRAM_NAME" "veiled_markets"
echo ""

# Check frontend .env
echo -e "${YELLOW}Frontend Variables (.env):${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "$PROJECT_ROOT/frontend/.env" ]; then
    echo -e "  ${GREEN}✓ frontend/.env exists${NC}"
    
    # Source frontend env (with VITE_ prefix)
    set -a
    source "$PROJECT_ROOT/frontend/.env"
    set +a
    
    check_optional "VITE_NETWORK" "testnet"
    check_optional "VITE_PROGRAM_ID" "veiled_markets.aleo"
    check_optional "VITE_ENABLE_DEMO_MODE" "true"
else
    echo -e "  ${YELLOW}○ frontend/.env does not exist${NC}"
    echo -e "    Run: cp frontend/.env.example frontend/.env"
    ((WARNINGS++))
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}Found $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo ""
    echo "To fix:"
    echo "  1. Copy .env.example to .env"
    echo "  2. Fill in the required values"
    echo "  3. Run this script again"
    echo ""
    exit 1
else
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}All required variables set. $WARNINGS optional variable(s) using defaults.${NC}"
    else
        echo -e "${GREEN}All environment variables configured correctly!${NC}"
    fi
    echo ""
    echo "Ready for deployment. Run:"
    echo "  pnpm deploy:testnet"
    echo ""
fi
