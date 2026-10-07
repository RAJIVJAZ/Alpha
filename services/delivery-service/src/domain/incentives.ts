import { isWithinWindow } from '@foodgrid/utils';

export interface SchemeLike {
  type: 'ORDER_COUNT' | 'PEAK_HOURS' | 'LOGIN_HOURS' | 'STREAK' | 'RATING';
  target: number;
  peakWindows?: { start: string; end: string }[] | null;
  minRating?: number | null;
  startsAt: Date;
  endsAt: Date;
}

/** Progress increment a completed delivery contributes to a scheme. */
export function deliveryContribution(
  s: SchemeLike,
  deliveredAt: Date,
  riderRating: number,
): number {
  if (deliveredAt < s.startsAt || deliveredAt > s.endsAt) return 0;
  if (s.minRating && riderRating < s.minRating) return 0;
  switch (s.type) {
    case 'ORDER_COUNT':
      return 1;
    case 'PEAK_HOURS':
      return isWithinWindow(s.peakWindows ?? [], deliveredAt) ? 1 : 0;
    default:
      return 0;
  }
}
