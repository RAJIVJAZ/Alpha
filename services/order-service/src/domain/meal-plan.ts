import { addDays, istParts } from '@foodgrid/utils';

/** ISO weekday (1 = Monday ... 7 = Sunday) of a UTC-midnight date. */
export function isoWeekday(date: Date): number {
  const d = date.getUTCDay();
  return d === 0 ? 7 : d;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Meal delivery dates for a subscription: every served weekday from the start
 * date, skipping paused dates, until `mealsTotal` meals are scheduled.
 */
export function scheduleMeals(
  start: Date,
  daysOfWeek: number[],
  mealsTotal: number,
  pausedDates: Date[] = [],
): Date[] {
  if (!daysOfWeek.length || mealsTotal <= 0) return [];
  const paused = new Set(pausedDates.map(ymd));
  const out: Date[] = [];
  let cursor = new Date(`${ymd(start)}T00:00:00.000Z`);
  // hard stop protects against misconfigured plans
  for (let i = 0; out.length < mealsTotal && i < 730; i++) {
    if (daysOfWeek.includes(isoWeekday(cursor)) && !paused.has(ymd(cursor))) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Number of served days in the plan's duration window. */
export function mealsInPlan(durationDays: number, daysOfWeek: number[], start: Date): number {
  let count = 0;
  let cursor = new Date(`${ymd(start)}T00:00:00.000Z`);
  for (let i = 0; i < durationDays; i++) {
    if (daysOfWeek.includes(isoWeekday(cursor))) count++;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/** Today's IST date as UTC midnight (the @db.Date representation). */
export function todayIst(now = new Date()): Date {
  const p = istParts(now);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}
