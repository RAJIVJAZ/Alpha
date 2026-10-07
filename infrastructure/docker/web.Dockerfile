# syntax=docker/dockerfile:1.7
# One image per Next.js app (standalone server), built from the monorepo root:
#   docker build -f infrastructure/docker/web.Dockerfile --build-arg APP=customer-web -t foodgrid/customer-web .
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS build
ARG APP
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter="@foodgrid/${APP}..."

FROM node:${NODE_VERSION}-alpine AS runtime
ARG APP
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    APP=${APP}
WORKDIR /app
# the standalone bundle mirrors the monorepo layout from outputFileTracingRoot
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD wget -qO- "http://127.0.0.1:${PORT}/login" >/dev/null || exit 1
# node runs as PID 1; Nest (enableShutdownHooks) and Next handle SIGTERM themselves
CMD ["sh", "-c", "exec node apps/${APP}/server.js"]
