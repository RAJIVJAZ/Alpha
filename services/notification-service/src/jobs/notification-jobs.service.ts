import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS, withLock } from '@foodgrid/utils/server';
import { PushCampaignsService } from '../campaigns/push-campaigns.service';

@Injectable()
export class NotificationJobsService {
  constructor(
    private readonly campaigns: PushCampaignsService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduled() {
    await withLock(this.redis, 'notifications:scheduled-campaigns', 55, async () => {
      for (const c of await this.campaigns.due()) await this.campaigns.send(c.id);
    });
  }
}
