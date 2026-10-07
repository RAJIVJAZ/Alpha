import { normalize, round2 } from '@foodgrid/utils';

export type Strategy = 'LOWEST_COST' | 'FASTEST' | 'BEST_RATED' | 'BALANCED';
export const STRATEGIES: Strategy[] = ['LOWEST_COST', 'FASTEST', 'BEST_RATED', 'BALANCED'];

export interface SupplierOffer {
  productId: string;
  supplierTenantId: string;
  supplierName: string;
  productName: string;
  brand?: string | null;
  /** Price per pack after the applicable bulk tier, pre-tax. */
  unitPrice: number;
  /** Quantity of the buyer's stock unit contained in one pack. */
  baseQtyPerPack: number;
  moq: number;
  stepQty: number;
  gstRate: number;
  deliveryCharge: number;
  freeDeliveryAbove?: number | null;
  leadTimeHours: number;
  rating: number;
  ratingCount: number;
  onTimeRate: number;
  fillRate: number;
  stockQty: number;
  /** Optional tier table so pack price can be re-evaluated at the final pack count. */
  tiers?: { minQty: number; unitPrice: number }[];
}

export interface RankedOffer {
  productId: string;
  supplierTenantId: string;
  supplierName: string;
  productName: string;
  brand: string | null;
  unitPrice: number;
  packSize: number;
  packs: number;
  quantity: number;
  subtotal: number;
  tax: number;
  deliveryCharge: number;
  landedCost: number;
  costPerBaseUnit: number;
  leadTimeHours: number;
  rating: number;
  onTimeRate: number;
  fillRate: number;
  moqSatisfied: boolean;
  feasible: boolean;
  overbuyRatio: number;
  scores: { cost: number; speed: number; quality: number };
  score: number;
  rank: number;
}

export const STRATEGY_WEIGHTS: Record<Strategy, { cost: number; speed: number; quality: number }> =
  {
    LOWEST_COST: { cost: 1, speed: 0, quality: 0 },
    FASTEST: { cost: 0, speed: 1, quality: 0 },
    BEST_RATED: { cost: 0, speed: 0, quality: 1 },
    BALANCED: { cost: 0.5, speed: 0.2, quality: 0.3 },
  };

/** Bayesian-smoothed rating (prior 4.0 with 10 virtual reviews). */
const smoothRating = (rating: number, count: number) => (rating * count + 4 * 10) / (count + 10);

function costOffer(o: SupplierOffer, quantity: number) {
  const step = o.stepQty > 0 ? o.stepQty : 1;
  const needed = Math.ceil(quantity / o.baseQtyPerPack / step) * step;
  const packs = Math.max(o.moq, needed);
  const tier = (o.tiers ?? [])
    .filter((t) => packs >= t.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
  const unitPrice = tier ? tier.unitPrice : o.unitPrice;
  const subtotal = round2(packs * unitPrice);
  const tax = round2((subtotal * o.gstRate) / 100);
  const delivery =
    o.freeDeliveryAbove != null && subtotal >= o.freeDeliveryAbove ? 0 : o.deliveryCharge;
  const landed = round2(subtotal + tax + delivery);
  const delivered = packs * o.baseQtyPerPack;
  return {
    packs,
    unitPrice,
    subtotal,
    tax,
    delivery,
    landed,
    costPerBaseUnit: delivered > 0 ? round2(landed / delivered) : Number.POSITIVE_INFINITY,
    overbuyRatio: round2(delivered / quantity),
    moqSatisfied: needed >= o.moq,
    feasible: o.stockQty >= packs,
  };
}

/**
 * Multi-criteria supplier ranking. Each offer is costed at the exact pack
 * count needed (MOQ, step, bulk tier, GST, delivery), then scored on
 * normalised landed cost per unit, lead time and quality (rating, on-time
 * rate, fill rate). Out-of-stock offers are never recommended; heavy
 * over-buying caused by large MOQs is penalised.
 */
export function rankSuppliers(
  offers: SupplierOffer[],
  quantity: number,
  strategy: Strategy,
): RankedOffer[] {
  if (!offers.length || quantity <= 0) return [];
  const costed = offers.map((o) => ({ o, c: costOffer(o, quantity) }));
  const feasible = costed.filter((x) => x.c.feasible);
  const pool = feasible.length ? feasible : costed;
  const costs = pool.map((x) => x.c.costPerBaseUnit);
  const leads = pool.map((x) => x.o.leadTimeHours);
  const [minCost, maxCost] = [Math.min(...costs), Math.max(...costs)];
  const [minLead, maxLead] = [Math.min(...leads), Math.max(...leads)];
  const w = STRATEGY_WEIGHTS[strategy];

  const ranked = costed.map(({ o, c }) => {
    const quality =
      0.5 * (smoothRating(o.rating, o.ratingCount) / 5) + 0.3 * o.onTimeRate + 0.2 * o.fillRate;
    const scores = {
      cost: round2(normalize(c.costPerBaseUnit, minCost, maxCost, true)),
      speed: round2(normalize(o.leadTimeHours, minLead, maxLead, true)),
      quality: round2(quality),
    };
    let score = w.cost * scores.cost + w.speed * scores.speed + w.quality * scores.quality;
    if (c.overbuyRatio > 1.5) score *= 0.85;
    if (!c.feasible) score = 0;
    return {
      productId: o.productId,
      supplierTenantId: o.supplierTenantId,
      supplierName: o.supplierName,
      productName: o.productName,
      brand: o.brand ?? null,
      unitPrice: c.unitPrice,
      packSize: o.baseQtyPerPack,
      packs: c.packs,
      quantity: round2(c.packs * o.baseQtyPerPack),
      subtotal: c.subtotal,
      tax: c.tax,
      deliveryCharge: c.delivery,
      landedCost: c.landed,
      costPerBaseUnit: c.costPerBaseUnit,
      leadTimeHours: o.leadTimeHours,
      rating: o.rating,
      onTimeRate: o.onTimeRate,
      fillRate: o.fillRate,
      moqSatisfied: c.moqSatisfied,
      feasible: c.feasible,
      overbuyRatio: c.overbuyRatio,
      scores,
      score: round2(score),
      rank: 0,
    };
  });
  ranked.sort((a, b) => b.score - a.score || a.landedCost - b.landedCost);
  ranked.forEach((r, i) => (r.rank = i + 1));
  return ranked;
}

/** Best feasible offer for every strategy (used for the comparison cards). */
export function bestByStrategy(
  offers: SupplierOffer[],
  quantity: number,
): Record<Strategy, RankedOffer | null> {
  return Object.fromEntries(
    STRATEGIES.map((s) => [s, rankSuppliers(offers, quantity, s).find((r) => r.feasible) ?? null]),
  ) as Record<Strategy, RankedOffer | null>;
}
