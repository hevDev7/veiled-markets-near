# Hosted relayer, turbo oracle and AI resolver (Railway "relayer", "oracle" and "ai-resolver" services). Build
# context: the repo root. Railway: set RAILWAY_DOCKERFILE_PATH=backend/Dockerfile, and pick the service with
#   relayer:     SERVICE_SCRIPT=near-relayer.ts
#   oracle:      SERVICE_SCRIPT=near-turbo-oracle.ts  SERVICE_ARGS="--serve --auto-create"
#   ai-resolver: SERVICE_SCRIPT=near-ai-resolver.ts   with a volume mounted at AI_RECEIPTS_DIR (its receipts must
#                outlive a redeploy: votes on chain link them) and AI_RESOLVER_PUBLIC_URL set to its public address
FROM node:22-slim
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend ./
CMD ["sh", "-c", "exec ./node_modules/.bin/tsx src/${SERVICE_SCRIPT:-near-relayer.ts} ${SERVICE_ARGS:-}"]
