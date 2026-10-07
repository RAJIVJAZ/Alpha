# syntax=docker/dockerfile:1.7
# One image per NestJS service, built from the monorepo root:
#   docker build -f infrastructure/docker/service.Dockerfile --build-arg SERVICE=order-service -t foodgrid/order-service .
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

# ── build: whole workspace install (cached), Prisma client, service + its packages
FROM base AS build
ARG SERVICE
COPY . .
# CA bundle for TLS-intercepting build proxies (optional; absent in CI)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm --filter @foodgrid/database db:generate \
 && pnpm turbo run build --filter="@foodgrid/${SERVICE}..."
# a standalone production tree for this service: workspace packages are packed
# (their "files": dist, generated Prisma client) and only prod deps installed
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter "@foodgrid/${SERVICE}" deploy --prod --legacy /out \
 # optional peers pnpm links from the workspace graph but services never load:
 # next (only @foodgrid/auth/next), and the Prisma CLI + TypeScript (@prisma/client peers)
 && cd /out/node_modules/.pnpm \
 && rm -rf next@* @next+* @img+* sharp@* typescript@* prisma@* effect@* \
 && cd /out && rm -rf src test *.config.js nest-cli.json tsconfig*.json

# ── runtime: compiled JS + production node_modules, non-root
FROM node:${NODE_VERSION}-alpine AS runtime
ARG SERVICE
# each service keeps its well-known port (auth 4001 … ai 4012); the gateway routes to them
ARG PORT=4000
ENV NODE_ENV=production \
    SERVICE=${SERVICE} \
    PORT=${PORT}
# node:alpine already ships libssl 3, which Prisma's linux-musl-openssl-3.0.x engine needs
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE ${PORT}
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s CMD wget -qO- "http://127.0.0.1:${PORT}/health/live" >/dev/null || exit 1
# node runs as PID 1; Nest (enableShutdownHooks) and Next handle SIGTERM themselves
CMD ["node", "dist/main.js"]
