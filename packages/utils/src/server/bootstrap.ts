import { INestApplication, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from './exception.filter';
import { setupSwagger, SwaggerOptions } from './swagger';

export interface ServiceBootstrapOptions extends SwaggerOptions {
  defaultPort: number;
}

export const API_PREFIX = 'api/v1';

/** Applies the platform-wide HTTP conventions to a Nest application. */
export function configureApp(app: INestApplication, opts: ServiceBootstrapOptions) {
  try {
    app.useLogger(app.get(PinoLogger));
  } catch {
    /* logger module not present (unit tests) */
  }
  app.use(helmet({ contentSecurityPolicy: false }));
  const origins = (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim());
  app.enableCors({
    origin: origins.includes('*') ? true : origins,
    credentials: true,
    exposedHeaders: ['x-request-id', 'Idempotent-Replayed'],
  });
  app.setGlobalPrefix(API_PREFIX, {
    exclude: ['health/live', 'health/ready', 'metrics', '.well-known/jwks.json'],
  });
  app.enableVersioning({ type: VersioningType.HEADER, header: 'x-api-version' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  if (process.env.SWAGGER_ENABLED !== 'false') setupSwagger(app, opts);
  return app;
}

export async function createServiceApp(module: unknown, opts: ServiceBootstrapOptions) {
  const app = await NestFactory.create<NestExpressApplication>(module as never, {
    bufferLogs: true,
    rawBody: true,
  });
  app.set('trust proxy', true);
  return configureApp(app, opts) as NestExpressApplication;
}

/** Entry point used by every service's main.ts. */
export async function bootstrapService(module: unknown, opts: ServiceBootstrapOptions) {
  const app = await createServiceApp(module, opts);
  const port = Number(process.env.PORT ?? opts.defaultPort);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`${opts.name} listening on :${port} (docs at /docs)`);
  return app;
}
