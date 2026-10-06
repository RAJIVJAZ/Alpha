import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { istParts } from '@foodgrid/utils';
import { REDIS, withLock } from '@foodgrid/utils/server';
import { SettlementsService } from '../settlements/settlements.service';

/** Weekly settlement cycle: Monday 03:00 IST settles the previous Mon–Sun. */
@Injectable()
export class SettlementJobsService {
  constructor(
    private readonly settlements: SettlementsService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Cron('0 3 * * 1', { timeZone: 'Asia/Kolkata' })
  async weekly() {
    await withLock(this.redis, 'payments:weekly-settlement', 1800, async () => {
      const p = istParts();
      const today = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
      const periodEnd = new Date(`${today}T00:00:00+05:30`);
      const periodStart = new Date(periodEnd.getTime() - 7 * 86_400_000);
      await this.settlements.run(periodStart, periodEnd);
    });
  }
}
