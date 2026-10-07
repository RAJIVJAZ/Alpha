import { z } from 'zod';

/** Environment shared by every backend service. Validated at startup (fail fast). */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_PUBLIC_KEY_BASE64: z.string().min(1),
  JWT_PRIVATE_KEY_BASE64: z.string().optional(),
  JWT_ISSUER: z.string().default('https://auth.foodgrid.local'),
  JWT_AUDIENCE: z.string().default('foodgrid-api'),
  INTERNAL_SERVICE_SECRET: z.string().min(8),
  CORS_ORIGINS: z.string().default('*'),
  EVENTS_CONSUMER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  OUTBOX_RELAY_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/**
 * Parses process.env against the base schema merged with a service-specific
 * extension. Throws a readable error listing every invalid variable.
 */
export function loadEnv<T extends z.ZodRawShape>(
  extension?: T,
  env: NodeJS.ProcessEnv = process.env,
): BaseEnv & z.infer<z.ZodObject<T>> {
  const schema = extension ? baseEnvSchema.extend(extension) : baseEnvSchema;
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data as BaseEnv & z.infer<z.ZodObject<T>>;
}
