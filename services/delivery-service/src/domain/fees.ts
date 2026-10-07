import { round2 } from '@foodgrid/utils';

export interface ZoneTariff {
  baseFee: number;
  perKmFee: number;
  freeKm: number;
  riderBasePay: number;
  riderPerKm: number;
}

/** Used when a pickup falls outside every configured zone. */
export const DEFAULT_TARIFF: ZoneTariff = {
  baseFee: 25,
  perKmFee: 8,
  freeKm: 2,
  riderBasePay: 30,
  riderPerKm: 6,
};

/** Customer delivery fee: base + per-km beyond the free radius, times surge. */
export function deliveryFee(t: ZoneTariff, distanceKm: number, surge = 1): number {
  const raw = t.baseFee + Math.max(0, distanceKm - t.freeKm) * t.perKmFee;
  return Math.round(raw * surge);
}

export interface EarningBreakdown {
  basePay: number;
  distancePay: number;
  surgePay: number;
  waitingPay: number;
  total: number;
}

/**
 * Rider payout per delivery: base + per-km for the whole trip; surge is paid
 * on top; waiting time beyond 10 minutes at the restaurant is compensated.
 */
export function riderEarning(
  t: ZoneTariff,
  distanceKm: number,
  surge = 1,
  waitingMins = 0,
): EarningBreakdown {
  const basePay = t.riderBasePay;
  const distancePay = round2(distanceKm * t.riderPerKm);
  const surgePay = round2((basePay + distancePay) * Math.max(0, surge - 1));
  const waitingPay = round2(Math.max(0, waitingMins - 10) * 1);
  return {
    basePay,
    distancePay,
    surgePay,
    waitingPay,
    total: round2(basePay + distancePay + surgePay + waitingPay),
  };
}

/**
 * Splits a quoted rider earning (tip excluded) back into base, distance and
 * surge lines for the earnings statement. Lines always sum to the quote.
 */
export function splitEarning(
  total: number,
  surge: number,
  riderBasePay: number,
): Pick<EarningBreakdown, 'basePay' | 'distancePay' | 'surgePay'> {
  const beforeSurge = surge > 1 ? total / surge : total;
  const basePay = round2(Math.min(beforeSurge, riderBasePay));
  const surgePay = round2(total - beforeSurge);
  return { basePay, distancePay: round2(total - basePay - surgePay), surgePay };
}

/** Customer-facing ETA: remaining prep + rider to restaurant + trip. */
export function deliveryEtaMins(
  prepRemainingMins: number,
  riderToPickupMins: number,
  tripMins: number,
): number {
  return Math.round(Math.max(prepRemainingMins, riderToPickupMins) + tripMins + 3);
}
