import { clamp, round2, STATUTORY_RATES } from '@foodgrid/utils';

export interface CommissionRuleLike {
  id: string;
  tenantType: string | null;
  tenantId: string | null;
  outletId: string | null;
  ratePct: number;
  fixedFee: number;
  minFee: number | null;
  maxFee: number | null;
  priority: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
}

/** Specificity: outlet > tenant > tenant type > platform default; then priority. */
export function resolveCommissionRule(
  rules: CommissionRuleLike[],
  ctx: { tenantId: string; outletId: string; tenantType?: string | null; at: Date },
): CommissionRuleLike | null {
  const specificity = (r: CommissionRuleLike) =>
    r.outletId ? 3 : r.tenantId ? 2 : r.tenantType ? 1 : 0;
  const applicable = rules.filter(
    (r) =>
      r.isActive &&
      r.effectiveFrom <= ctx.at &&
      (!r.effectiveTo || r.effectiveTo > ctx.at) &&
      (!r.outletId || r.outletId === ctx.outletId) &&
      (!r.tenantId || r.tenantId === ctx.tenantId) &&
      (!r.tenantType || r.tenantType === ctx.tenantType),
  );
  applicable.sort((a, b) => specificity(b) - specificity(a) || b.priority - a.priority);
  return applicable[0] ?? null;
}

export function computeCommission(
  rule: Pick<CommissionRuleLike, 'ratePct' | 'fixedFee' | 'minFee' | 'maxFee'>,
  base: number,
): number {
  const raw = (base * rule.ratePct) / 100 + rule.fixedFee;
  return round2(clamp(raw, rule.minFee ?? 0, rule.maxFee ?? Number.POSITIVE_INFINITY));
}

export interface OrderAmounts {
  subtotal: number;
  packagingCharge: number;
  /** Discount funded by the merchant (coupon funded by MERCHANT, half of SHARED). */
  merchantDiscount: number;
  deliveryFee: number;
  platformFee: number;
  taxTotal: number;
}

export interface SettlementLineAmounts {
  taxableValue: number;
  gstCollected: number;
  commission: number;
  commissionGst: number;
  tcs: number;
  tds: number;
  netAmount: number;
}

/**
 * Restaurant services sold through an e-commerce operator: the platform pays
 * the 5% GST itself under section 9(5) of the CGST Act, so no TCS is
 * collected from the restaurant; TDS under section 194-O applies on the
 * gross amount. The platform invoices its commission with 18% GST.
 *
 * `tcsApplicable` is true for goods sellers (B2B marketplace) where the
 * seller pays GST and the platform collects 1% TCS.
 */
export function computeSettlementLine(
  order: OrderAmounts,
  commissionRule: Pick<CommissionRuleLike, 'ratePct' | 'fixedFee' | 'minFee' | 'maxFee'>,
  opts: { tcsApplicable?: boolean; serviceGstRate?: number } = {},
): SettlementLineAmounts {
  const serviceGstRate = opts.serviceGstRate ?? 18;
  const merchantGross = round2(order.subtotal + order.packagingCharge - order.merchantDiscount);
  const serviceGst = round2(((order.deliveryFee + order.platformFee) * serviceGstRate) / 100);
  const gstCollected = round2(Math.max(0, order.taxTotal - serviceGst));
  const commission = computeCommission(commissionRule, merchantGross);
  const commissionGst = round2((commission * STATUTORY_RATES.commissionGstPct) / 100);
  const tcs = opts.tcsApplicable ? round2((merchantGross * STATUTORY_RATES.tcsPct) / 100) : 0;
  const tds = round2((merchantGross * STATUTORY_RATES.tdsPct) / 100);
  return {
    taxableValue: merchantGross,
    gstCollected,
    commission,
    commissionGst,
    tcs,
    tds,
    netAmount: round2(merchantGross - commission - commissionGst - tcs - tds),
  };
}

/** Default commission when no rule matches (percent). */
export const DEFAULT_COMMISSION = { ratePct: 18, fixedFee: 0, minFee: null, maxFee: null };
