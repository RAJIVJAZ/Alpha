import { inverseNormalCdf, round2, sum } from '@foodgrid/utils';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AssessmentInput {
  currentStock: number;
  reorderLevel: number;
  reorderQty: number;
  maxStock: number | null;
  leadTimeDays: number;
  /** Daily forecast values starting tomorrow (fallback: flat average usage). */
  forecast: number[];
  forecastDates?: string[];
  demandStd: number;
  serviceLevel: number;
  reviewPeriodDays: number;
}

export interface Assessment {
  avgDailyUsage: number;
  daysOfCover: number;
  depletionDate: string | null;
  safetyStock: number;
  reorderPoint: number;
  leadTimeDemand: number;
  suggestedQty: number;
  needsReorder: boolean;
  severity: Severity;
}

/**
 * Forecast-driven reorder decision:
 *   lead-time demand = Σ forecast over the supplier lead time
 *   safety stock     = z(service level) · σ · √L
 *   reorder point    = max(lead-time demand + SS, configured reorder level)
 *   order quantity   = demand over (L + review period) + SS − stock,
 *                      at least the configured reorder qty, capped at max stock.
 */
export function assessIngredient(i: AssessmentInput): Assessment {
  const L = Math.max(1, Math.round(i.leadTimeDays));
  const R = Math.max(1, Math.round(i.reviewPeriodDays));
  const horizon = i.forecast.length ? i.forecast : [0];
  const at = (d: number) => horizon[Math.min(d, horizon.length - 1)] ?? 0;
  const window = (n: number) => sum(Array.from({ length: n }, (_, d) => at(d)));

  const avgDailyUsage = round2(window(Math.min(horizon.length, 14)) / Math.min(horizon.length, 14));
  const z = inverseNormalCdf(Math.min(0.999, Math.max(0.5, i.serviceLevel)));
  const safetyStock = round2(z * Math.max(0, i.demandStd) * Math.sqrt(L));
  const leadTimeDemand = round2(window(L));
  const reorderPoint = round2(Math.max(leadTimeDemand + safetyStock, i.reorderLevel));

  // walk the forecast to find the depletion day
  let remaining = i.currentStock;
  let daysOfCover = Number.POSITIVE_INFINITY;
  let depletionDate: string | null = null;
  if (remaining <= 0) {
    daysOfCover = 0;
    depletionDate = i.forecastDates?.[0] ?? null;
  } else {
    for (let d = 0; d < 365; d++) {
      const demand = at(d);
      if (demand <= 0 && d >= horizon.length) break;
      if (demand >= remaining) {
        daysOfCover = d + (demand > 0 ? remaining / demand : 0);
        depletionDate = i.forecastDates?.[d] ?? null;
        break;
      }
      remaining -= demand;
    }
  }

  const needsReorder = i.currentStock <= reorderPoint;
  const target = window(L + R) + safetyStock;
  let suggested = Math.max(0, target - i.currentStock);
  if (needsReorder) suggested = Math.max(suggested, i.reorderQty);
  if (i.maxStock != null) suggested = Math.min(suggested, Math.max(0, i.maxStock - i.currentStock));

  const cover = Number.isFinite(daysOfCover) ? daysOfCover : 999;
  const severity: Severity =
    i.currentStock <= 0 || cover < 1
      ? 'CRITICAL'
      : cover < L
        ? 'HIGH'
        : cover < L + 2
          ? 'MEDIUM'
          : 'LOW';

  return {
    avgDailyUsage,
    daysOfCover: round2(cover),
    depletionDate,
    safetyStock,
    reorderPoint,
    leadTimeDemand,
    suggestedQty: round2(Math.ceil(suggested * 100) / 100),
    needsReorder,
    severity,
  };
}

export function requiresApproval(total: number, autoApproveBelow: number): boolean {
  return total > autoApproveBelow;
}
