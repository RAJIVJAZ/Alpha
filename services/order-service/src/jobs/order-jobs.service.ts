import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PrismaService } from '@foodgrid/database/nest';
import { REDIS, withLock } from '@foodgrid/utils/server';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

const UNPAID_TIMEOUT_MIN = 15;
const ACCEPT_TIMEOUT_MIN = 12;

/** Background jobs, single-flight across replicas via Redis locks. */
@Injectable()
export class OrderJobsService {
  private readonly logger = new Logger(OrderJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly subscriptions: SubscriptionsService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireUnpaid() {
    await withLock(this.redis, 'order:expire-unpaid', 55, async () => {
      const stale = await this.prisma.order.findMany({
        where: { status: 'PENDING_PAYMENT', createdAt: { lt: new Date(Date.now() - UNPAID_TIMEOUT_MIN * 60_000) } },
        select: { id: true },
        take: 200,
      });
      for (const o of stale) {
        await this.lifecycle
          .transition(o.id, 'CANCELLED', { actorType: 'SYSTEM', note: 'Payment not completed in time' })
          .catch((err: Error) => this.logger.warn(`expire ${o.id}: ${err.message}`));
      }
      if (stale.length) this.logger.log(`Expired ${stale.length} unpaid orders`);
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async rejectUnaccepted() {
    await withLock(this.redis, 'order:reject-unaccepted', 55, async () => {
      const cutoff = new Date(Date.now() - ACCEPT_TIMEOUT_MIN * 60_000);
      const stale = await this.prisma.order.findMany({
        where: {
          status: 'PLACED',
          placedAt: { lt: cutoff },
          channel: { in: ['APP', 'WEB'] },
          OR: [{ scheduledFor: null }, { scheduledFor: { lt: new Date(Date.now() + 30 * 60_000) } }],
        },
        select: { id: true },
        take: 200,
      });
      for (const o of stale) {
        await this.lifecycle
          .transition(o.id, 'REJECTED', { actorType: 'SYSTEM', note: 'Restaurant did not respond in time' })
          .catch((err: Error) => this.logger.warn(`auto-reject ${o.id}: ${err.message}`));
      }
    });
  }

  /** 06:00 IST: create today's meal-subscription orders. */
  @Cron('0 6 * * *', { timeZone: 'Asia/Kolkata' })
  async mealSubscriptionOrders() {
    await withLock(this.redis, 'order:meal-subscriptions', 600, async () => {
      const res = await this.subscriptions.generateOrdersFor();
      this.logger.log(`Meal subscription orders: ${res.created} created, ${res.skipped} skipped`);
    });
  }
}
