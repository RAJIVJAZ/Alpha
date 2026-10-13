import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { DiscoveryService, toCard } from '../outlets/discovery.service';
import type { SearchQueryDto } from './search.controller';

const SEARCH_RADIUS_KM = 10;

/**
 * Smallest pg_trgm word similarity that counts as a match despite a typo ("panner" finds
 * Paneer Tikka, "biriyani" Chicken Biryani, "piza" Pizza). Short words have few trigrams,
 * so they need more of them to agree ("roti" must not find Rogan Josh).
 */
export const fuzzyThreshold = (term: string) => (term.length <= 4 ? 0.5 : 0.42);

/** `%term%` for ILIKE, with the wildcards a customer may type taken literally. */
export const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Text search over outlets (name, cuisines, tags) and dishes (name, tags, menu category).
 * A substring match ranks first; otherwise pg_trgm word similarity tolerates typos. The
 * trigram GIN indexes (migration add_search_indexes) serve the name lookups; swap for
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
    const ids = [...byId.keys()];
    const like = likePattern(term);
    const threshold = fuzzyThreshold(term);

    // 1 for a substring of the name, a cuisine or a tag; else the closest word similarity
    const outletScores = ids.length
      ? await this.prisma.$queryRaw<{ id: string; score: number }[]>`
          SELECT id, score FROM (
            SELECT o.id, GREATEST(
              CASE WHEN o.name ILIKE ${like} THEN 1 ELSE word_similarity(${term}, o.name) END,
              COALESCE((
                SELECT MAX(CASE WHEN x ILIKE ${like} THEN 1 ELSE word_similarity(${term}, x) END)
                FROM unnest(o.cuisines || o.tags) AS x
              ), 0)
            )::float8 AS score
            FROM commerce."Outlet" o
            WHERE o.id = ANY(${ids}::text[])
          ) s
          WHERE score >= ${threshold}`
      : [];
    const outletScore = new Map(outletScores.map((r) => [r.id, r.score]));
    const outletMatches = nearby.filter((n) => outletScore.has(n.outlet.id));

    // dishes match on their name or a tag, or on their menu category ("desserts")
    const dishScores = ids.length
      ? await this.prisma.$queryRaw<{ id: string; score: number }[]>`
          SELECT id, score FROM (
            SELECT i.id, i."isRecommended", GREATEST(
              CASE WHEN i.name ILIKE ${like} THEN 1 ELSE word_similarity(${term}, i.name) END,
              CASE WHEN ${term.toLowerCase()} = ANY(i.tags) THEN 1 ELSE 0 END,
              CASE WHEN c.name ILIKE ${like} THEN 0.9 ELSE 0.9 * word_similarity(${term}, c.name) END
            )::float8 AS score
            FROM commerce."MenuItem" i
            JOIN commerce."MenuCategory" c ON c.id = i."categoryId"
            WHERE i."outletId" = ANY(${ids}::text[]) AND i."isAvailable"
          ) s
          WHERE score >= ${threshold}
          ORDER BY score DESC, "isRecommended" DESC
          LIMIT 60`
      : [];
    const dishScore = new Map(dishScores.map((r) => [r.id, r.score]));
    const dishes = dishScores.length
      ? await this.prisma.menuItem.findMany({ where: { id: { in: [...dishScore.keys()] } } })
      : [];
    // exact matches before typo matches; within each, the usual order
    const strong = (score = 0) => (score >= 0.9 ? 0 : 1);

    const rankedOutlets = this.discovery
      .sort(outletMatches, 'relevance')
      .sort((a, b) => strong(outletScore.get(a.outlet.id)) - strong(outletScore.get(b.outlet.id)))
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
          strong: strong(dishScore.get(d.id)),
        };
      })
      .sort(
        (a, b) =>
          a.strong - b.strong ||
          Number(b.outlet.isOpenNow) - Number(a.outlet.isOpenNow) ||
          (a.outlet.distanceKm ?? 0) - (b.outlet.distanceKm ?? 0),
      );

    return {
      query: term,
      outlets: rankedOutlets,
      dishes: dishResults.map(({ strong: _strong, ...d }) => d),
    };
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
