import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/**
 * Runs `fn` only if this replica acquires the lock. Used to make @Cron jobs
 * single-flight across horizontally scaled pods. Returns undefined when the
 * lock is held elsewhere.
 */
export async function withLock<T>(
  redis: Redis,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const token = randomUUID();
  const acquired = await redis.set(`lock:${key}`, token, 'EX', ttlSeconds, 'NX');
  if (!acquired) return undefined;
  try {
    return await fn();
  } finally {
    await redis.eval(RELEASE_SCRIPT, 1, `lock:${key}`, token).catch(() => undefined);
  }
}
