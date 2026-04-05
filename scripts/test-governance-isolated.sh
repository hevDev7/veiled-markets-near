#!/bin/bash

# ============================================================================
# VEILED MARKETS - Governance Leo Test Runner (cached patched home)
# ============================================================================
# Why this exists:
# - `contracts-governance` depends on Leo registry entries under `~/.aleo/registry`
# - several testnet registry sources do not replay cleanly on fresh local
#   ledgers under newer consensus rules
# - this script avoids mutating the user's real `~/.aleo` directory:
#   - copies the global registry into a cached HOME under `/tmp`
#   - normalizes constructors only in the cached copy
#   - reuses existing proving resources from `~/.aleo/resources`
#   - runs `leo test --offline` against that cached HOME
# - Leo does not appear to persist a reusable local ledger in this setup, so
#   the main benefit here is avoiding registry copy/patch work on every run.
#
# Usage:
#   ./scripts/test-governance-isolated.sh
#   LEO_TEST_TIMEOUT=180 ./scripts/test-governance-isolated.sh
#   GOVERNANCE_REBUILD_CACHE=1 ./scripts/test-governance-isolated.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GOVERNANCE_DIR="$PROJECT_ROOT/contracts-governance"

GLOBAL_ALEO_HOME="${ALEO_HOME:-$HOME/.aleo}"
CACHE_ROOT="${GOVERNANCE_CACHE_ROOT:-/tmp/veiled-governance-cache}"
CACHE_HOME="$CACHE_ROOT/home"
CACHE_ALEO_HOME="$CACHE_HOME/.aleo"
CACHE_REGISTRY="$CACHE_ALEO_HOME/registry"
STATE_FILE="$CACHE_ROOT/state.env"
TIMEOUT_SECONDS="${LEO_TEST_TIMEOUT:-90}"
REBUILD_CACHE="${GOVERNANCE_REBUILD_CACHE:-0}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}== Governance Leo Tests (cached patched home) ==${NC}"
echo "Project: $PROJECT_ROOT"
echo "Global Aleo home: $GLOBAL_ALEO_HOME"
echo "Cache root: $CACHE_ROOT"
echo "Timeout: ${TIMEOUT_SECONDS}s"

if ! command -v leo >/dev/null 2>&1; then
  echo "Leo CLI not found in PATH."
  exit 1
fi

if [ ! -d "$GLOBAL_ALEO_HOME/registry" ]; then
  echo "Aleo registry not found at $GLOBAL_ALEO_HOME/registry"
  echo "Run a normal Leo command once on a machine with network access first."
  exit 1
fi

mkdir -p "$CACHE_ROOT"

if [ "$REBUILD_CACHE" = "1" ] && [ -d "$CACHE_HOME" ]; then
  echo -e "${YELLOW}Rebuilding cached patched Leo home...${NC}"
  rm -rf "$CACHE_HOME"
fi

if [ ! -d "$CACHE_HOME" ]; then
  mkdir -p "$CACHE_ALEO_HOME"
  cp -R "$GLOBAL_ALEO_HOME/registry" "$CACHE_REGISTRY"

  if [ -d "$GLOBAL_ALEO_HOME/resources" ]; then
    ln -s "$GLOBAL_ALEO_HOME/resources" "$CACHE_ALEO_HOME/resources"
  fi

  PATCHED_COUNT=0
  while IFS= read -r program_file; do
    if [ $PATCHED_COUNT -eq 0 ]; then
      echo -e "${YELLOW}Normalizing registry constructors in the cached copy...${NC}"
    fi
    printf '  - %s\n' "${program_file#$CACHE_REGISTRY/}"
    patched_file="${program_file}.patched"
    awk '
      BEGIN { in_constructor = 0; replaced = 0 }
      /^constructor:/ {
        if (!replaced) {
          print "constructor:"
          print "    assert.eq edition 0u16;"
          replaced = 1
        }
        in_constructor = 1
        next
      }
      {
        if (!in_constructor) {
          print $0
        }
      }
      END {
        if (!replaced) {
          print ""
          print "constructor:"
          print "    assert.eq edition 0u16;"
        }
      }
    ' "$program_file" > "$patched_file"
    mv "$patched_file" "$program_file"
    PATCHED_COUNT=$((PATCHED_COUNT + 1))
  done < <(find "$CACHE_REGISTRY/testnet" -type f -name '*.aleo' | sort)

  {
    echo "CACHE_HOME=$CACHE_HOME"
    echo "GLOBAL_ALEO_HOME=$GLOBAL_ALEO_HOME"
    echo "PATCHED_AT=$(date +%Y-%m-%dT%H:%M:%S)"
  } > "$STATE_FILE"
else
  echo -e "${BLUE}Reusing cached patched Leo home.${NC}"
fi

echo -e "${BLUE}Running governance package tests with the cached patched home...${NC}"
(
  cd "$GOVERNANCE_DIR"
  HOME="$CACHE_HOME" timeout "$TIMEOUT_SECONDS" leo test --offline
)
STATUS=$?

echo
if [ $STATUS -eq 0 ]; then
  echo -e "${GREEN}Governance package tests finished successfully.${NC}"
else
  echo -e "${YELLOW}Governance package tests exited with status $STATUS.${NC}"
fi

exit $STATUS
