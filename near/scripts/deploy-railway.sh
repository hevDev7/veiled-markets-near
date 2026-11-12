#!/usr/bin/env bash
# Uploads the committed HEAD to the hosted demo's Railway services. Railway has no GitHub link for this repo, so a
# push alone does not deploy. Only committed files are uploaded (git archive), never the working tree.
# Usage: near/scripts/deploy-railway.sh [service ...]      default: web relayer
# The oracle is redeployed only when named: two oracle instances must never run at once.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f near/env.local.sh ] && source near/env.local.sh
PROJECT=ad486837-cb32-48b5-9cb7-42176c86594c
RAILWAY=${RAILWAY_BIN:-$(command -v railway || echo "$HOME/.npm/_npx/d991ede4b4a6395c/node_modules/@railway/cli/bin/railway")}
[ $# -eq 0 ] && set -- web relayer

REV=$(git rev-parse --short HEAD)
DIR=${BUILD_CACHE:-/tmp}/railway-upload-$REV
mkdir -p "$DIR"
git archive HEAD frontend sdk backend .dockerignore | tar -x -C "$DIR"
cd "$DIR"
for service in "$@"; do
  echo "== $service <- $REV"
  "$RAILWAY" up --project "$PROJECT" --environment production --service "$service" --detach
done
