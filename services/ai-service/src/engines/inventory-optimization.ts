import { inverseNormalCdf, round2 } from '@foodgrid/utils';

export interface InventoryItemInput {
  id: string;
  avgDailyDemand: number;
  demandStdDev: number;
  leadTimeDays: number;
  unitCost: number;
  currentStock: number;
  shelfLifeDays?: number | null;
  /** Cost of placing one order (₹). */
  orderingCost?: number;
  /** Annual holding cost as a fraction of unit cost. */
  holdingCostPct?: number;
}

export interface InventoryPolicy {
  id: string;
  safetyStock: number;
  reorderPoint: number;
  eoq: number;
  orderUpTo: number;
  suggestedOrderQty: number;
  daysOfCover: number;
  abcClass?: 'A' | 'B' | 'C';
  annualValue: number;
  flags: ('STOCKOUT_RISK' | 'OVERSTOCK' | 'EXPIRY_RISK')[];
}

/**
 * Periodic-review (R, S) policy with continuous-review safety stock:
 *   SS  = z·σd·√L
 *   ROP = d·L + SS
 *   S   = d·(L+R) + z·σd·√(L+R)
 *   EOQ = √(2·D·K / h)       (capped by shelf life for perishables)
 */
export function optimizeItem(item: InventoryItemInput, serviceLevel = 0.95, reviewPeriodDays = 7): InventoryPolicy {
  const z = inverseNormalCdf(Math.min(0.999, Math.max(0.5, serviceLevel)));
  const d = Math.max(0, item.avgDailyDemand);
  const sigma = Math.max(0, item.demandStdDev);
  const L = Math.max(0, item.leadTimeDays);
  const R = Math.max(1, reviewPeriodDays);
  const safetyStock = z * sigma * Math.sqrt(Math.max(L, 1));
  const reorderPoint = d * L + safetyStock;
  const orderUpTo = d * (L + R) + z * sigma * Math.sqrt(L + R);
  const annualDemand = d * 365;
  const holding = Math.max(0.01, item.unitCost * (item.holdingCostPct ?? 0.25));
  let eoq = annualDemand > 0 ? Math.sqrt((2 * annualDemand * (item.orderingCost ?? 150)) / holding) : 0;
  const shelfCap = item.shelfLifeDays ? d * item.shelfLifeDays : Number.POSITIVE_INFINITY;
  eoq = Math.min(eoq, shelfCap);
  const suggested = Math.min(Math.max(0, orderUpTo - item.currentStock), shelfCap);
  const daysOfCover = d > 0 ? item.currentStock / d : Number.POSITIVE_INFINITY;

  const flags: InventoryPolicy['flags'] = [];
  if (item.currentStock <= reorderPoint) flags.push('STOCKOUT_RISK');
  if (d > 0 && daysOfCover > Math.max(30, 3 * (L + R))) flags.push('OVERSTOCK');
  if (item.shelfLifeDays && daysOfCover > item.shelfLifeDays) flags.push('EXPIRY_RISK');

  return {
    id: item.id,
    safetyStock: round2(safetyStock),
    reorderPoint: round2(reorderPoint),
    eoq: round2(eoq),
    orderUpTo: round2(orderUpTo),
    suggestedOrderQty: round2(Math.ceil(suggested * 100) / 100),
    daysOfCover: Number.isFinite(daysOfCover) ? round2(daysOfCover) : -1,
    annualValue: round2(annualDemand * item.unitCost),
    flags,
  };
}

/**
 * ABC analysis on annual consumption value. Items are classified by the
 * cumulative share *before* they are added, so an item straddling a boundary
 * lands in the higher class: A until 80%, B until 95%, C for the tail.
 */
export function abcClassify(policies: InventoryPolicy[]): InventoryPolicy[] {
  const total = policies.reduce((s, p) => s + p.annualValue, 0);
  const sorted = [...policies].sort((a, b) => b.annualValue - a.annualValue);
  let cumulative = 0;
  return sorted.map((p) => {
    const before = total > 0 ? cumulative / total : 0;
    cumulative += p.annualValue;
    return { ...p, abcClass: before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C' };
  });
}
