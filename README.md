# FoodGrid

A multi-tenant food commerce platform: consumer delivery and dine-in ordering
(Swiggy/Zomato-style), a restaurant and food-cart ERP (POS, kitchen display, inventory,
production, costing, purchasing), and a B2B supply marketplace for suppliers,
wholesalers and retailers with an AI-assisted procurement engine.

## What's here

| Area           | Path                              | What it is                                                                                                                                              |
| -------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web apps       | `apps/customer-web`               | Storefront: discovery, menus, cart, checkout, tracking, QR table ordering                                                                               |
|                | `apps/restaurant-web`             | Restaurant ERP: orders, KDS, menu, inventory, production, costing, procurement, POs, reports                                                            |
|                | `apps/vendor-web`                 | Food carts (POS, QR ordering, inventory, purchasing), retailers (delivery slots, retail analytics) and wholesalers (bulk pricing, dealers, territories) |
|                | `apps/supplier-web`               | Supplier console: orders, products and stock, delivery zones, payouts                                                                                   |
|                | `apps/rider-web`                  | Rider duty, offers, deliveries, earnings                                                                                                                |
|                | `apps/admin-web`                  | Back office: approvals, users, finance, CMS, ads, operations                                                                                            |
| Mobile apps    | `apps/customer-mobile`            | Flutter ordering app                                                                                                                                    |
|                | `apps/rider-mobile`               | Flutter delivery partner app                                                                                                                            |
|                | `apps/merchant-mobile`            | Flutter app for restaurants and food carts                                                                                                              |
| Services       | `services/*-service`              | 12 NestJS services: auth, user, order, payment, inventory, procurement, delivery, supplier, analytics, ads, notification, ai                            |
| Packages       | `packages/database`               | Prisma schema (12 PostgreSQL schemas), migrations, seed                                                                                                 |
|                | `packages/types`, `utils`, `auth` | Shared types, server toolkit (events, locks, metrics), JWT/permissions and Next.js auth routes                                                          |
|                | `packages/ui`                     | Shared React UI (Tailwind) for all web apps                                                                                                             |
|                | `packages/flutter_core`           | Shared Flutter foundation: API client, session, socket, widgets                                                                                         |
| Infrastructure | `infrastructure/docker`           | Dockerfiles and the local docker-compose stack                                                                                                          |
|                | `infrastructure/kubernetes`       | Kustomize base (generated) and staging/production overlays                                                                                              |
|                | `infrastructure/monitoring`       | ServiceMonitor, alert rules, Grafana dashboard                                                                                                          |
|                | `infrastructure/terraform`        | AWS: VPC, EKS, RDS, ElastiCache, S3/CloudFront, IAM, secrets                                                                                            |
| CI/CD          | `.github/workflows`               | CI, image builds, staging and production deploys, Flutter and Terraform checks                                                                          |

## Architecture in brief

Web apps proxy API calls server-side (tokens live in httpOnly cookies); mobile apps
call the API gateway directly. The gateway routes `/api/v1/*` to the services and `/ws`
to the realtime socket. Each service owns one PostgreSQL schema; services talk through
domain events (transactional outbox → Redis Streams → consumer groups) and a few
internal HTTP calls. Every business is a tenant, and access is decided by role-based
permissions carried in short-lived JWTs with rotating refresh tokens.

More in [docs/architecture.md](docs/architecture.md).

## Quick start

```bash
cp .env.example .env
pnpm keys:generate
pnpm install
docker compose -f infrastructure/docker/docker-compose.yml up -d --build
docker compose -f infrastructure/docker/docker-compose.yml --profile seed run --rm seed
```

Then open http://localhost:3000 (storefront) and sign in with `+919845000001`; the OTP
is shown on screen in development. Restaurant staff use `owner@spicegarden.demo` with
password `FoodGrid@2026` at http://localhost:3002. All ports, demo accounts, running
from source with hot reload, and the mobile apps are in
[docs/local-development.md](docs/local-development.md).

## Common scripts

| Command                                                             | Does                                              |
| ------------------------------------------------------------------- | ------------------------------------------------- |
| `pnpm build`                                                        | build everything (Turborepo)                      |
| `pnpm dev:services` / `pnpm dev:web` / `pnpm dev:gateway`           | run from source                                   |
| `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` | checks                                            |
| `pnpm format` / `pnpm format:check`                                 | Prettier                                          |
| `pnpm db:migrate`, `pnpm db:deploy`, `pnpm db:seed`                 | database                                          |
| `pnpm docs:openapi`, `pnpm docs:erd`                                | regenerate API and data model docs                |
| `pnpm gateway:routes`, `pnpm k8s:generate`                          | regenerate gateway routes and the Kubernetes base |

## Documentation

| Doc                                             | Covers                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| [Architecture](docs/architecture.md)            | contexts, services, events, tenancy, auth, payments, delivery, realtime |
| [Events](docs/events.md)                        | every domain event, producer, consumers and payload                     |
| [API reference](docs/api/README.md)             | every route, generated from the OpenAPI documents                       |
| [Data model](docs/database/README.md)           | ER diagrams per schema, generated from Prisma                           |
| [Local development](docs/local-development.md)  | running it on a laptop                                                  |
| [Testing](docs/testing.md)                      | test layers and how to run them                                         |
| [Deployment](docs/deployment.md)                | Terraform, GitHub setup, CI/CD, rollback                                |
| [Runbooks](docs/runbooks.md)                    | what to do when an alert fires                                          |
| [Terraform](infrastructure/terraform/README.md) | infrastructure step by step                                             |

## Status

The services, web apps and mobile apps run end to end locally against the seeded data,
and the unit, integration and Flutter test suites pass. Not yet exercised: a real AWS
account (Terraform is validated, not applied), the GitHub workflows on GitHub, Android
and iOS builds of the mobile apps, and live Razorpay, SMS, push and email providers
(local runs use their sandbox or log-only modes).
