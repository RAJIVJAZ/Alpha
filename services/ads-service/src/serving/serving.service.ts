import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { AdCampaign } from '@foodgrid/database';
import { dateOnly, istDate, round2 } from '@foodgrid/utils';
import { businessCounter } from '@foodgrid/utils/server';
import { hasBudget, runAuction } from '../domain/auction';
import { ClickDto, ServeDto } from '../campaigns/dto/campaign.dto';

const adEvents = businessCounter('ad_events_total', 'Ad impressions / clicks / conversions', ['type']);

/**
 * Ad serving: eligibility (dates, geo, keywords, budget) → GSP auction →
 * impression logging (CPM charging). Clicks are charged per click with
 * atomic budget checks; conversions are attributed from orders.
 */
@Injectable()
export class ServingService {
  private readonly logger = new Logger(ServingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async serve(dto: ServeDto) {
    const now = new Date();
    const today = istDate(now);
    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        status: 'ACTIVE',
        placement: dto.placement,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        ...(dto.city ? { AND: [{ OR: [{ cities: { isEmpty: true } }, { cities: { has: dto.city } }] }] } : {}),
      },
      include: { dailyStats: { where: { date: { gte: new Date(Date.now() - 30 * 86_400_000) } } } },
    });
    const keywords = (dto.keywords ?? []).map((k) => k.toLowerCase());
    const eligible = campaigns.filter(
      (c) =>
        (!keywords.length || !c.keywords.length || c.keywords.some((k) => keywords.some((q) => q.includes(k.toLowerCase())))) &&
        hasBudget(this.budgetView(c), Number(c.bidAmount), today),
    );
    const winners = runAuction(
      eligible.map((c) => ({
        campaignId: c.id,
        bidType: c.bidType,
        bidAmount: Number(c.bidAmount),
        impressions: c.dailyStats.reduce((s, d) => s + d.impressions, 0),
        clicks: c.dailyStats.reduce((s, d) => s + d.clicks, 0),
      })),
      dto.limit ?? 3,
    );
    const byId = new Map(campaigns.map((c) => [c.id, c]));
    for (const w of winners) {
      const cost = w.bidType === 'CPM' ? round2(w.price / 1000) : 0;
      await this.record(w.campaignId, 'IMPRESSION', cost, { userId: dto.userId, sessionId: dto.sessionId, context: { placement: dto.placement, rank: w.rank, price: w.price } });
    }
    return winners.map((w) => {
      const c = byId.get(w.campaignId)!;
      return { campaignId: c.id, targetType: c.targetType, targetId: c.targetId, creative: c.creative, rank: w.rank, sponsored: true };
    });
  }

  async click(dto: ClickDto, userId?: string) {
    const c = await this.prisma.adCampaign.findUnique({ where: { id: dto.campaignId } });
    if (!c || c.status !== 'ACTIVE') return { charged: false };
    // de-duplicate rapid repeated clicks from the same user/session (click fraud)
    const recent = await this.prisma.adEvent.count({
      where: { campaignId: c.id, type: 'CLICK', createdAt: { gte: new Date(Date.now() - 60_000) }, OR: [{ userId: userId ?? '__none__' }, { sessionId: dto.sessionId ?? '__none__' }] },
    });
    if (recent) return { charged: false, reason: 'duplicate' };
    const cost = c.bidType === 'CPC' ? Number(c.bidAmount) : 0;
    const charged = await this.record(c.id, 'CLICK', cost, { userId, sessionId: dto.sessionId });
    return { charged, targetType: c.targetType, targetId: c.targetId };
  }

  /** Attributes an order to a click on the same outlet by the same user within 24h. */
  async attributeConversion(userId: string, outletId: string, orderId: string, revenue: number) {
    const click = await this.prisma.adEvent.findFirst({
      where: { type: 'CLICK', userId, createdAt: { gte: new Date(Date.now() - 86_400_000) }, campaign: { targetType: 'OUTLET', targetId: outletId } },
      orderBy: { createdAt: 'desc' },
    });
    if (!click) return false;
    const already = await this.prisma.adEvent.count({ where: { type: 'CONVERSION', orderId } });
    if (already) return false;
    await this.record(click.campaignId, 'CONVERSION', 0, { userId, orderId, revenue });
    return true;
  }

  private budgetView(c: AdCampaign) {
    return {
      totalBudget: Number(c.totalBudget),
      spent: Number(c.spent),
      dailyBudget: Number(c.dailyBudget),
      spentToday: Number(c.spentToday),
      spentTodayDate: c.spentTodayDate ? c.spentTodayDate.toISOString().slice(0, 10) : null,
    };
  }

  /** Records an event and charges the campaign atomically (no overspend under concurrency). */
  private async record(
    campaignId: string,
    type: 'IMPRESSION' | 'CLICK' | 'CONVERSION',
    cost: number,
    meta: { userId?: string; sessionId?: string; orderId?: string; revenue?: number; context?: Record<string, unknown> },
  ): Promise<boolean> {
    const today = dateOnly(istDate());
    return this.prisma.$transaction(async (tx) => {
      if (cost > 0) {
        await tx.$executeRaw`
          UPDATE "ads"."AdCampaign" SET "spentToday" = 0, "spentTodayDate" = ${today}
          WHERE id = ${campaignId} AND ("spentTodayDate" IS NULL OR "spentTodayDate" < ${today})`;
        const charged = await tx.$executeRaw`
          UPDATE "ads"."AdCampaign"
          SET spent = spent + ${cost}, "spentToday" = "spentToday" + ${cost}
          WHERE id = ${campaignId} AND spent + ${cost} <= "totalBudget" AND "spentToday" + ${cost} <= "dailyBudget"`;
        if (!charged) {
          const c = await tx.adCampaign.findUniqueOrThrow({ where: { id: campaignId } });
          if (Number(c.spent) + cost > Number(c.totalBudget)) await tx.adCampaign.update({ where: { id: campaignId }, data: { status: 'EXHAUSTED' } });
          return false;
        }
      }
      await tx.adEvent.create({ data: { campaignId, type, cost, userId: meta.userId, sessionId: meta.sessionId, orderId: meta.orderId, context: meta.context as never } });
      await tx.adDailyStats.upsert({
        where: { campaignId_date: { campaignId, date: today } },
        create: {
          campaignId,
          date: today,
          impressions: type === 'IMPRESSION' ? 1 : 0,
          clicks: type === 'CLICK' ? 1 : 0,
          conversions: type === 'CONVERSION' ? 1 : 0,
          spend: cost,
          revenue: meta.revenue ?? 0,
        },
        update: {
          impressions: { increment: type === 'IMPRESSION' ? 1 : 0 },
          clicks: { increment: type === 'CLICK' ? 1 : 0 },
          conversions: { increment: type === 'CONVERSION' ? 1 : 0 },
          spend: { increment: cost },
          revenue: { increment: meta.revenue ?? 0 },
        },
      });
      adEvents.inc({ type });
      return true;
    });
  }
}
