import {
  DynamicModule,
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');
export const InjectRedis = () => Inject(REDIS);

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger('Redis');
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    redis.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }
  async onApplicationShutdown() {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

@Global()
@Module({})
export class RedisModule {
  static forRoot(url: string): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        {
          provide: REDIS,
          useFactory: () =>
            new Redis(url, {
              maxRetriesPerRequest: 3,
              enableReadyCheck: true,
              // connect on first command: tooling (e.g. OpenAPI generation) can build the app without Redis
              lazyConnect: true,
            }),
        },
        RedisLifecycle,
      ],
      exports: [REDIS],
    };
  }
}

/** Redis-backed session revocation list consulted by AuthGuard. */
export const revokedSessionKey = (sid: string) => `auth:revoked:${sid}`;
