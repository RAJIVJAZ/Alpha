# syntax=docker/dockerfile:1.7
# Database tooling image: applies Prisma migrations (default) and can seed demo data.
#   docker build -f infrastructure/docker/migrate.Dockerfile -t foodgrid/migrate .
#   docker run --rm -e DATABASE_URL=... foodgrid/migrate                  # prisma migrate deploy
#   docker run --rm -e DATABASE_URL=... foodgrid/migrate db:seed -- --reset   # demo data (never in production)
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile --filter "@foodgrid/database..." \
 && pnpm --filter @foodgrid/database db:generate \
 && chown -R node:node /repo/packages/database
USER node
WORKDIR /repo/packages/database
ENTRYPOINT ["pnpm"]
CMD ["db:deploy"]
