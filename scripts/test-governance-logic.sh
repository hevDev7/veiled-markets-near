#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOGIC_DIR="$PROJECT_ROOT/contracts-governance-logic"
TMP_HOME="$(mktemp -d /tmp/veiled-governance-logic.XXXXXX)"
GLOBAL_ALEO_HOME="${ALEO_HOME:-$HOME/.aleo}"
TIMEOUT_SECONDS="${LEO_TEST_TIMEOUT:-90}"

cleanup() {
  rm -rf "$TMP_HOME"
}
trap cleanup EXIT

echo "== Governance Logic Tests (standalone Leo home) =="
echo "Project: $PROJECT_ROOT"
echo "Logic package: $LOGIC_DIR"
echo "Temporary HOME: $TMP_HOME"
echo "Timeout: ${TIMEOUT_SECONDS}s"

mkdir -p "$TMP_HOME/.aleo"
if [ -d "$GLOBAL_ALEO_HOME/resources" ]; then
  ln -s "$GLOBAL_ALEO_HOME/resources" "$TMP_HOME/.aleo/resources"
fi

(
  cd "$LOGIC_DIR"
  HOME="$TMP_HOME" timeout "$TIMEOUT_SECONDS" leo test --offline
)
