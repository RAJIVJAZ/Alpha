/** Display formatting for Indian rupees, numbers and dates (en-IN, Asia/Kolkata). */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});
const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

const num = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? NaN : Number(v);

/** ₹1,23,456.50 */
export function formatMoney(
  value: number | string | null | undefined,
  opts: { whole?: boolean } = {},
): string {
  const n = num(value);
  if (Number.isNaN(n)) return '—';
  return (opts.whole ? inrWhole : inr).format(n);
}

/** 12.5K, 6.5L, 3.4Cr: thousand, lakh, crore (Intl's en-IN "T" for thousand reads as trillion). */
function indianCompact(n: number): string {
  const a = Math.abs(n);
  // switch units where rounding would otherwise print 100K or 100L
  const [div, suffix] = a >= 1e7 - 5e3 ? [1e7, 'Cr'] : a >= 1e5 - 50 ? [1e5, 'L'] : [1e3, 'K'];
  const v = n / div;
  return `${Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10}${suffix}`;
}

/** ₹950, ₹38K, ₹6.5L, ₹3.4Cr — compact Indian notation for KPI tiles and axes. */
export function formatMoneyCompact(value: number | string | null | undefined): string {
  const n = num(value);
  if (Number.isNaN(n)) return '—';
  if (Math.abs(n) < 1000) return inrWhole.format(n);
  return `${n < 0 ? '-' : ''}₹${indianCompact(Math.abs(n))}`;
}

export function formatNumber(
  value: number | string | null | undefined,
  opts: { compact?: boolean; decimals?: boolean } = {},
): string {
  const n = num(value);
  if (Number.isNaN(n)) return '—';
  if (opts.compact && Math.abs(n) >= 1000) return indianCompact(n);
  return (opts.decimals ? decimal : integer).format(n);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});
const shortDateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Kolkata',
});
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});
const timeFmt = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

const toDate = (v: string | number | Date | null | undefined) =>
  v === null || v === undefined ? null : v instanceof Date ? v : new Date(v);

export const formatDate = (v: string | number | Date | null | undefined) =>
  toDate(v) ? dateFmt.format(toDate(v)!) : '—';
export const formatShortDate = (v: string | number | Date | null | undefined) =>
  toDate(v) ? shortDateFmt.format(toDate(v)!) : '—';
export const formatDateTime = (v: string | number | Date | null | undefined) =>
  toDate(v) ? dateTimeFmt.format(toDate(v)!) : '—';
export const formatTime = (v: string | number | Date | null | undefined) =>
  toDate(v) ? timeFmt.format(toDate(v)!) : '—';

/** "4 min ago", "in 2 h" */
export function formatRelative(
  v: string | number | Date | null | undefined,
  now = Date.now(),
): string {
  const d = toDate(v);
  if (!d) return '—';
  const diff = Math.round((d.getTime() - now) / 60_000);
  const abs = Math.abs(diff);
  const text =
    abs < 1
      ? 'now'
      : abs < 60
        ? `${abs} min`
        : abs < 48 * 60
          ? `${Math.round(abs / 60)} h`
          : `${Math.round(abs / 1440)} d`;
  if (text === 'now') return 'just now';
  return diff < 0 ? `${text} ago` : `in ${text}`;
}

const ACRONYMS = new Set([
  'upi',
  'cod',
  'qr',
  'pos',
  'gst',
  'cgst',
  'sgst',
  'igst',
  'kds',
  'moq',
  'sku',
  'po',
  'tds',
  'tcs',
  'utr',
  'otp',
  'kyc',
  'ev',
  'id',
  'hsn',
  'fssai',
  'gstin',
  'b2b',
  'gmv',
  'aov',
  'api',
  'cpc',
  'cpm',
  'ai',
  'ist',
  'emi',
]);

/** "ORDER_PLACED" -> "Order placed", "UPI" -> "UPI", "EV_SCOOTER" -> "EV scooter" */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const words = value.replace(/[_-]+/g, ' ').trim().toLowerCase().split(/\s+/);
  return words
    .map((w, i) =>
      ACRONYMS.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w,
    )
    .join(' ');
}

/** IST business date (YYYY-MM-DD), optionally shifted by whole days. */
export function istDate(offsetDays = 0, now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

const COUNT_UNITS = new Set(['PCS', 'PACK', 'DOZEN', 'BOX']);

/** "2.98 kg", "47 pcs": weights and volumes to 2 decimals, counted units whole. */
export function formatQty(
  value: number | string | null | undefined,
  unit: string | null | undefined,
): string {
  const n = num(value);
  if (Number.isNaN(n)) return '—';
  const u = (unit ?? '').toUpperCase();
  return `${(COUNT_UNITS.has(u) ? integer : decimal).format(COUNT_UNITS.has(u) ? Math.round(n) : n)}${u ? ` ${u.toLowerCase()}` : ''}`;
}
