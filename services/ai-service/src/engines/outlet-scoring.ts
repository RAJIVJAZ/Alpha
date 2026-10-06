import { clamp, round2 } from '@foodgrid/utils';

export interface OutletMetrics {
  avgRating: number;
  ratingCount: number;
  acceptanceRate: number;
  avgPrepMins: number;
  slaPrepMins: number;
  cancellationRate: number;
  complaintRate: number;
  repeatRate: number;
  onTimeRate: number;
}

const WEIGHTS = {
  rating: 0.25,
  acceptance: 0.15,
  prepTime: 0.15,
  cancellations: 0.15,
  complaints: 0.1,
  repeat: 0.1,
  onTime: 0.1,
} as const;

const TIPS: Record<keyof typeof WEIGHTS, string> = {
  rating: 'Improve food quality and packaging — read recent low-rated reviews and reply to them.',
  acceptance: 'Accept orders faster; enable auto-accept during peak hours.',
  prepTime: 'Preparation is slower than promised — use production planning to pre-prep high-volume items.',
  cancellations: 'Reduce merchant cancellations by marking items out of stock instead of cancelling.',
  complaints: 'Investigate repeated complaints (missing items, cold food) and adjust packaging/checklists.',
  repeat: 'Few customers return — try a loyalty coupon or meal subscriptions.',
  onTime: 'Orders are often late — mark food ready on time so riders are not kept waiting.',
};

/** 0-100 restaurant performance score with grade and improvement tips. */
export function scoreOutlet(m: OutletMetrics) {
  const bayes = (m.avgRating * m.ratingCount + 3.8 * 20) / (m.ratingCount + 20);
  const components: Record<keyof typeof WEIGHTS, number> = {
    rating: clamp((bayes - 3) / 2, 0, 1) * 100,
    acceptance: clamp(m.acceptanceRate, 0, 1) * 100,
    prepTime: clamp(1 - (m.avgPrepMins - m.slaPrepMins) / Math.max(1, m.slaPrepMins), 0, 1) * 100,
    cancellations: clamp(1 - m.cancellationRate / 0.1, 0, 1) * 100,
    complaints: clamp(1 - m.complaintRate / 0.15, 0, 1) * 100,
    repeat: clamp(m.repeatRate / 0.4, 0, 1) * 100,
    onTime: clamp(m.onTimeRate, 0, 1) * 100,
  };
  const score = round2(
    (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce((s, k) => s + WEIGHTS[k] * components[k], 0),
  );
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'E';
  const recommendations = (Object.entries(components) as [keyof typeof WEIGHTS, number][])
    .filter(([, v]) => v < 70)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([k]) => TIPS[k]);
  return {
    score,
    grade,
    components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, round2(v)])),
    recommendations,
  };
}
