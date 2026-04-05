#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GOVERNANCE_DIR="$PROJECT_ROOT/contracts-governance"
ALEO_HOME="${ALEO_HOME:-$HOME/.aleo}"
TIMEOUT_SECONDS="${LEO_TEST_TIMEOUT:-90}"
MERKLE_TREE_FILE="$ALEO_HOME/registry/testnet/merkle_tree/1/merkle_tree.aleo"

echo "== Governance Leo Tests (raw global registry) =="
echo "Project: $PROJECT_ROOT"
echo "Aleo home: $ALEO_HOME"
echo "Timeout: ${TIMEOUT_SECONDS}s"

if [ ! -d "$ALEO_HOME/registry" ]; then
  echo "Aleo registry not found at $ALEO_HOME/registry"
  exit 1
fi

if [ -f "$MERKLE_TREE_FILE" ] && ! grep -q '^constructor:' "$MERKLE_TREE_FILE"; then
  echo "Global registry still contains a constructor-less merkle_tree dependency:"
  echo "  $MERKLE_TREE_FILE"
  echo "Use pnpm test:governance for the patched temp-registry flow instead."
  exit 2
fi

echo "Note: raw global mode may still fail on constructor assertions embedded in"
echo "testnet dependencies. Use pnpm test:governance for local patched-registry runs."

(
  cd "$GOVERNANCE_DIR"
  timeout "$TIMEOUT_SECONDS" leo test --offline
)
