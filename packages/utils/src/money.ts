/**
 * Money helpers operating in integer paise to avoid floating point drift.
 * Public functions accept/return rupee numbers or fixed-point strings.
 */
export const toPaise = (rupees: number | string): number => Math.round(Number(rupees) * 100);
export const fromPaise = (paise: number): number => Math.round(paise) / 100;

/** Round half away from zero to 2 decimals. */
export function round2(value: number): number {
  return (Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100)) / 100;
}

export function sumMoney(values: Array<number | string>): number {
  return fromPaise(values.reduce<number>((acc, v) => acc + toPaise(v), 0));
}

/** Fixed-point string used on the wire, e.g. 249 -> "249.00". */
export function money(value: number | string): string {
  return round2(Number(value)).toFixed(2);
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatINR(value: number | string, opts: { compact?: boolean } = {}): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0.00';
  return opts.compact ? inrCompact.format(n) : inrFormatter.format(n);
}

/** Splits an amount into `parts` shares that sum exactly to the amount. */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const paise = toPaise(amount);
  if (total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (paise * w) / total);
  const floored = raw.map(Math.floor);
  let remainder = paise - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] = (floored[i] ?? 0) + 1;
    remainder -= 1;
  }
  return floored.map(fromPaise);
}
