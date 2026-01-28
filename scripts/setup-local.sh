#!/bin/bash

# ============================================================================
# VEILED MARKETS - Local Development Setup
# ============================================================================
# Sets up the local development environment
# ============================================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║         VEILED MARKETS - LOCAL DEVELOPMENT SETUP             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Navigate to project root
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

echo -e "${YELLOW}[1/5] Installing root dependencies...${NC}"
pnpm install
echo -e "  ${GREEN}✓ Root dependencies installed${NC}"
echo ""

echo -e "${YELLOW}[2/5] Building SDK...${NC}"
cd sdk
pnpm install
pnpm build
echo -e "  ${GREEN}✓ SDK built${NC}"
echo ""

echo -e "${YELLOW}[3/5] Installing frontend dependencies...${NC}"
cd ../frontend
pnpm install
echo -e "  ${GREEN}✓ Frontend dependencies installed${NC}"
echo ""

echo -e "${YELLOW}[4/5] Building Leo contracts...${NC}"
cd ../contracts
if command -v leo &> /dev/null; then
    leo build
    echo -e "  ${GREEN}✓ Contracts built${NC}"
else
    echo -e "  ${YELLOW}⚠ Leo CLI not found - skipping contract build${NC}"
    echo -e "  Install Leo CLI from: https://developer.aleo.org/getting_started"
fi
echo ""

echo -e "${YELLOW}[5/5] Setup complete!${NC}"
echo ""

echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    SETUP COMPLETE                             ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "To start development:"
echo ""
echo "  # Start frontend dev server"
echo "  cd frontend && pnpm dev"
echo ""
echo "  # Run SDK tests"
echo "  cd sdk && pnpm test"
echo ""
echo "  # Build contracts"
echo "  cd contracts && leo build"
echo ""
