import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PrismaService } from '@foodgrid/database/nest';
import { REDIS, withLock } from '@foodgrid/utils/server';
import { CostingService } from '../costing/costing.service';

@Injectable()
export class InventoryJobsService {
  private readonly logger = new Logger(InventoryJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** 02:00 IST: food-cost snapshots for every outlet with recipes. */
  @Cron('0 2 * * *', { timeZone: 'Asia/Kolkata' })
  async costSnapshots() {
    await withLock(this.redis, 'inventory:cost-snapshots', 3600, async () => {
      const outlets = await this.prisma.recipe.findMany({
        distinct: ['outletId'],
        select: { outletId: true, tenantId: true },
      });
      for (const o of outlets) {
        await this.costing
          .snapshot(o.tenantId, o.outletId)
          .catch((err: Error) => this.logger.warn(`snapshot ${o.outletId}: ${err.message}`));
      }
    });
  }

  /** Hourly: zero out fully depleted batches older than their expiry to keep FEFO lists small. */
  @Cron('15 * * * *')
  async expireBatches() {
    await withLock(this.redis, 'inventory:expire-batches', 600, async () => {
      const res = await this.prisma.stockBatch.updateMany({
        where: { remainingQty: { lte: 0 }, expiresAt: { lt: new Date() } },
        data: { remainingQty: 0 },
      });
      if (res.count) this.logger.debug(`normalised ${res.count} depleted batches`);
    });
  }
}
