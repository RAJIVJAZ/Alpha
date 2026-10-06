import { clamp, round2 } from '@foodgrid/utils';

export interface SurgeInput {
  pendingOrders: number;
  onlineRiders: number;
  rainMm?: number;
  hourOfDay: number;
  isFestival?: boolean;
}

/**
 * Delivery-fee surge multiplier from live demand/supply in a zone. Rounded to
 * 0.05 steps and capped at 2× to keep prices predictable.
 */
export function deliverySurge(i: SurgeInput): { multiplier: number; reasons: string[] } {
  const reasons: string[] = [];
  const ratio = i.pendingOrders / Math.max(1, i.onlineRiders);
  let m = 1;
  if (ratio > 1.2) {
    m += 0.3 * (ratio - 1.2);
    reasons.push(`High demand (${round2(ratio)} orders per rider)`);
  }
  const rain = i.rainMm ?? 0;
  if (rain > 10) {
    m += 0.35;
    reasons.push('Heavy rain');
  } else if (rain > 2) {
    m += 0.2;
    reasons.push('Rain');
  }
  if ((i.hourOfDay >= 12 && i.hourOfDay < 14) || (i.hourOfDay >= 19 && i.hourOfDay < 22)) {
    m += 0.1;
    reasons.push('Peak hours');
  }
  if (i.isFestival) {
    m += 0.1;
    reasons.push('Festival demand');
  }
  return { multiplier: Math.round(clamp(m, 1, 2) * 20) / 20, reasons };
}

export interface PricePoint {
  price: number;
  quantity: number;
}

/** Log-log OLS price elasticity of demand with r². */
export function estimateElasticity(points: PricePoint[]): { elasticity: number; r2: number; n: number } | null {
  const valid = points.filter((p) => p.price > 0 && p.quantity > 0);
  const distinct = new Set(valid.map((p) => p.price));
  if (valid.length < 5 || distinct.size < 2) return null;
  const xs = valid.map((p) => Math.log(p.price));
  const ys = valid.map((p) => Math.log(p.quantity));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { elasticity: slope, r2, n: valid.length };
}

export interface MenuPricingInput {
  id: string;
  name: string;
  price: number;
  unitCost: number;
  history: PricePoint[];
}

export interface PriceSuggestion {
  id: string;
  name: string;
  currentPrice: number;
  suggestedPrice: number;
  changePct: number;
  elasticity: number;
  confidence: number;
  reason: string;
}

const DEFAULT_ELASTICITY = -1.2;

/**
 * Margin-maximising price via the Lerner rule (p* = c·e/(1+e) for e < -1),
 * bounded by a ±guardrail around the current price and a minimum margin.
 * Inelastic items (|e| ≤ 1) get a modest increase within the guardrail.
 */
export function suggestMenuPrice(item: MenuPricingInput, guardrailPct = 10, minMarginPct = 60): PriceSuggestion {
  const est = estimateElasticity(item.history);
  const e = clamp(est?.elasticity ?? DEFAULT_ELASTICITY, -3, -0.3);
  const lo = item.price * (1 - guardrailPct / 100);
  const hi = item.price * (1 + guardrailPct / 100);
  let target: number;
  let reason: string;
  if (e < -1) {
    target = (item.unitCost * e) / (1 + e);
    reason = `Estimated elasticity ${round2(e)}: profit-maximising price is ₹${round2(target)}`;
  } else {
    target = item.price * 1.05;
    reason = `Demand is price-inelastic (${round2(e)}): a small increase should not reduce orders much`;
  }
  const marginFloor = item.unitCost / (1 - minMarginPct / 100);
  if (target < marginFloor) {
    target = marginFloor;
    reason = `Raise to protect a ${minMarginPct}% gross margin (plate cost ₹${round2(item.unitCost)})`;
  }
  // charm pricing: end in 9 for consumer menus
  const bounded = clamp(target, lo, hi);
  const suggested = Math.max(9, Math.round(bounded / 10) * 10 - 1);
  const confidence = est ? round2(clamp(0.3 + 0.5 * est.r2 + Math.min(0.2, est.n / 200), 0, 0.95)) : 0.35;
  return {
    id: item.id,
    name: item.name,
    currentPrice: item.price,
    suggestedPrice: suggested,
    changePct: round2(((suggested - item.price) / item.price) * 100),
    elasticity: round2(e),
    confidence,
    reason,
  };
}

export interface MarkdownInput {
  id: string;
  price: number;
  stockQty: number;
  avgDailySales: number;
  daysToExpiry: number;
  minPrice?: number;
}

/** Clearance pricing for perishable B2B stock that will not sell before expiry. */
export function markdown(i: MarkdownInput) {
  const sellable = i.avgDailySales * Math.max(0, i.daysToExpiry);
  const unsold = Math.max(0, i.stockQty - sellable);
  if (unsold <= 0 || i.stockQty <= 0) return { id: i.id, discountPct: 0, suggestedPrice: i.price, projectedUnsold: 0 };
  const discountPct = round2(clamp((unsold / i.stockQty) * 50, 5, 40));
  const suggestedPrice = round2(Math.max(i.minPrice ?? 0, i.price * (1 - discountPct / 100)));
  return { id: i.id, discountPct, suggestedPrice, projectedUnsold: round2(unsold) };
}
