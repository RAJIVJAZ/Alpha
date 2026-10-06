import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma skips automatic .env loading when a config file is present, so load
// the package-level .env first and fall back to the monorepo root .env.
config({ path: [path.resolve(__dirname, '.env'), path.resolve(__dirname, '../../.env')], quiet: true });

export default defineConfig({
  schema: path.join('prisma', 'schema'),
  migrations: {
    path: path.join('prisma', 'schema', 'migrations'),
    seed: 'tsx prisma/seed/index.ts',
  },
});
