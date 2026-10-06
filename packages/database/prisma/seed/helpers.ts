/**
 * Pure helpers used by the seed, kept local on purpose: @foodgrid/utils
 * depends on @foodgrid/database, so the database package must not depend
 * back on utils (that cycle breaks `turbo build`). Keep these in step with
 * packages/utils/src/{money,time,geo,gst}.ts.
 */

const IST_OFFSET_MS = 330 * 60 * 1000;

// ── money ────────────────────────────────────────────────────────────────────
const toPaise = (rupees: number | string) => Math.round(Number(rupees) * 100);
const fromPaise = (paise: number) => Math.round(paise) / 100;

export function round2(value: number): number {
  return (Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100)) / 100;
}

export function sumMoney(values: Array<number | string>): number {
  return fromPaise(values.reduce<number>((acc, v) => acc + toPaise(v), 0));
}

// ── time (IST business dates) ────────────────────────────────────────────────
export function istParts(date: Date = new Date()) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

export function istDate(date: Date = new Date()): string {
  const p = istParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** UTC midnight for a YYYY-MM-DD string — Prisma's @db.Date representation. */
export function dateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

// ── geo ──────────────────────────────────────────────────────────────────────
export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat: number, lng: number, precision = 6): string {
  let [latMin, latMax, lngMin, lngMax] = [-90, 90, -180, 180];
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngMin = mid;
      } else {
        ch <<= 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch <<= 1;
        latMax = mid;
      }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

// ── GST ──────────────────────────────────────────────────────────────────────
export function isInterState(supplierStateCode?: string | null, placeOfSupply?: string | null): boolean {
  if (!supplierStateCode || !placeOfSupply) return false;
  return supplierStateCode.trim() !== placeOfSupply.trim();
}

/** Tax on a tax-exclusive value: CGST+SGST intra-state, IGST inter-state. */
export function computeGst(taxableValue: number, ratePct: number, interState: boolean) {
  const taxablePaise = toPaise(taxableValue);
  const taxPaise = Math.round((taxablePaise * ratePct) / 100);
  const cgst = interState ? 0 : Math.floor(taxPaise / 2);
  const sgst = interState ? 0 : taxPaise - cgst;
  const igst = interState ? taxPaise : 0;
  return {
    taxableValue: fromPaise(taxablePaise),
    cgst: fromPaise(cgst),
    sgst: fromPaise(sgst),
    igst: fromPaise(igst),
    totalTax: fromPaise(taxPaise),
    total: fromPaise(taxablePaise + taxPaise),
  };
}
