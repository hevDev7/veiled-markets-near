#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "== Governance Smoke Tests =="
echo "Project: $PROJECT_ROOT"
echo "Mode: fast logic suite + governance compile"

(
  cd "$PROJECT_ROOT"
  pnpm test:governance:logic
)

(
  cd "$PROJECT_ROOT/contracts-governance"
  leo build
)

echo "Governance smoke checks finished."
