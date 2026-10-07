import { haversineKm, round2, sigmoid } from '@foodgrid/utils';

export interface OrderRiskFeatures {
  accountAgeDays: number | null;
  ordersLast24h: number;
  failedPaymentsLast24h: number;
  cancelledLast30d: number;
  completedOrders: number;
  isFirstOrder: boolean;
  orderValue: number;
  avgOrderValue: number | null;
  isCod: boolean;
  couponUsed: boolean;
  firstOrderCoupon: boolean;
  accountsOnDevice: number;
  addressDistanceFromUsualKm: number | null;
  hourOfDay: number;
}

export interface RiskAssessment {
  score: number;
  decision: 'ALLOW' | 'REVIEW' | 'BLOCK';
  reasons: string[];
  contributions: Record<string, number>;
}

const BIAS = -3.2;

/**
 * Interpretable logistic risk model (weights tuned on historical chargeback /
 * abuse labels) with hard rules for clear abuse patterns. Contributions are
 * returned so reviewers can see why an order was flagged.
 */
export function scoreOrderRisk(f: OrderRiskFeatures): RiskAssessment {
  const c: Record<string, number> = {};
  const add = (key: string, weight: number) => {
    if (weight) c[key] = round2((c[key] ?? 0) + weight);
  };

  if (f.accountAgeDays === null) add('Unknown account age', 0.3);
  else if (f.accountAgeDays < 1) add('Brand-new account', 1.2);
  else if (f.accountAgeDays < 7) add('Account under a week old', 0.6);
  if (f.ordersLast24h >= 5) add('Order velocity', 0.9 + 0.15 * (f.ordersLast24h - 5));
  if (f.failedPaymentsLast24h >= 3) add('Repeated payment failures', 1.0);
  if (f.cancelledLast30d >= 3) add('Frequent cancellations', 0.8);
  if (f.isCod && f.orderValue > 1500) add('High-value cash on delivery', 0.9);
  if (f.isCod && f.isFirstOrder) add('First order on cash', 0.5);
  if (f.avgOrderValue && f.orderValue / f.avgOrderValue > 4) add('Unusually large basket', 0.8);
  if (f.accountsOnDevice >= 3) add('Many accounts on one device', 1.5);
  else if (f.accountsOnDevice === 2) add('Shared device', 0.6);
  if (f.firstOrderCoupon && f.accountsOnDevice >= 2) add('First-order coupon reuse', 1.5);
  if (f.addressDistanceFromUsualKm !== null && f.addressDistanceFromUsualKm > 30)
    add('Unusual delivery location', 0.4);
  if (f.hourOfDay >= 1 && f.hourOfDay < 5) add('Late-night order', 0.3);
  if (f.completedOrders >= 10) add('Established customer', -1.0);

  const z = BIAS + Object.values(c).reduce((a, b) => a + b, 0);
  const score = round2(sigmoid(z));
  let decision: RiskAssessment['decision'] =
    score >= 0.85 ? 'BLOCK' : score >= 0.6 ? 'REVIEW' : 'ALLOW';
  if (f.accountsOnDevice >= 5) decision = 'BLOCK';
  const reasons = Object.entries(c)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  return { score, decision, reasons, contributions: c };
}

export interface Ping {
  lat: number;
  lng: number;
  at: string;
}

/** GPS spoofing / teleport detection on a rider trail. */
export function analyseTrajectory(
  pings: Ping[],
  drop?: { lat: number; lng: number },
  maxSpeedKmph = 120,
) {
  const sorted = [...pings].sort((a, b) => a.at.localeCompare(b.at));
  const anomalies: { at: string; speedKmph: number }[] = [];
  let distanceKm = 0;
  for (let i = 1; i < sorted.length; i++) {
    const d = haversineKm(sorted[i - 1]!, sorted[i]!);
    distanceKm += d;
    const hours =
      (new Date(sorted[i]!.at).getTime() - new Date(sorted[i - 1]!.at).getTime()) / 3_600_000;
    const speed = hours > 0 ? d / hours : d > 0.05 ? Number.POSITIVE_INFINITY : 0;
    if (speed > maxSpeedKmph)
      anomalies.push({ at: sorted[i]!.at, speedKmph: Number.isFinite(speed) ? round2(speed) : -1 });
  }
  const last = sorted[sorted.length - 1];
  const distanceFromDropM = drop && last ? Math.round(haversineKm(last, drop) * 1000) : null;
  const reasons: string[] = [];
  if (anomalies.length) reasons.push(`${anomalies.length} impossible jump(s) in GPS trail`);
  if (distanceFromDropM !== null && distanceFromDropM > 300)
    reasons.push(`Marked delivered ${distanceFromDropM} m from the drop point`);
  if (sorted.length < 3) reasons.push('Too few location updates');
  const score = round2(
    Math.min(
      1,
      anomalies.length * 0.3 +
        (distanceFromDropM && distanceFromDropM > 300 ? 0.4 : 0) +
        (sorted.length < 3 ? 0.2 : 0),
    ),
  );
  return {
    score,
    decision: score >= 0.7 ? 'BLOCK' : score >= 0.4 ? 'REVIEW' : 'ALLOW',
    reasons,
    anomalies,
    distanceKm: round2(distanceKm),
    distanceFromDropM,
  } as const;
}
