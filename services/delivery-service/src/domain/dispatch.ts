import { clamp, round2 } from '@foodgrid/utils';

export interface RiderCandidate {
  riderId: string;
  distanceToPickupKm: number;
  rating: number;
  acceptanceRate: number;
  /** Minutes since the rider's last completed delivery (fairness). */
  idleMinutes: number;
  activeDeliveries: number;
}

/**
 * Assignment score in [0,1]: proximity dominates, then acceptance likelihood,
 * quality and fairness (riders idle longer get priority). Riders already
 * carrying an order are only considered for batching.
 */
export function scoreRider(c: RiderCandidate, maxRadiusKm: number): number {
  if (c.activeDeliveries >= 2) return 0;
  const proximity = clamp(1 - c.distanceToPickupKm / maxRadiusKm, 0, 1);
  const acceptance = clamp(c.acceptanceRate, 0, 1);
  const quality = clamp((c.rating - 3) / 2, 0, 1);
  const fairness = clamp(c.idleMinutes / 45, 0, 1);
  const batchingPenalty = c.activeDeliveries > 0 ? 0.7 : 1;
  return round2(
    (0.5 * proximity + 0.2 * acceptance + 0.15 * quality + 0.15 * fairness) * batchingPenalty,
  );
}

export function rankCandidates(
  candidates: RiderCandidate[],
  maxRadiusKm: number,
  exclude: Set<string> = new Set(),
) {
  return candidates
    .filter((c) => !exclude.has(c.riderId) && c.distanceToPickupKm <= maxRadiusKm)
    .map((c) => ({ ...c, score: scoreRider(c, maxRadiusKm) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Search radius expands with each failed offer round. */
export const searchRadiusKm = (attempt: number) => [3, 5, 8, 12][Math.min(attempt, 3)]!;

/** Exponential moving acceptance rate (recent behaviour weighs more). */
export function updateAcceptanceRate(current: number, accepted: boolean, weight = 0.1): number {
  return round2(current * (1 - weight) + (accepted ? 1 : 0) * weight);
}
