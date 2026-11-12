# Hosted relayer and turbo oracle (Railway "relayer" and "oracle" services). Build context: the repo root.
# Railway: set RAILWAY_DOCKERFILE_PATH=backend/Dockerfile, and pick the service with
#   relayer: SERVICE_SCRIPT=near-relayer.ts
#   oracle:  SERVICE_SCRIPT=near-turbo-oracle.ts  SERVICE_ARGS="--serve --auto-create"
FROM node:22-slim
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend ./
CMD ["sh", "-c", "exec ./node_modules/.bin/tsx src/${SERVICE_SCRIPT:-near-relayer.ts} ${SERVICE_ARGS:-}"]
