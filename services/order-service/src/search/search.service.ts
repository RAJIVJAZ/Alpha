import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { DiscoveryService, toCard } from '../outlets/discovery.service';
import type { SearchQueryDto } from './search.controller';

const SEARCH_RADIUS_KM = 10;

/**
 * Text search over outlets (name, cuisine, tags) and dishes. ILIKE queries are
 * served by pg_trgm GIN indexes (see migration add_search_indexes); swap for
 * OpenSearch when the catalogue outgrows a single Postgres.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
  ) {}

  async search(q: SearchQueryDto) {
    const term = q.q.trim();
    const nearby = await this.discovery.candidates({ lat: q.lat, lng: q.lng }, SEARCH_RADIUS_KM, {
      type: q.type,
    });
    const byId = new Map(nearby.map((n) => [n.outlet.id, n]));
    const lower = term.toLowerCase();

    const outletMatches = nearby.filter(
      (n) =>
        n.outlet.name.toLowerCase().includes(lower) ||
        n.outlet.cuisines.some((c) => c.toLowerCase().includes(lower)) ||
        n.outlet.tags.some((t) => t.toLowerCase().includes(lower)),
    );

    const dishes = byId.size
      ? await this.prisma.menuItem.findMany({
          where: {
            outletId: { in: [...byId.keys()] },
            isAvailable: true,
            OR: [{ name: { contains: term, mode: 'insensitive' } }, { tags: { has: lower } }],
          },
          take: 60,
          orderBy: { isRecommended: 'desc' },
        })
      : [];

    const rankedOutlets = this.discovery
      .sort(outletMatches, 'relevance')
      .slice(0, 30)
      .map((r) => toCard(r));
    const dishResults = dishes
      .map((d) => {
        const o = byId.get(d.outletId)!;
        return {
          id: d.id,
          name: d.name,
          price: d.price,
          imageUrl: d.imageUrl,
          isVeg: d.isVeg,
          outlet: toCard(o),
        };
      })
      .sort(
        (a, b) =>
          Number(b.outlet.isOpen) - Number(a.outlet.isOpen) ||
          (a.outlet.distanceKm ?? 0) - (b.outlet.distanceKm ?? 0),
      );

    return { query: term, outlets: rankedOutlets, dishes: dishResults };
  }

  async suggest(q: SearchQueryDto) {
    const result = await this.search(q);
    const cuisines = new Set<string>();
    for (const o of result.outlets)
      for (const c of o.cuisines) if (c.toLowerCase().includes(q.q.toLowerCase())) cuisines.add(c);
    return {
      cuisines: [...cuisines].slice(0, 5),
      outlets: result.outlets
        .slice(0, 5)
        .map((o) => ({ id: o.id, slug: o.slug, name: o.name, type: o.type })),
      dishes: [...new Set(result.dishes.map((d) => d.name))].slice(0, 5),
    };
  }
}
