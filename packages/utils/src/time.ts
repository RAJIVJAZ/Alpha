export const IST_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60 * 1000;

/** Calendar parts of `date` in IST. */
export function istParts(date: Date = new Date()) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    /** 0 = Sunday */
    weekday: shifted.getUTCDay(),
  };
}

/** "YYYY-MM-DD" business date in IST. */
export function istDate(date: Date = new Date()): string {
  const p = istParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Instant at which the IST calendar day containing `date` began (00:00 IST). */
export function istDayStart(date: Date = new Date()): Date {
  return new Date(Date.parse(`${istDate(date)}T00:00:00.000Z`) - IST_OFFSET_MS);
}

/** Instant at which the IST calendar month containing `date` began (e.g. 1 Oct 00:00 IST = 30 Sep 18:30 UTC). */
export function istMonthStart(date: Date = new Date()): Date {
  const p = istParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, 1) - IST_OFFSET_MS);
}

/** UTC midnight Date for a YYYY-MM-DD string — the representation Prisma uses for @db.Date. */
export function dateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Parses "HH:mm" into minutes since midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface OpeningWindow {
  day: number;
  open: string;
  close: string;
}

/** Whether `date` (evaluated in IST) falls within any opening window. Supports past-midnight closes. */
export function isWithinOpeningHours(windows: OpeningWindow[], date: Date = new Date()): boolean {
  if (!windows.length) return true;
  const { weekday, hour, minute } = istParts(date);
  const now = hour * 60 + minute;
  return windows.some((w) => {
    const open = hhmmToMinutes(w.open);
    const close = hhmmToMinutes(w.close);
    if (close > open) return w.day === weekday && now >= open && now < close;
    // window crosses midnight
    if (w.day === weekday && now >= open) return true;
    return (w.day + 1) % 7 === weekday && now < close;
  });
}

export function isWithinWindow(windows: { start: string; end: string }[], date: Date = new Date()): boolean {
  const { hour, minute } = istParts(date);
  const now = hour * 60 + minute;
  return windows.some((w) => now >= hhmmToMinutes(w.start) && now < hhmmToMinutes(w.end));
}
