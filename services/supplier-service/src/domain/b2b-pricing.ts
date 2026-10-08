import { computeGst, round2, sumMoney } from '@foodgrid/utils';

export type Segment = 'ALL' | 'RESTAURANT' | 'RETAILER' | 'DEALER';

export interface TierLike {
  minQty: number;
  maxQty: number | null;
  unitPrice: number;
  segment: Segment;
  validFrom?: Date | null;
  validTo?: Date | null;
}

/**
 * Bulk pricing: the applicable tier is the one with the highest minQty ≤ qty
 * for the buyer's segment (falling back to ALL); segment-specific tiers win
 * over generic ones at the same break. Without a tier the base price applies.
 */
export function tierPrice(
  basePrice: number,
  tiers: TierLike[],
  qty: number,
  segment: Segment,
  at = new Date(),
): number {
  const valid = tiers.filter(
    (t) =>
      (t.segment === segment || t.segment === 'ALL') &&
      qty >= t.minQty &&
      (t.maxQty == null || qty <= t.maxQty) &&
      (!t.validFrom || t.validFrom <= at) &&
      (!t.validTo || t.validTo >= at),
  );
  valid.sort(
    (a, b) => b.minQty - a.minQty || Number(b.segment !== 'ALL') - Number(a.segment !== 'ALL'),
  );
  return valid[0]?.unitPrice ?? basePrice;
}

/** Catalogue price of a product row (Prisma decimals) for a buyer segment at a quantity. */
export function catalogueUnitPrice(
  product: {
    price: unknown;
    priceTiers: {
      minQty: unknown;
      maxQty: unknown;
      unitPrice: unknown;
      segment: string;
      validFrom: Date | null;
      validTo: Date | null;
    }[];
  },
  qty: number,
  segment: Segment,
): number {
  return tierPrice(
    Number(product.price),
    product.priceTiers.map((t) => ({
      ...t,
      minQty: Number(t.minQty),
      maxQty: t.maxQty == null ? null : Number(t.maxQty),
      unitPrice: Number(t.unitPrice),
      segment: t.segment as Segment,
    })),
    qty,
    segment,
  );
}

const CREDIT_DAYS: Record<string, number> = { NET_7: 7, NET_15: 15, NET_30: 30 };

/** Days of credit a payment term grants; PREPAID and COD grant none. */
export const creditDays = (terms: string): number => CREDIT_DAYS[terms] ?? 0;

export interface QuantityRules {
  moq: number;
  stepQty: number;
  maxOrderQty: number | null;
}

export function validateQuantity(qty: number, rules: QuantityRules): string | null {
  if (qty < rules.moq) return `Minimum order quantity is ${rules.moq}`;
  if (rules.maxOrderQty != null && qty > rules.maxOrderQty)
    return `Maximum order quantity is ${rules.maxOrderQty}`;
  const step = rules.stepQty > 0 ? rules.stepQty : 1;
  const units = (qty - rules.moq) / step;
  if (Math.abs(units - Math.round(units)) > 1e-6)
    return `Order in multiples of ${step} above the MOQ`;
  return null;
}

export interface B2bLineInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
}

export interface B2bTotals {
  lines: (B2bLineInput & { taxable: number; tax: number; lineTotal: number })[];
  subtotal: number;
  discount: number;
  taxTotal: number;
  deliveryCharge: number;
  total: number;
  cgst: number;
  sgst: number;
  igst: number;
}

/** Totals for a B2B order: dealer discount reduces taxable value; delivery is taxed at 18%. */
export function computeB2bTotals(
  lines: B2bLineInput[],
  opts: { discountPct: number; deliveryCharge: number; interState: boolean },
): B2bTotals {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const priced = lines.map((l) => {
    const gross = round2(l.quantity * l.unitPrice);
    const taxable = round2(gross * (1 - opts.discountPct / 100));
    const g = computeGst(taxable, l.gstRate, opts.interState);
    cgst += g.cgst;
    sgst += g.sgst;
    igst += g.igst;
    return { ...l, taxable, tax: g.totalTax, lineTotal: g.total };
  });
  const subtotal = sumMoney(lines.map((l) => round2(l.quantity * l.unitPrice)));
  const taxableTotal = sumMoney(priced.map((p) => p.taxable));
  const delivery = computeGst(opts.deliveryCharge, 18, opts.interState);
  cgst += delivery.cgst;
  sgst += delivery.sgst;
  igst += delivery.igst;
  const taxTotal = round2(cgst + sgst + igst);
  return {
    lines: priced,
    subtotal,
    discount: round2(subtotal - taxableTotal),
    taxTotal,
    deliveryCharge: opts.deliveryCharge,
    total: round2(taxableTotal + opts.deliveryCharge + taxTotal),
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
  };
}
