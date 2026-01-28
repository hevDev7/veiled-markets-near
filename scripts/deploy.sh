#!/bin/bash

# ============================================================================
# VEILED MARKETS - Deployment Script
# ============================================================================
# Deploy the veiled_markets.aleo program to Aleo testnet
# 
# Prerequisites:
# - Aleo CLI installed: https://developer.aleo.org/getting_started
# - ALEO_PRIVATE_KEY environment variable set (or in .env file)
# - Sufficient testnet credits for deployment
#
# Usage:
#   ./scripts/deploy.sh                    # Deploy to testnet (default)
#   ./scripts/deploy.sh --network mainnet  # Deploy to mainnet
#   ./scripts/deploy.sh --dry-run          # Build only, don't deploy
# ============================================================================

set -e

# Load .env file if it exists
SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_ROOT/.env" ]; then
    echo "Loading environment from .env file..."
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration (can be overridden by .env)
PROGRAM_NAME="${ALEO_PROGRAM_NAME:-veiled_markets}"
CONTRACTS_DIR="contracts"
DEFAULT_NETWORK="${ALEO_NETWORK:-testnet}"
NETWORK="${DEFAULT_NETWORK}"
PRIORITY_FEE="${ALEO_PRIORITY_FEE:-1000000}"
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --network)
            NETWORK="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --network <network>   Network to deploy to (testnet/mainnet)"
            echo "  --dry-run             Build only, don't deploy"
            echo "  -h, --help            Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Banner
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           VEILED MARKETS DEPLOYMENT SCRIPT                   ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

# Check Leo CLI
if ! command -v leo &> /dev/null; then
    echo -e "${RED}Error: Leo CLI not found. Please install from https://developer.aleo.org/getting_started${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓ Leo CLI found: $(leo --version)${NC}"

# Check snarkOS CLI (for deployment)
if ! command -v snarkos &> /dev/null && [ "$DRY_RUN" = false ]; then
    echo -e "${RED}Error: snarkOS CLI not found. Please install from https://developer.aleo.org/getting_started${NC}"
    exit 1
fi

if [ "$DRY_RUN" = false ]; then
    echo -e "  ${GREEN}✓ snarkOS CLI found${NC}"
fi

# Check private key
if [ -z "$ALEO_PRIVATE_KEY" ] && [ "$DRY_RUN" = false ]; then
    echo -e "${RED}Error: ALEO_PRIVATE_KEY environment variable not set${NC}"
    echo -e "Set it with: export ALEO_PRIVATE_KEY=<your-private-key>"
    exit 1
fi

if [ "$DRY_RUN" = false ]; then
    echo -e "  ${GREEN}✓ Private key configured${NC}"
fi

echo -e "  ${GREEN}✓ Target network: ${NETWORK}${NC}"
echo ""

# Navigate to contracts directory
echo -e "${YELLOW}[2/6] Navigating to contracts directory...${NC}"
cd "$(dirname "$0")/../${CONTRACTS_DIR}"
echo -e "  ${GREEN}✓ Working directory: $(pwd)${NC}"
echo ""

# Clean previous build
echo -e "${YELLOW}[3/6] Cleaning previous build...${NC}"
rm -rf build/
echo -e "  ${GREEN}✓ Cleaned build directory${NC}"
echo ""

# Build the program
echo -e "${YELLOW}[4/6] Building ${PROGRAM_NAME}.aleo...${NC}"
leo build
echo -e "  ${GREEN}✓ Build successful${NC}"
echo ""

# Run tests
echo -e "${YELLOW}[5/6] Running tests...${NC}"
if [ -d "tests" ]; then
    leo test || echo -e "${YELLOW}  ⚠ Some tests may have failed${NC}"
else
    echo -e "  ${YELLOW}⚠ No test directory found, skipping tests${NC}"
fi
echo ""

# Deploy
echo -e "${YELLOW}[6/6] Deploying to ${NETWORK}...${NC}"

if [ "$DRY_RUN" = true ]; then
    echo -e "  ${YELLOW}⚠ Dry run mode - skipping actual deployment${NC}"
    echo -e "  ${GREEN}✓ Build artifacts ready for deployment${NC}"
else
    # Set network endpoint
    case $NETWORK in
        testnet)
            ENDPOINT="https://api.explorer.provable.com/v1/testnet"
            ;;
        mainnet)
            ENDPOINT="https://api.explorer.provable.com/v1/mainnet"
            ;;
        *)
            echo -e "${RED}Error: Unknown network: ${NETWORK}${NC}"
            exit 1
            ;;
    esac
    
    echo -e "  ${BLUE}Endpoint: ${ENDPOINT}${NC}"
    
    # Deploy using snarkOS
    snarkos developer deploy "${PROGRAM_NAME}.aleo" \
        --private-key "$ALEO_PRIVATE_KEY" \
        --query "${ENDPOINT}" \
        --broadcast "${ENDPOINT}/testnet/transaction/broadcast" \
        --path ./build \
        --priority-fee $PRIORITY_FEE

    echo -e "  ${GREEN}✓ Deployment transaction submitted${NC}"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    DEPLOYMENT COMPLETE                        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DRY_RUN" = false ]; then
    echo -e "Next steps:"
    echo -e "  1. Wait for transaction confirmation (usually 1-2 minutes)"
    echo -e "  2. Verify deployment at: https://testnet.explorer.provable.com/program/${PROGRAM_NAME}.aleo"
    echo -e "  3. Update frontend configuration with deployed program ID"
fi

echo ""
echo -e "${BLUE}Program: ${PROGRAM_NAME}.aleo${NC}"
echo -e "${BLUE}Network: ${NETWORK}${NC}"
