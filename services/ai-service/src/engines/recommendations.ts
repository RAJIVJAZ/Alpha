import { round2 } from '@foodgrid/utils';

export interface HistoryOrder {
  outletId: string;
  cuisines: string[];
  total: number;
  costForTwo?: number;
  at: string;
  menuItemIds?: string[];
}

export interface CandidateOutlet {
  outletId: string;
  cuisines: string[];
  rating: number;
  ratingCount: number;
  costForTwo: number;
  distanceKm: number;
  etaMins: number;
  isPureVeg: boolean;
}

export interface RankedOutlet {
  outletId: string;
  score: number;
  reasons: string[];
}

/**
 * Hybrid outlet ranking: content-based cuisine & price affinity learned from
 * the customer's history, loyalty with recency decay, Bayesian rating,
 * distance and ETA. Cold-start users fall back to popularity.
 */
export function rankOutlets(history: HistoryOrder[], candidates: CandidateOutlet[], now = new Date()): RankedOutlet[] {
  const cuisineWeight = new Map<string, number>();
  const outletLoyalty = new Map<string, number>();
  let spend = 0;
  for (const h of history) {
    const ageDays = (now.getTime() - new Date(h.at).getTime()) / 86_400_000;
    const decay = Math.exp(-ageDays / 30);
    for (const c of h.cuisines) cuisineWeight.set(c, (cuisineWeight.get(c) ?? 0) + decay);
    outletLoyalty.set(h.outletId, (outletLoyalty.get(h.outletId) ?? 0) + decay);
    spend += h.costForTwo ?? h.total;
  }
  const maxCuisine = Math.max(1e-9, ...cuisineWeight.values());
  const avgSpend = history.length ? spend / history.length : 0;
  const maxPopularity = Math.max(1, ...candidates.map((c) => c.ratingCount));
  const cold = history.length < 2;
  const vegOnly = history.length >= 3 && history.every((h) => candidates.find((c) => c.outletId === h.outletId)?.isPureVeg ?? false);

  return candidates
    .map((c) => {
      const reasons: string[] = [];
      const bayes = (c.rating * c.ratingCount + 3.9 * 15) / (c.ratingCount + 15);
      const ratingScore = Math.max(0, (bayes - 3) / 2);
      const distanceScore = Math.exp(-c.distanceKm / 5);
      const etaScore = Math.exp(-c.etaMins / 45);
      let score: number;
      if (cold) {
        const popularity = Math.log1p(c.ratingCount) / Math.log1p(maxPopularity);
        score = 0.4 * ratingScore + 0.3 * popularity + 0.2 * distanceScore + 0.1 * etaScore;
        if (popularity > 0.6) reasons.push('Popular near you');
      } else {
        const cuisineMatch = Math.max(0, ...c.cuisines.map((x) => (cuisineWeight.get(x) ?? 0) / maxCuisine));
        const priceFit = avgSpend > 0 ? Math.exp(-Math.abs(c.costForTwo - avgSpend) / avgSpend) : 0.5;
        const loyalty = Math.min(1, (outletLoyalty.get(c.outletId) ?? 0) / 3);
        score = 0.35 * cuisineMatch + 0.2 * ratingScore + 0.15 * distanceScore + 0.15 * priceFit + 0.1 * loyalty + 0.05 * etaScore;
        if (cuisineMatch > 0.5) {
          const top = c.cuisines.find((x) => (cuisineWeight.get(x) ?? 0) / maxCuisine > 0.5);
          if (top) reasons.push(`Because you like ${top}`);
        }
        if (loyalty > 0) reasons.push('You ordered here before');
        if (vegOnly && !c.isPureVeg) score *= 0.6;
      }
      if (bayes >= 4.3) reasons.push('Highly rated');
      if (c.etaMins <= 25) reasons.push('Fast delivery');
      return { outletId: c.outletId, score: round2(score), reasons: reasons.slice(0, 2) };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Item-item collaborative filtering on order baskets (cosine similarity of
 * co-occurrence). Without seeds, returns the most frequent items.
 */
export function recommendItems(baskets: string[][], seedItemIds: string[], limit = 6): { itemId: string; score: number }[] {
  const count = new Map<string, number>();
  const co = new Map<string, Map<string, number>>();
  for (const basket of baskets) {
    const items = [...new Set(basket)];
    for (const i of items) {
      count.set(i, (count.get(i) ?? 0) + 1);
      for (const j of items) {
        if (i === j) continue;
        const row = co.get(i) ?? new Map<string, number>();
        row.set(j, (row.get(j) ?? 0) + 1);
        co.set(i, row);
      }
    }
  }
  const seeds = new Set(seedItemIds);
  const scores = new Map<string, number>();
  if (!seeds.size) {
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([itemId, n]) => ({ itemId, score: n }));
  }
  for (const seed of seeds) {
    for (const [j, c] of co.get(seed) ?? []) {
      if (seeds.has(j)) continue;
      const sim = c / Math.sqrt((count.get(seed) ?? 1) * (count.get(j) ?? 1));
      scores.set(j, (scores.get(j) ?? 0) + sim);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([itemId, score]) => ({ itemId, score: round2(score) }));
}
