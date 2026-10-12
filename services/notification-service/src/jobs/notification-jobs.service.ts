import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS, withLock } from '@foodgrid/utils/server';
import { PushCampaignsService } from '../campaigns/push-campaigns.service';

/** A SENDING campaign with no progress for this long lost its pod and is resumed. */
const STALLED_MS = 5 * 60_000;

@Injectable()
export class NotificationJobsService {
  private readonly logger = new Logger(NotificationJobsService.name);

  constructor(
    private readonly campaigns: PushCampaignsService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduled() {
    await withLock(this.redis, 'notifications:scheduled-campaigns', 55, async () => {
      for (const c of await this.campaigns.due())
        await this.campaigns
          .sendNow(c.id)
          .catch((err: Error) => this.logger.warn(`Campaign ${c.id}: ${err.message}`));
      for (const id of await this.campaigns.stalled(new Date(Date.now() - STALLED_MS)))
        await this.campaigns
          .deliver(id)
          .catch((err: Error) => this.logger.warn(`Campaign ${id}: ${err.message}`));
    });
  }
}
