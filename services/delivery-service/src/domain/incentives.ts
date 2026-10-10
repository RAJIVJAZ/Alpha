import { isWithinWindow } from '@foodgrid/utils';

export interface SchemeLike {
  type: 'ORDER_COUNT' | 'PEAK_HOURS' | 'LOGIN_HOURS' | 'STREAK' | 'RATING';
  target: number;
  peakWindows?: { start: string; end: string }[] | null;
  minRating?: number | null;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Progress increment a completed delivery contributes to a scheme. LOGIN_HOURS
 * and STREAK are totals over attendance instead (see attendanceProgress).
 */
export function deliveryContribution(
  s: SchemeLike,
  deliveredAt: Date,
  riderRating: number,
): number {
  if (deliveredAt < s.startsAt || deliveredAt > s.endsAt) return 0;
  if (s.minRating && riderRating < s.minRating) return 0;
  // RATING counts deliveries made while the rider's rating holds at minRating (checked
  // above); the rider apps show such a scheme as paused below it
  switch (s.type) {
    case 'ORDER_COUNT':
    case 'RATING':
      return 1;
    case 'PEAK_HOURS':
      return isWithinWindow(s.peakWindows ?? [], deliveredAt) ? 1 : 0;
    default:
      return 0;
  }
}

export interface AttendanceDay {
  /** @db.Date: UTC midnight of the IST business day */
  date: Date;
  onlineMinutes: number;
  deliveryCount: number;
}

const DAY_MS = 86_400_000;

/**
 * Progress of an attendance-based scheme from the rider's days inside its
 * window: LOGIN_HOURS counts whole hours online, STREAK the longest run of
 * consecutive days with at least one delivery.
 * shortcut: a streak day needs one delivery; add a per-scheme daily minimum
 * column when ops want "N orders a day" streaks.
 */
export function attendanceProgress(type: SchemeLike['type'], days: AttendanceDay[]): number {
  if (type === 'LOGIN_HOURS')
    return Math.floor(days.reduce((sum, d) => sum + d.onlineMinutes, 0) / 60);
  if (type !== 'STREAK') return 0;
  const worked = [
    ...new Set(days.filter((d) => d.deliveryCount > 0).map((d) => d.date.getTime())),
  ].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  worked.forEach((t, i) => {
    run = i > 0 && t - worked[i - 1]! === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}
