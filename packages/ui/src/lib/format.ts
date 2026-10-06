/** Display formatting for Indian rupees, numbers and dates (en-IN, Asia/Kolkata). */

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/** ₹1,23,456.50 */
export function formatMoney(value: number | string | null | undefined, opts: { whole?: boolean } = {}): string {
  const n = num(value);
  if (Number.isNaN(n)) return '—';
  return (opts.whole ? inrWhole : inr).format(n);
}

/** ₹1.2L, ₹3.4Cr — Indian compact notation for KPI tiles and axes. */
export function formatMoneyCompact(value: number | string | null | undefined): string {
  const n = num(value);
  if (Number.isNaN(n)) return '—';
  return Math.abs(n) < 1000 ? inrWhole.format(n) : `₹${compact.format(n)}`;
}

export function formatNumber(value: number | string | null | undefined, opts: { compact?: boolean; decimals?: boolean } = {}): string {
  const n = num(value);
  if (Number.isNaN(n)) return '—';
  if (opts.compact && Math.abs(n) >= 1000) return compact.format(n);
  return (opts.decimals ? decimal : integer).format(n);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const shortDateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

const toDate = (v: string | number | Date | null | undefined) => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(v));

export const formatDate = (v: string | number | Date | null | undefined) => (toDate(v) ? dateFmt.format(toDate(v)!) : '—');
export const formatShortDate = (v: string | number | Date | null | undefined) => (toDate(v) ? shortDateFmt.format(toDate(v)!) : '—');
export const formatDateTime = (v: string | number | Date | null | undefined) => (toDate(v) ? dateTimeFmt.format(toDate(v)!) : '—');
export const formatTime = (v: string | number | Date | null | undefined) => (toDate(v) ? timeFmt.format(toDate(v)!) : '—');

/** "4 min ago", "in 2 h" */
export function formatRelative(v: string | number | Date | null | undefined, now = Date.now()): string {
  const d = toDate(v);
  if (!d) return '—';
  const diff = Math.round((d.getTime() - now) / 60_000);
  const abs = Math.abs(diff);
  const text = abs < 1 ? 'now' : abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`;
  if (text === 'now') return 'just now';
  return diff < 0 ? `${text} ago` : `in ${text}`;
}

/** "ORDER_PLACED" -> "Order placed" */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const s = value.replace(/[_-]+/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** IST business date (YYYY-MM-DD), optionally shifted by whole days. */
export function istDate(offsetDays = 0, now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}
