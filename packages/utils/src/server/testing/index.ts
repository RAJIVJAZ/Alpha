import { generateKeyPairSync } from 'node:crypto';
import { AccessTokenService, signServiceToken } from '@foodgrid/auth';
import type { AccessTokenClaims } from '@foodgrid/types';

let keys: { privateKey: string; publicKey: string } | undefined;

/**
 * Prepares process.env for integration tests: generates an RS256 key pair,
 * disables background workers and points at the test database. Call before
 * importing the service's AppModule.
 */
export function setupTestEnv(overrides: Record<string, string> = {}) {
  keys ??= generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    SWAGGER_ENABLED: 'false',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ?? 'postgresql://foodgrid:foodgrid@localhost:5432/foodgrid_test',
    REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1',
    JWT_PUBLIC_KEY_BASE64: Buffer.from(keys.publicKey).toString('base64'),
    JWT_PRIVATE_KEY_BASE64: Buffer.from(keys.privateKey).toString('base64'),
    JWT_ISSUER: 'https://auth.test',
    JWT_AUDIENCE: 'foodgrid-api',
    INTERNAL_SERVICE_SECRET: 'test-internal-secret',
    OTP_SECRET: 'test-otp-secret',
    EVENTS_CONSUMER_ENABLED: 'false',
    OUTBOX_RELAY_ENABLED: 'false',
    ...overrides,
  });
}

export function issueTestToken(claims: Partial<AccessTokenClaims> & { sub: string }): string {
  if (!keys) throw new Error('call setupTestEnv() first');
  const svc = new AccessTokenService({
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    issuer: 'https://auth.test',
    audience: 'foodgrid-api',
    accessTtlSeconds: 3600,
  });
  return svc.sign({ roles: ['CUSTOMER'], sid: `test-${claims.sub}`, ...claims });
}

export const issueServiceToken = (service = 'test-service') =>
  signServiceToken(process.env.INTERNAL_SERVICE_SECRET ?? 'test-internal-secret', service);

/** Truncates every table in the given Postgres schemas (fast reset between suites). */
export async function truncateSchemas(
  prisma: { $executeRawUnsafe(sql: string): Promise<unknown>; $queryRawUnsafe<T>(sql: string): Promise<T> },
  schemas: string[],
) {
  const rows = await prisma.$queryRawUnsafe<{ schemaname: string; tablename: string }[]>(
    `SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN (${schemas.map((s) => `'${s}'`).join(',')})`,
  );
  if (!rows.length) return;
  const list = rows.map((r) => `"${r.schemaname}"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export { FakeInternalHttp, type FakeRequest } from './fake-internal-http';
export { createTestApp } from './app';
