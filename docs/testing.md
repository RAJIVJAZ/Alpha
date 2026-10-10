# Testing

| Layer                               | What it covers                                                                                                                                                      | Where                                                                                           | Run                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Unit (Jest + ts-jest)               | Pure logic: state machines, pricing, coupons, GST, money, delivery fees and dispatch scoring, OTP and permission rules, tenant scoping, the outbox consumer, guards | `*.spec.ts` next to the code in `packages/{auth,database,utils,types}/src` and `services/*/src` | `pnpm test`                                        |
| Integration (e2e, Jest + supertest) | A service's real `AppModule` over HTTP against PostgreSQL and Redis: auth flows, checkout and order lifecycle, payments and the wallet ledger, stock, procurement   | `services/*/test/*.e2e-spec.ts` (auth, order, payment, inventory, procurement, delivery)        | `pnpm test:integration`                            |
| Flutter (widget + unit)             | Whole-app widget tests with fake HTTP, socket, storage and location; `foodgrid_core` units                                                                          | `packages/flutter_core/test`, `apps/*-mobile/test`                                              | `flutter test`                                     |
| Web apps                            | No test suites; TypeScript, ESLint and `next build`                                                                                                                 | `apps/*-web`, `packages/ui`                                                                     | `pnpm typecheck`, `pnpm lint`, `pnpm build`        |
| Static                              | Prettier, ESLint, `tsc --noEmit`, generated files up to date                                                                                                        | whole repository                                                                                | `pnpm format:check`, `pnpm lint`, `pnpm typecheck` |

## Unit tests

```sh
pnpm test                                             # every package (Turborepo builds the shared packages first)
pnpm --filter @foodgrid/order-service test            # one package
pnpm --filter @foodgrid/order-service test -- src/domain/order-state.spec.ts   # one file
```

Each package's `jest.config.js` maps `@foodgrid/*` imports to the packages' `src`, so a
single package runs without building the others; only the Prisma client must exist
(`pnpm db:generate`, done by `pnpm install` in CI's setup and by `pnpm build`). No
database or Redis is needed. `packages/database/test/enum-parity.spec.ts` fails when the
Prisma enums and the enums in `@foodgrid/types` drift apart.

## Integration tests

Every service has a `test:integration` script (`jest -c jest.integration.config.js --runInBand`,
30 s timeout, `passWithNoTests`). Suites exist today for auth-service, order-service,
payment-service, inventory-service, procurement-service and delivery-service.

How a suite is set up (`packages/utils/src/server/testing`):

- `test/setup-env.ts` calls `setupTestEnv()` before `AppModule` is imported. It generates
  an RS256 key pair, sets `DATABASE_URL` from `TEST_DATABASE_URL` (default
  `postgresql://foodgrid:foodgrid@localhost:5432/foodgrid_test`) and `REDIS_URL` from
  `TEST_REDIS_URL` (default `redis://localhost:6379/1`), and turns off the background
  workers (`EVENTS_CONSUMER_ENABLED=false`, `OUTBOX_RELAY_ENABLED=false`) and Swagger.
- `createTestApp(AppModule, SERVICE, (b) => b.overrideProvider(InternalHttpService).useValue(http))`
  boots the module with the production HTTP conventions (prefix, validation, error
  envelope). `FakeInternalHttp` answers the calls the service makes to other services
  and records them.
- `issueTestToken({ sub, roles, tenantId, tenantRole, … })` signs access tokens with the
  generated key; `issueServiceToken()` signs service tokens for `/internal` routes.
- Events are checked where they are written: suites assert on `platform.OutboxEvent`
  rows, and call handler methods directly (for example
  `InventoryEventHandlers.consumeForOrder`) instead of going through Redis.
- Test data is created by each suite with fixed ids (`tnt_test_kitchen`, …); the demo
  seed is not used. Suites start with `truncateSchemas(prisma, [...])` for the schemas
  they touch and `redis.flushdb()`.

**Never point `TEST_DATABASE_URL` or `TEST_REDIS_URL` at data you care about**: the
suites truncate tables and flush the Redis database.

Running them locally (PostgreSQL and Redis on localhost, see
[local-development.md](./local-development.md#2-from-source)):

```sh
psql postgresql://foodgrid:foodgrid@localhost:5432/foodgrid -c 'CREATE DATABASE foodgrid_test'
DATABASE_URL=postgresql://foodgrid:foodgrid@localhost:5432/foodgrid_test pnpm db:deploy

pnpm test:integration                                     # all services, one at a time
pnpm --filter @foodgrid/order-service test:integration    # one service
```

Run `pnpm db:deploy` against the test database again after pulling new migrations. To
use other URLs, set `TEST_DATABASE_URL` / `TEST_REDIS_URL`; through Turborepo add
`--env-mode=loose` (`pnpm test:integration --env-mode=loose`), because its strict
environment mode only passes the variables declared in `turbo.json` to tasks.
`pnpm --filter` runs the script directly and passes everything.

## Flutter tests

Flutter 3.47 (Dart ^3.13.5), from each package directory:

```sh
cd packages/flutter_core && flutter pub get && flutter analyze && flutter test
cd apps/customer-mobile  && flutter pub get --enforce-lockfile && flutter analyze && flutter test
```

The app tests pump the whole app inside a `ProviderScope` with overrides instead of real
services: a fake Dio `HttpClientAdapter` that answers registered routes and records
requests (`FakeApi` / `FakeBackend` in each app's `test/` helpers), `MemoryTokenStore`,
`FakeSocketTransport` from `foodgrid_core` (tests read what the app emitted and play
server events such as `rider:location` or `offer:new`), and a fake `LocationService` in
the rider app. No network or device is needed. Each app's README lists what its tests
cover.

## What CI runs

`.github/workflows/ci.yml` on every pull request and push to `main`:

| Job                     | Steps                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format, lint, typecheck | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, then `pnpm gateway:routes` and `pnpm k8s:generate` must leave `infrastructure/gateway`, `infrastructure/docker/nginx` and `infrastructure/kubernetes/base` unchanged |
| Unit tests              | `pnpm test`                                                                                                                                                                                                              |
| Integration tests       | PostgreSQL 16 and Redis 7 service containers, `pnpm db:deploy` into `foodgrid_test`, `pnpm test:integration --env-mode=loose` with `TEST_REDIS_URL=redis://localhost:6379/1`                                             |
| Build                   | `pnpm build` (all packages, services and web apps)                                                                                                                                                                       |
| Docker                  | builds `service.Dockerfile` (order-service), `web.Dockerfile` (customer-web) and `migrate.Dockerfile` without pushing                                                                                                    |
| CI result               | one required check that fails if any job above failed or was skipped                                                                                                                                                     |

`.github/workflows/flutter.yml`, when `packages/flutter_core` or `apps/*-mobile`
change: `flutter pub get` (with `--enforce-lockfile` for the apps), `flutter analyze` and
`flutter test` for each package; on `main` also `flutter build apk --debug` for the three
apps. `dart format` is not enforced yet: the Dart code is not formatted.

`.github/workflows/terraform.yml`, when `infrastructure/terraform` changes:
`terraform fmt -check`, `init -backend=false` and `validate` for every root, and on pull
requests a read-only `terraform plan` when `AWS_TERRAFORM_PLAN_ROLE_ARN` is set.

## Before you open a pull request

```sh
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration                      # if you touched a service with e2e suites
pnpm gateway:routes && pnpm k8s:generate   # if you changed routes or workloads; commit the result
```

When you change a service's routes, also run `pnpm build && pnpm docs:openapi` so
`docs/api` (and from it the gateway routes) stays current.
