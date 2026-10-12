/**
 * `prisma migrate deploy`, retried. On Railway every API service runs it before it starts
 * (infrastructure/railway/*.json), and Prisma gives up waiting for the migration lock after
 * 10 seconds while another service is still applying migrations, as on a first deploy.
 * Applied migrations are skipped, so a retry only finishes what is left.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ATTEMPTS = 6;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const run = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd,
    stdio: 'inherit',
  });
  if (run.status === 0) process.exit(0);
  if (attempt === ATTEMPTS) break;
  console.warn(
    `migrate deploy failed (attempt ${attempt} of ${ATTEMPTS}); retrying in ${attempt * 5}s`,
  );
  sleep(attempt * 5000);
}
process.exit(1);
