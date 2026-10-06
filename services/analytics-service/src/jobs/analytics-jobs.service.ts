import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PrismaService } from '@foodgrid/database/nest';
import { addDays, dateOnly, istDate } from '@foodgrid/utils';
import { InternalHttpService, REDIS, withLock } from '@foodgrid/utils/server';
import { ReportsService } from '../reports/reports.service';

/** Weekly restaurant performance scoring (Monday 04:00 IST). */
@Injectable()
export class AnalyticsJobsService {
  private readonly logger = new Logger(AnalyticsJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly internal: InternalHttpService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Cron('0 4 * * 1', { timeZone: 'Asia/Kolkata' })
  async weeklyScores() {
    await withLock(this.redis, 'analytics:weekly-scores', 3600, () => this.scoreOutlets());
  }

  async scoreOutlets() {
    const to = addDays(dateOnly(istDate()), -1);
    const from = addDays(to, -6);
    const outlets = await this.prisma.orderFact.findMany({ where: { date: { gte: from, lte: to } }, distinct: ['outletId'], select: { outletId: true } });
    let scored = 0;
    for (const { outletId } of outlets) {
      const m = await this.reports.outletScoringMetrics(outletId, from, to);
      if (!m.tenantId || m.orders < 5) continue;
      const outlet = await this.internal
        .get<{ ratingAvg: number; ratingCount: number; avgPrepTimeMins: number }>('order', `internal/outlets/${outletId}`)
        .catch(() => null);
      await this.internal
        .post('ai', 'internal/ai/outlets/score', {
          tenantId: m.tenantId,
          outletId,
          periodStart: from.toISOString().slice(0, 10),
          periodEnd: to.toISOString().slice(0, 10),
          metrics: {
            avgRating: outlet?.ratingAvg ?? 4,
            ratingCount: outlet?.ratingCount ?? 0,
            acceptanceRate: m.acceptanceRate,
            avgPrepMins: m.avgPrepMins,
            slaPrepMins: outlet?.avgPrepTimeMins ?? 20,
            cancellationRate: m.cancellationRate,
            complaintRate: 0,
            repeatRate: m.repeatRate,
            onTimeRate: m.onTimeRate,
          },
        })
        .then(() => scored++)
        .catch((err: Error) => this.logger.warn(`score ${outletId}: ${err.message}`));
    }
    this.logger.log(`Scored ${scored}/${outlets.length} outlets`);
    return { scored };
  }
}
