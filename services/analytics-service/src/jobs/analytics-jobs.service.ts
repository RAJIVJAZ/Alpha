import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PrismaService } from '@foodgrid/database/nest';
import { addDays, dateOnly, istDate, istParts } from '@foodgrid/utils';
import { InternalHttpService, REDIS, withLock } from '@foodgrid/utils/server';
import { ReportsService } from '../reports/reports.service';

/** Last complete Monday–Sunday week in IST. */
export function lastCompleteWeek(now = new Date()): { from: Date; to: Date } {
  const today = dateOnly(istDate(now));
  const weekday = istParts(now).weekday; // 0 = Sunday
  const to = addDays(today, -(weekday === 0 ? 7 : weekday));
  return { from: addDays(to, -6), to };
}

const doneKey = (to: Date) => `analytics:weekly-scores:${to.toISOString().slice(0, 10)}`;

/**
 * Weekly restaurant performance scoring for the last complete week (Monday
 * 04:00 IST). A week missed while the service was down is scored on boot.
 */
@Injectable()
export class AnalyticsJobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalyticsJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly internal: InternalHttpService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onApplicationBootstrap() {
    if (process.env.JEST_WORKER_ID) return;
    // give the services this job calls time to come up
    setTimeout(() => void this.catchUp().catch((err: Error) => this.logger.warn(`score catch-up: ${err.message}`)), 30_000).unref();
  }

  @Cron('0 4 * * 1', { timeZone: 'Asia/Kolkata' })
  async weeklyScores() {
    await withLock(this.redis, 'analytics:weekly-scores', 3600, () => this.scoreOutlets());
  }

  async catchUp() {
    if (await this.redis.exists(doneKey(lastCompleteWeek().to))) return;
    await this.weeklyScores();
  }

  async scoreOutlets() {
    const { from, to } = lastCompleteWeek();
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
    this.logger.log(`Scored ${scored}/${outlets.length} outlets for the week ending ${to.toISOString().slice(0, 10)}`);
    if (scored) await this.redis.set(doneKey(to), '1', 'EX', 14 * 86_400);
    return { periodStart: from.toISOString().slice(0, 10), periodEnd: to.toISOString().slice(0, 10), scored, outlets: outlets.length };
  }
}
