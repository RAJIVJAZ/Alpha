# Local development

Two ways to run FoodGrid on a laptop: everything in Docker, or the infrastructure in
Docker and the code from source with hot reload. Both use the same `.env` and the same
demo data.

## Prerequisites

| Tool    | Version                                                |
| ------- | ------------------------------------------------------ |
| Node.js | 22 (see `.nvmrc`)                                      |
| pnpm    | 10.28 (`corepack enable` picks it from `package.json`) |
| Docker  | with Compose v2                                        |
| OpenSSL | for `pnpm keys:generate`                               |
| Flutter | 3.47 (mobile apps only)                                |

## First run

```bash
cp .env.example .env
pnpm keys:generate          # writes JWT_PRIVATE_KEY_BASE64 / JWT_PUBLIC_KEY_BASE64 into .env
pnpm install
```

`.env.example` is set up for local work: Postgres and Redis on localhost, MinIO as S3,
OTP codes returned in the API response (`OTP_EXPOSE_IN_RESPONSE=true`) and every
outside provider (SMS, push, email, payments) in sandbox or log-only mode.

### Option A: everything in Docker

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d --build
docker compose -f infrastructure/docker/docker-compose.yml --profile seed run --rm seed
```

The `migrate` service applies the Prisma migrations before the services start; the
`seed` profile resets the database and loads the demo data. The first build takes a
while (one image per service and web app).

### Option B: code from source

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis minio minio-init
pnpm db:generate            # Prisma client
pnpm db:deploy              # migrations
pnpm db:seed                # demo data (resets the database)
pnpm build:packages         # shared packages, which the services load from dist/
pnpm dev:services           # the 12 services with nest --watch
pnpm dev:gateway            # the API gateway on :8080 (separate terminal)
pnpm dev:web                # the six web apps (separate terminal)
```

After changing a shared package (`packages/types`, `utils`, `auth`, `database`), rebuild
it (`pnpm build:packages`) so the services pick it up.

## Ports

| What                      | Port        | URL                                             |
| ------------------------- | ----------- | ----------------------------------------------- |
| API gateway               | 8080        | http://localhost:8080/api/v1                    |
| customer-web              | 3000        | http://localhost:3000                           |
| admin-web                 | 3001        | http://localhost:3001                           |
| restaurant-web            | 3002        | http://localhost:3002                           |
| supplier-web              | 3003        | http://localhost:3003                           |
| rider-web                 | 3004        | http://localhost:3004                           |
| vendor-web                | 3005        | http://localhost:3005                           |
| auth-service … ai-service | 4001–4012   | `/health/ready`, `/metrics`, Swagger at `/docs` |
| Postgres                  | 5432        |                                                 |
| Redis                     | 6379        |                                                 |
| MinIO (S3) / console      | 9000 / 9001 |                                                 |

Service ports in order: auth 4001, user 4002, order 4003, payment 4004, inventory 4005,
procurement 4006, delivery 4007, supplier 4008, analytics 4009, ads 4010,
notification 4011, ai 4012. The gateway routes `/api/v1/*` to them
(`infrastructure/gateway/routes.json`, regenerated with `pnpm gateway:routes`) and
`/ws` to the delivery service's socket.

## Demo accounts

The seed prints these when it finishes. Staff and merchant accounts share the password
`FoodGrid@2026` (override with `SEED_PASSWORD`).

| Who                     | Sign in with                                            | App                             |
| ----------------------- | ------------------------------------------------------- | ------------------------------- |
| Customer                | `+919845000001` (OTP)                                   | customer-web, customer-mobile   |
| Riders                  | `+919740010101`, `…102`, … (OTP)                        | rider-web, rider-mobile         |
| Restaurant owner / chef | `owner@spicegarden.demo`, `chef@spicegarden.demo`       | restaurant-web, merchant-mobile |
| Food cart               | `owner@annapurna.demo`                                  | vendor-web, merchant-mobile     |
| Supplier                | `owner@bharat.demo`                                     | supplier-web                    |
| Back office             | `admin@foodgrid.dev`, `finance@…`, `ops@…`, `support@…` | admin-web                       |

With `OTP_EXPOSE_IN_RESPONSE=true` the OTP request returns the code as `devCode`, and
the web and mobile login screens show it under the code field. OTP requests are rate-limited; to reset during testing,
delete the Redis keys for that phone (`redis-cli --scan --pattern 'otp:*'`).

## Mobile apps against the local API

```bash
cd apps/customer-mobile        # or rider-mobile, merchant-mobile
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:8080/api/v1   # Android emulator
flutter run --dart-define=API_URL=http://localhost:8080/api/v1  # iOS simulator, desktop
```

On a physical phone use your machine's LAN address. Google sign-in needs
`--dart-define=GOOGLE_SERVER_CLIENT_ID=…`; each app's README lists its options.
Push notifications need the Firebase files of a project ("Push notifications" in
each app's README); without them the apps run with push off.

## Useful commands

| Command                                      | What it does                                                     |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | across the monorepo (Turborepo)                                  |
| `pnpm test:integration`                      | e2e suites against `foodgrid_test` (see [testing](./testing.md)) |
| `pnpm format`                                | Prettier                                                         |
| `pnpm db:migrate`                            | create a migration after a schema change                         |
| `pnpm docs:openapi`                          | regenerate `docs/api` from the running code                      |
| `pnpm docs:erd`                              | regenerate `docs/database`                                       |
| `pnpm k8s:generate`                          | regenerate `infrastructure/kubernetes/base`                      |

## Common problems

- **Services fail at startup on `JWT_PUBLIC_KEY_BASE64`**: the keys are missing from `.env`;
  run `pnpm keys:generate`.
- **A service can't find a shared package's export**: `pnpm build:packages`, then
  restart the service.
- **429 on OTP**: the per-phone limit; clear that phone's `otp:*` keys in Redis.
- **Prisma "table does not exist"**: `pnpm db:deploy`, or reseed with `pnpm db:seed`.
- **Uploads fail**: MinIO must be up and the bucket created (`minio-init` does it).
