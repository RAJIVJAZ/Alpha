import { addDays, istDate, istDayStart } from '@foodgrid/utils';

/**
 * Online minutes of a session per IST business day, so a shift that crosses
 * midnight credits both days instead of losing the minutes.
 */
export function splitByIstDay(start: Date, end: Date): { date: string; minutes: number }[] {
  const days: { date: string; minutes: number }[] = [];
  for (let from = start; from < end;) {
    const midnight = addDays(istDayStart(from), 1);
    const to = midnight < end ? midnight : end;
    const minutes = Math.round((to.getTime() - from.getTime()) / 60_000);
    if (minutes > 0) days.push({ date: istDate(from), minutes });
    from = to;
  }
  return days;
}
