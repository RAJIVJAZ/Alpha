import { round2 } from '@foodgrid/utils';

/**
 * Delivery pricing: what the customer pays for delivery and what the rider earns for it.
 * Admins change it as a new DeliveryPricingPolicy version (admin Finance > Delivery pricing);
 * every delivery keeps the version it was priced with. Amounts in rupees.
 */
export interface DeliveryPricing {
  /** Charged when the food subtotal is below `freeDeliveryAbove`. */
  customerFlatFee: number;
  /** Food subtotal from which delivery is free; null means never free. */
  freeDeliveryAbove: number | null;
  riderPerKm: number;
  riderMinPayout: number;
  /** Waiting pay needs a wait longer than this. */
  waitingThresholdMins: number;
  /** One payment per delivery, however long the wait. */
  waitingPay: number;
  /** An arrival at the pickup counts for waiting pay only within this distance of it. */
  arrivalRadiusM: number;
  /** Paid when a delivery is cancelled or fails after the rider reached the pickup. */
  cancellationPay: number;
}

/** The launch rules; also used when no policy version exists yet. */
export const DEFAULT_PRICING: DeliveryPricing = {
  customerFlatFee: 15,
  freeDeliveryAbove: 399,
  riderPerKm: 10,
  riderMinPayout: 33,
  waitingThresholdMins: 5,
  waitingPay: 3,
  arrivalRadiusM: 200,
  cancellationPay: 0,
};

/**
 * Customer delivery fee: a flat fee when the food subtotal (items before discounts, without
 * packaging, taxes or tip) is below the threshold, free from it. Distance and surge do not
 * change it.
 */
export function customerDeliveryFee(p: DeliveryPricing, foodSubtotal: number): number {
  if (p.freeDeliveryAbove != null && foodSubtotal >= p.freeDeliveryAbove) return 0;
  return p.customerFlatFee;
}

/**
 * Payable distance: the pickup-to-drop road estimate fixed when the delivery is created (not
 * the rider's GPS trail, and not the ride to the pickup), to 0.1 km, halves rounded up.
 */
export function payableKm(distanceKm: number): number {
  // the epsilon keeps 1.15 * 10 = 11.4999… rounding up like 1.15 should
  return Math.round(Math.max(0, distanceKm) * 10 + 1e-9) / 10;
}

export interface RiderPay {
  payableKm: number;
  /** payable km × the per-km rate */
  distancePay: number;
  /** what lifts the distance pay to the minimum payout (0 when the distance pay is higher) */
  minimumTopUp: number;
  surgePay: number;
  /** distancePay + minimumTopUp + surgePay */
  total: number;
}

/**
 * Rider pay for a delivered order: the greater of the minimum payout and the per-km rate
 * times the payable distance (the minimum is never added on top), plus surge on that while
 * the zone is surging. Waiting pay and the customer's tip are separate lines.
 */
export function riderPayout(p: DeliveryPricing, distanceKm: number, surge = 1): RiderPay {
  const km = payableKm(distanceKm);
  const distancePay = round2(km * p.riderPerKm);
  const minimumTopUp = round2(Math.max(0, p.riderMinPayout - distancePay));
  const base = round2(distancePay + minimumTopUp);
  const surgePay = round2(base * Math.max(0, surge - 1));
  return { payableKm: km, distancePay, minimumTopUp, surgePay, total: round2(base + surgePay) };
}

export interface WaitingResult {
  /** minutes from the arrival to the end of the wait, to 0.1 */
  waitedMins: number;
  amount: number;
}

/**
 * Waiting pay: a one-time amount when the rider waited longer than the threshold at the
 * pickup, counted from an arrival confirmed by GPS until pickup (or the cancellation).
 */
export function waitingPay(
  p: DeliveryPricing,
  w: { arrivedAt: Date; endedAt: Date; verified: boolean },
): WaitingResult {
  const ms = Math.max(0, w.endedAt.getTime() - w.arrivedAt.getTime());
  const waitedMins = Math.round(ms / 6_000) / 10;
  const amount = w.verified && ms > p.waitingThresholdMins * 60_000 ? p.waitingPay : 0;
  return { waitedMins, amount };
}

/** Customer-facing ETA: remaining prep + rider to restaurant + trip. */
export function deliveryEtaMins(
  prepRemainingMins: number,
  riderToPickupMins: number,
  tripMins: number,
): number {
  return Math.round(Math.max(prepRemainingMins, riderToPickupMins) + tripMins + 3);
}
