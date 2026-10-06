import { fromPaise, round2, toPaise } from './money';

/**
 * Indian GST helpers.
 *
 * - Intra-state supply: tax split equally into CGST + SGST.
 * - Inter-state supply: full rate charged as IGST.
 * - Restaurant services supplied through an e-commerce operator (ECO) attract
 *   5% GST which the ECO collects and pays under section 9(5).
 * - The ECO also collects TCS (sec 52 CGST Act) on net taxable supplies made
 *   by sellers through it, and deducts TDS under sec 194-O of the IT Act.
 */
export interface GstBreakdown {
  taxableValue: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  total: number;
  isInterState: boolean;
}

export function isInterState(supplierStateCode?: string | null, placeOfSupply?: string | null): boolean {
  if (!supplierStateCode || !placeOfSupply) return false;
  return supplierStateCode.trim() !== placeOfSupply.trim();
}

/** Tax on a tax-exclusive taxable value. */
export function computeGst(taxableValue: number, ratePct: number, interState: boolean): GstBreakdown {
  const taxablePaise = toPaise(taxableValue);
  const totalTaxPaise = Math.round((taxablePaise * ratePct) / 100);
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (interState) {
    igst = totalTaxPaise;
  } else {
    cgst = Math.floor(totalTaxPaise / 2);
    sgst = totalTaxPaise - cgst;
  }
  return {
    taxableValue: fromPaise(taxablePaise),
    rate: ratePct,
    cgst: fromPaise(cgst),
    sgst: fromPaise(sgst),
    igst: fromPaise(igst),
    totalTax: fromPaise(totalTaxPaise),
    total: fromPaise(taxablePaise + totalTaxPaise),
    isInterState: interState,
  };
}

/** Back-calculates taxable value from a tax-inclusive price. */
export function extractGst(inclusiveAmount: number, ratePct: number, interState: boolean): GstBreakdown {
  const taxable = round2(inclusiveAmount / (1 + ratePct / 100));
  const breakdown = computeGst(taxable, ratePct, interState);
  // absorb rounding into tax so that total matches the inclusive amount exactly
  const drift = round2(inclusiveAmount - breakdown.total);
  if (drift !== 0) {
    if (interState) breakdown.igst = round2(breakdown.igst + drift);
    else breakdown.sgst = round2(breakdown.sgst + drift);
    breakdown.totalTax = round2(breakdown.totalTax + drift);
    breakdown.total = round2(inclusiveAmount);
  }
  return breakdown;
}

/** Sums multiple line-level breakdowns. */
export function sumGst(lines: GstBreakdown[]): Omit<GstBreakdown, 'rate'> {
  const acc = { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, total: 0 };
  for (const l of lines) {
    acc.taxableValue += toPaise(l.taxableValue);
    acc.cgst += toPaise(l.cgst);
    acc.sgst += toPaise(l.sgst);
    acc.igst += toPaise(l.igst);
    acc.totalTax += toPaise(l.totalTax);
    acc.total += toPaise(l.total);
  }
  return {
    taxableValue: fromPaise(acc.taxableValue),
    cgst: fromPaise(acc.cgst),
    sgst: fromPaise(acc.sgst),
    igst: fromPaise(acc.igst),
    totalTax: fromPaise(acc.totalTax),
    total: fromPaise(acc.total),
    isInterState: lines.some((l) => l.isInterState),
  };
}

/** Default statutory rates; overridable via configuration. */
export const STATUTORY_RATES = {
  /** GST on platform commission / service fees (SAC 9985). */
  commissionGstPct: 18,
  /** TCS under section 52 CGST Act (0.5% CGST + 0.5% SGST, or 1% IGST). */
  tcsPct: 1,
  /** TDS under section 194-O (reduced to 0.1% from 1 Oct 2024). */
  tdsPct: 0.1,
} as const;

const GSTIN_REGEX = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Validates GSTIN structure and its mod-36 check digit. */
export function isValidGstin(gstin: string): boolean {
  const value = gstin.trim().toUpperCase();
  if (!GSTIN_REGEX.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const code = GSTIN_CHARSET.indexOf(value[i]!);
    const product = code * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  const check = GSTIN_CHARSET[(36 - (sum % 36)) % 36];
  return check === value[14];
}

export const gstinStateCode = (gstin: string) => gstin.slice(0, 2);
