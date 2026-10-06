import { DynamicModule, Global, Module, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import Redis from 'ioredis';
import { PrismaModule } from '@foodgrid/database/nest';
import { AuthModule, SESSION_REVOCATION_CHECKER } from '@foodgrid/auth/nest';
import type { EventStream } from '@foodgrid/types';
import { BaseEnv, loadEnv } from './config';
import { CORE_MODULE_OPTIONS } from './core.options';
import { EventsModule } from './events';
import { HealthController } from './health.controller';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { InternalHttpService } from './internal-http.service';
import { initMetrics, MetricsInterceptor } from './metrics';
import { REDIS, RedisModule, revokedSessionKey } from './redis.module';

export interface CoreModuleConfig {
  serviceName: string;
  /** Event streams this service consumes. */
  subscribe?: EventStream[];
  /** Pre-parsed env (defaults to loadEnv()). */
  env?: BaseEnv;
}

/**
 * Cross-cutting infrastructure shared by every microservice: structured
 * logging, Prisma, Redis, JWT auth guard with session revocation, outbox +
 * event consumer, health/metrics endpoints, idempotency and the internal
 * service client.
 */
@Global()
@Module({})
export class CoreModule {
  static forRoot(config: CoreModuleConfig): DynamicModule {
    const env = config.env ?? loadEnv();
    initMetrics(config.serviceName);
    const subscribe = config.subscribe ?? [];

    return {
      module: CoreModule,
      imports: [
        LoggerModule.forRoot({
          // Express 5 / path-to-regexp v8 needs a named wildcard (the library default '*' is deprecated)
          forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
          pinoHttp: {
            level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } }
                : undefined,
            redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-service-token"]'],
            customProps: () => ({ service: config.serviceName }),
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            autoLogging: {
              ignore: (req: IncomingMessage) => !!req.url && (req.url.startsWith('/health') || req.url === '/metrics'),
            },
            serializers: {
              req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
              res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
            },
          },
        }),
        PrismaModule.forRoot(),
        RedisModule.forRoot(env.REDIS_URL),
        AuthModule.forRoot({
          internalSecret: env.INTERNAL_SERVICE_SECRET,
          revocationChecker: {
            provide: SESSION_REVOCATION_CHECKER,
            inject: [REDIS],
            useFactory: (redis: Redis) => ({
              isRevoked: async (sid: string) => (await redis.exists(revokedSessionKey(sid))) === 1,
            }),
          },
        }),
        EventsModule.forRoot({
          serviceName: config.serviceName,
          subscribe,
          consumerEnabled: env.EVENTS_CONSUMER_ENABLED,
          relayEnabled: env.OUTBOX_RELAY_ENABLED,
        }),
      ],
      controllers: [HealthController],
      providers: [
        {
          provide: CORE_MODULE_OPTIONS,
          useValue: { serviceName: config.serviceName, internalSecret: env.INTERNAL_SERVICE_SECRET, subscribe },
        },
        { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
        InternalHttpService,
        IdempotencyInterceptor,
      ],
      exports: [CORE_MODULE_OPTIONS, InternalHttpService, IdempotencyInterceptor],
    };
  }
}
