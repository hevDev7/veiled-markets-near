# Hosted frontend (Railway "web" service). Build context: the repo root, because the app imports ../sdk/src
# through the @sdk alias. Railway: set RAILWAY_DOCKERFILE_PATH=frontend/Dockerfile.
FROM node:22-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci --legacy-peer-deps --no-audit --no-fund
COPY sdk sdk
COPY frontend frontend
RUN cd frontend && npm run build

FROM caddy:2-alpine
COPY frontend/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
