import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PrismaService } from '@foodgrid/database/nest';
import { REDIS, withLock } from '@foodgrid/utils/server';
import { DispatchService } from '../dispatch/dispatch.service';
import { ZonesService } from '../zones/zones.service';

@Injectable()
export class DeliveryJobsService {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly zones: ZonesService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async sweepOffers() {
    await withLock(this.redis, 'delivery:sweep', 9, () => this.dispatch.sweep());
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async surge() {
    await withLock(this.redis, 'delivery:surge', 55, () => this.zones.recomputeSurge());
  }

  /** Riders silent for 10 minutes are taken offline (app killed / no network). */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async staleRiders() {
    await withLock(this.redis, 'delivery:stale-riders', 240, async () => {
      await this.prisma.riderProfile.updateMany({
        where: { isOnline: true, isOnDelivery: false, lastLocationAt: { lt: new Date(Date.now() - 10 * 60_000) } },
        data: { isOnline: false },
      });
    });
  }
}
