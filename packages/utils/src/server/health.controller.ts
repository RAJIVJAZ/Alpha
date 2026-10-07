import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrismaService } from '@foodgrid/database/nest';
import { Public } from '@foodgrid/auth/nest';
import type { Response } from 'express';
import Redis from 'ioredis';
import { REDIS } from './redis.module';
import { metricsRegistry } from './metrics';

@ApiExcludeController()
@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is up. Never touches dependencies. */
  @Get('health/live')
  @HttpCode(200)
  live() {
    return { status: 'ok', uptime: process.uptime() };
  }

  /** Readiness: dependencies reachable; Kubernetes stops routing traffic otherwise. */
  @Get('health/ready')
  async ready() {
    const [db, cache] = await Promise.all([
      this.prisma.isHealthy(),
      this.redis
        .ping()
        .then((r) => r === 'PONG')
        .catch(() => false),
    ]);
    const body = {
      status: db && cache ? 'ok' : 'degraded',
      checks: { database: db, redis: cache },
    };
    if (!db || !cache) throw new ServiceUnavailableException(body);
    return body;
  }

  @Get('metrics')
  async metrics(@Res() res: Response) {
    res.setHeader('Content-Type', metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  }
}
