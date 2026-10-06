import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Outlet, Prisma } from '@foodgrid/database';
import type { OutletCard } from '@foodgrid/types';
import {
  estimateRoadKm,
  geohashCover,
  isWithinOpeningHours,
  OpeningWindow,
  paginate,
  normalizePage,
  travelMinutes,
} from '@foodgrid/utils';
import { InternalHttpService } from '@foodgrid/utils/server';
import { NearbyQueryDto } from './dto/outlet.dto';

export interface ScoredOutlet {
  outlet: Outlet;
  distanceKm: number;
  etaMins: number;
  openNow: boolean;
}

/**
 * Proximity discovery. Geohash prefixes narrow the candidate set in SQL,
 * then exact distance, serviceability and ranking are applied in memory.
 */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
  ) {}

  async candidates(
    center: { lat: number; lng: number },
    radiusKm: number,
    extra: Prisma.OutletWhereInput = {},
  ): Promise<ScoredOutlet[]> {
    const prefixes = geohashCover(center, radiusKm);
    const outlets = await this.prisma.outlet.findMany({
      where: {
        status: 'ACTIVE',
        OR: prefixes.map((p) => ({ geohash: { startsWith: p } })),
        ...extra,
      },
      take: 2000,
    });
    const now = new Date();
    return outlets
      .map((outlet) => {
        const distanceKm = estimateRoadKm(center, outlet);
        return {
          outlet,
          distanceKm,
          etaMins: outlet.avgPrepTimeMins + travelMinutes(distanceKm) + 5,
          openNow: outlet.isOpen && isWithinOpeningHours(outlet.openingHours as unknown as OpeningWindow[], now),
        };
      })
      .filter((c) => c.distanceKm <= Math.min(radiusKm, c.outlet.deliveryRadiusKm));
  }

  async nearby(q: NearbyQueryDto) {
    const radius = q.radiusKm ?? 8;
    const where: Prisma.OutletWhereInput = {
      type: q.type,
      ...(q.veg ? { isPureVeg: true } : {}),
      ...(q.cuisines?.length ? { cuisines: { hasSome: q.cuisines } } : {}),
      ...(q.minRating ? { ratingAvg: { gte: q.minRating } } : {}),
      ...(q.maxCostForTwo ? { costForTwo: { lte: q.maxCostForTwo } } : {}),
    };
    let rows = await this.candidates({ lat: q.lat, lng: q.lng }, radius, where);
    if (q.openNow) rows = rows.filter((r) => r.openNow);
    rows = this.sort(rows, q.sort ?? 'relevance');

    const sponsored = await this.sponsoredOutletIds(rows[0]?.outlet.city);
    if (sponsored.size && (q.sort ?? 'relevance') === 'relevance') {
      rows = [...rows.filter((r) => sponsored.has(r.outlet.id) && r.openNow), ...rows.filter((r) => !(sponsored.has(r.outlet.id) && r.openNow))];
    }
    const { page, pageSize, skip } = normalizePage(q);
    const slice = rows.slice(skip, skip + pageSize).map((r) => toCard(r, sponsored.has(r.outlet.id)));
    return paginate(slice, rows.length, page, pageSize);
  }

  sort(rows: ScoredOutlet[], sort: NonNullable<NearbyQueryDto['sort']>): ScoredOutlet[] {
    const byOpen = (a: ScoredOutlet, b: ScoredOutlet) => Number(b.openNow) - Number(a.openNow);
    const sorted = [...rows];
    switch (sort) {
      case 'rating':
        return sorted.sort((a, b) => byOpen(a, b) || b.outlet.ratingAvg - a.outlet.ratingAvg);
      case 'distance':
        return sorted.sort((a, b) => byOpen(a, b) || a.distanceKm - b.distanceKm);
      case 'eta':
        return sorted.sort((a, b) => byOpen(a, b) || a.etaMins - b.etaMins);
      case 'cost_low':
        return sorted.sort((a, b) => byOpen(a, b) || Number(a.outlet.costForTwo) - Number(b.outlet.costForTwo));
      case 'cost_high':
        return sorted.sort((a, b) => byOpen(a, b) || Number(b.outlet.costForTwo) - Number(a.outlet.costForTwo));
      default: {
        // Bayesian-smoothed rating (prior 3.8 with weight 20) blended with distance decay.
        const score = (r: ScoredOutlet) => {
          const smoothed = (r.outlet.ratingAvg * r.outlet.ratingCount + 3.8 * 20) / (r.outlet.ratingCount + 20);
          return smoothed * Math.exp(-r.distanceKm / 10);
        };
        return sorted.sort((a, b) => byOpen(a, b) || score(b) - score(a));
      }
    }
  }

  /** Sponsored placements from ads-service; discovery never fails because of ads. */
  private async sponsoredOutletIds(city?: string): Promise<Set<string>> {
    if (!city) return new Set();
    try {
      const ads = await this.internal.post<{ targetType: string; targetId: string }[]>(
        'ads',
        'internal/ads/serve',
        { placement: 'SEARCH_TOP', city, limit: 3 },
        { timeoutMs: 300 },
      );
      return new Set(ads.filter((a) => a.targetType === 'OUTLET').map((a) => a.targetId));
    } catch (err) {
      this.logger.debug(`ads unavailable: ${(err as Error).message}`);
      return new Set();
    }
  }
}

export function toCard(r: ScoredOutlet, sponsored = false): OutletCard {
  const o = r.outlet;
  return {
    id: o.id,
    slug: o.slug,
    name: o.name,
    type: o.type,
    cuisines: o.cuisines,
    city: o.city,
    lat: o.lat,
    lng: o.lng,
    ratingAvg: Math.round(o.ratingAvg * 10) / 10,
    ratingCount: o.ratingCount,
    costForTwo: Number(o.costForTwo).toFixed(2),
    avgPrepTimeMins: o.avgPrepTimeMins,
    isPureVeg: o.isPureVeg,
    isOpen: r.openNow,
    coverImageUrl: o.coverImageUrl,
    distanceKm: Math.round(r.distanceKm * 10) / 10,
    etaMins: r.etaMins,
    sponsored,
  };
}
