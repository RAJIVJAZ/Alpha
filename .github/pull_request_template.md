## What and why

<!-- What changes, and the problem or request behind it. Link the issue if there is one. -->

## How it was tested

<!-- Commands you ran (pnpm test, pnpm test:integration, flutter test, ...) and what you checked by hand. -->

## Screenshots

<!-- For UI changes (web or mobile): before and after. Delete this section otherwise. -->

## Checklist

- [ ] Database: schema changes come with a Prisma migration (`pnpm db:migrate`), and the migration is safe to run while the previous release is still serving traffic
- [ ] Configuration: new environment variables are in `.env.example`, the Kubernetes ConfigMap or Secrets Manager (`foodgrid/<env>/*`), and the services' env validation
- [ ] Generated files are regenerated, not edited (`pnpm k8s:generate`, `pnpm gateway:routes`, `pnpm docs:openapi`, `pnpm docs:erd`)
- [ ] Docs and READMEs are updated where behaviour changed
