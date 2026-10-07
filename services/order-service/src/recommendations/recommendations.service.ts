import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '@foodgrid/database/nest';
import { istParts } from '@foodgrid/utils';
import { InternalHttpService, REDIS } from '@foodgrid/utils/server';
import { toMoney } from '../common/money';
import { DiscoveryService, toCard } from '../outlets/discovery.service';

interface RankedOutlet {
  outletId: string;
  score: number;
  reasons: string[];
}

/**
 * Gathers the customer's history and nearby candidates, then delegates ranking
 * to ai-service (stateless model serving). Falls back to rating/distance
 * ordering if the model is unavailable.
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
    private readonly internal: InternalHttpService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async home(userId: string | undefined, lat: number, lng: number) {
    const candidates = (await this.discovery.candidates({ lat, lng }, 8)).filter((c) => c.openNow);
    const history = userId
      ? await this.prisma.order.findMany({
          where: { customerId: userId, status: { in: ['DELIVERED', 'COMPLETED'] } },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            outlet: { select: { cuisines: true, costForTwo: true } },
            items: { select: { menuItemId: true } },
          },
        })
      : [];

    let ranked: RankedOutlet[] | null = null;
    if (candidates.length) {
      ranked = await this.internal
        .post<RankedOutlet[]>(
          'ai',
          'internal/ai/recommendations/outlets',
          {
            userId,
            context: { hour: istParts().hour },
            history: history.map((o) => ({
              outletId: o.outletId,
              cuisines: o.outlet.cuisines,
              total: Number(o.total),
              costForTwo: Number(o.outlet.costForTwo),
              at: o.createdAt.toISOString(),
              menuItemIds: o.items.map((i) => i.menuItemId),
            })),
            candidates: candidates.map((c) => ({
              outletId: c.outlet.id,
              cuisines: c.outlet.cuisines,
              rating: c.outlet.ratingAvg,
              ratingCount: c.outlet.ratingCount,
              costForTwo: Number(c.outlet.costForTwo),
              distanceKm: c.distanceKm,
              etaMins: c.etaMins,
              isPureVeg: c.outlet.isPureVeg,
            })),
          },
          { timeoutMs: 1000 },
        )
        .catch((err: Error) => {
          this.logger.warn(`recommendation model unavailable: ${err.message}`);
          return null;
        });
    }
    const byId = new Map(candidates.map((c) => [c.outlet.id, c]));
    const recommended = ranked
      ? ranked
          .filter((r) => byId.has(r.outletId))
          .slice(0, 20)
          .map((r) => ({ ...toCard(byId.get(r.outletId)!), reasons: r.reasons }))
      : this.discovery
          .sort(candidates, 'relevance')
          .slice(0, 20)
          .map((c) => ({ ...toCard(c), reasons: ['Popular near you'] }));

    return {
      recommended,
      reorder: userId ? await this.reorderSuggestions(userId) : [],
      topRated: this.discovery
        .sort(candidates, 'rating')
        .slice(0, 10)
        .map((c) => toCard(c)),
      fastDelivery: this.discovery
        .sort(candidates, 'eta')
        .slice(0, 10)
        .map((c) => toCard(c)),
    };
  }

  /** Frequency × recency scoring of previously ordered baskets. */
  async reorderSuggestions(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId: userId, status: { in: ['DELIVERED', 'COMPLETED'] } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        outlet: { select: { name: true, slug: true, coverImageUrl: true, status: true } },
        items: true,
      },
    });
    const groups = new Map<
      string,
      {
        orderId: string;
        outletName: string;
        slug: string;
        items: string[];
        count: number;
        lastAt: Date;
        total: string;
        imageUrl: string | null;
      }
    >();
    for (const o of orders) {
      if (o.outlet.status !== 'ACTIVE') continue;
      const key = `${o.outletId}:${o.items
        .map((i) => i.menuItemId)
        .sort()
        .join(',')}`;
      const g = groups.get(key);
      if (g) g.count++;
      else
        groups.set(key, {
          orderId: o.id,
          outletName: o.outlet.name,
          slug: o.outlet.slug,
          items: o.items.map((i) => `${i.quantity} × ${i.name}`),
          count: 1,
          lastAt: o.createdAt,
          total: toMoney(o.total),
          imageUrl: o.outlet.coverImageUrl,
        });
    }
    const now = Date.now();
    return [...groups.values()]
      .map((g) => ({
        ...g,
        score: g.count * Math.exp(-(now - g.lastAt.getTime()) / (14 * 86_400_000)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  /** "Goes well with" dishes via item-item collaborative filtering on recent baskets. */
  async dishes(outletId: string, seedItemIds: string[]) {
    const cacheKey = `reco:baskets:${outletId}`;
    let baskets: string[][] | null = null;
    const cached = await this.redis.get(cacheKey);
    if (cached) baskets = JSON.parse(cached) as string[][];
    else {
      const orders = await this.prisma.order.findMany({
        where: { outletId, status: { in: ['DELIVERED', 'COMPLETED'] } },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: { items: { select: { menuItemId: true } } },
      });
      baskets = orders
        .map((o) => [...new Set(o.items.map((i) => i.menuItemId))])
        .filter((b) => b.length > 1);
      await this.redis.set(cacheKey, JSON.stringify(baskets), 'EX', 3600);
    }
    const ranked = await this.internal
      .post<{ itemId: string; score: number }[]>(
        'ai',
        'internal/ai/recommendations/items',
        { baskets, seedItemIds, limit: 6 },
        { timeoutMs: 800 },
      )
      .catch(() => [] as { itemId: string; score: number }[]);
    if (!ranked.length) return [];
    const items = await this.prisma.menuItem.findMany({
      where: { id: { in: ranked.map((r) => r.itemId) }, isAvailable: true },
      include: { _count: { select: { variants: true, addonGroups: true } } },
    });
    const byId = new Map(
      items.map(({ _count, ...i }) => [
        i.id,
        // clients open the options sheet instead of quick-adding these
        { ...i, customisable: _count.variants > 0 || _count.addonGroups > 0 },
      ]),
    );
    return ranked
      .filter((r) => byId.has(r.itemId))
      .map((r) => ({ ...byId.get(r.itemId)!, score: r.score }));
  }
}
