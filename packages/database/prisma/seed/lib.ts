import { randomUUID } from 'node:crypto';
import { dateOnly, istDate, round2 } from './helpers';

/**
 * Deterministic PRNG (mulberry32) so every `db:seed` run produces the same
 * demo data set — handy for screenshots, demos and reproducible bug reports.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Picks one item with probability proportional to its weight. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  /** Standard normal via Box-Muller. */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Poisson sample (Knuth for small means, normal approximation above 30). */
  poisson(mean: number): number {
    if (mean <= 0) return 0;
    if (mean > 30) return Math.max(0, Math.round(this.normal(mean, Math.sqrt(mean))));
    const l = Math.exp(-mean);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > l);
    return k - 1;
  }

  digits(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += this.int(0, 9).toString();
    return s;
  }
}

export const id = () => randomUUID();
export const r2 = round2;
export const r3 = (v: number) => Math.round(v * 1000) / 1000;

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;

/** UTC instant of IST midnight `daysAgo` days before today (IST). */
export function istMidnight(daysAgo: number, now: Date = new Date()): Date {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const midnightIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  return new Date(midnightIst - IST_OFFSET_MS - daysAgo * DAY_MS);
}

/** Instant at `hour:minute` IST on the day starting at `istDayStart`. */
export function atIst(istDayStart: Date, hour: number, minute = 0): Date {
  return new Date(istDayStart.getTime() + (hour * 60 + minute) * 60_000);
}

export const addMinutes = (d: Date, mins: number) => new Date(d.getTime() + mins * 60_000);

/** The @db.Date value (UTC midnight) for the IST calendar day of `d`. */
export const istDay = (d: Date) => dateOnly(istDate(d));

/** ISO weekday 1 (Mon) .. 7 (Sun) of the IST calendar day. */
export function istIsoWeekday(d: Date): number {
  const wd = new Date(d.getTime() + IST_OFFSET_MS).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Inserts rows in chunks so large createMany calls stay under bind-parameter limits. */
export async function inChunks<T>(rows: T[], size: number, write: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await write(rows.slice(i, i + size));
}

export function log(step: string, detail?: string | number) {
  console.log(`  • ${step}${detail !== undefined ? ` — ${detail}` : ''}`);
}

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Builds a structurally valid GSTIN (state code + PAN + entity 1 + Z + mod-36 check). */
export function makeGstin(stateCode: string, pan: string, entity = '1'): string {
  const base = `${stateCode}${pan}${entity}Z`;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARSET.indexOf(base[i]!) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return base + GSTIN_CHARSET[(36 - (sum % 36)) % 36];
}
