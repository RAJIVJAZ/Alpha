import { allocate, computeGst, round2, sumMoney } from '@foodgrid/utils';

export interface PricingLine {
  menuItemId: string;
  quantity: number;
  /** Final unit price incl. variant and add-ons, tax exclusive. */
  unitPrice: number;
  gstRate: number;
}

export interface PricingCoupon {
  code: string;
  type: 'FLAT' | 'PERCENT' | 'FREE_DELIVERY';
  value: number;
  maxDiscount: number | null;
  minOrderValue: number;
}

export interface MembershipBenefits {
  freeDeliveryAbove?: number | null;
  extraDiscountPct?: number | null;
  maxDiscountPerOrder?: number | null;
}

export interface PricingInput {
  lines: PricingLine[];
  packagingCharge: number;
  deliveryFee: number;
  platformFee: number;
  tip: number;
  coupon?: PricingCoupon | null;
  membership?: MembershipBenefits | null;
  interState: boolean;
  /** GST on delivery & platform fees (services by the platform). */
  serviceGstRate?: number;
}

export interface PricingResult {
  subtotal: number;
  couponDiscount: number;
  membershipDiscount: number;
  deliveryFee: number;
  deliveryFeeWaived: number;
  packagingCharge: number;
  platformFee: number;
  foodTaxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  tip: number;
  roundOff: number;
  total: number;
  savings: number;
  lineTax: { menuItemId: string; taxableValue: number; tax: number }[];
  messages: string[];
}

/** Item total before discounts; coupon minimums are checked against this. */
export function cartSubtotal(lines: Pick<PricingLine, 'unitPrice' | 'quantity'>[]): number {
  return sumMoney(lines.map((l) => round2(l.unitPrice * l.quantity)));
}

/**
 * Consumer order pricing.
 *
 * - Item and coupon/membership discounts reduce the taxable value of food
 *   (pre-supply discounts). Discounts are allocated across lines
 *   proportionally so each line is taxed at its own GST rate.
 * - Packaging follows the principal supply and is taxed at the highest item rate.
 * - Delivery and platform fees are taxed at the service rate (18%).
 * - Grand total is rounded to the nearest rupee; the difference is roundOff.
 */
export function computePricing(input: PricingInput): PricingResult {
  const messages: string[] = [];
  const serviceGstRate = input.serviceGstRate ?? 18;
  const lineTotals = input.lines.map((l) => round2(l.unitPrice * l.quantity));
  const subtotal = cartSubtotal(input.lines);

  // ── coupon ────────────────────────────────────────────────────────────────
  let couponDiscount = 0;
  let deliveryFeeWaived = 0;
  const coupon = input.coupon;
  if (coupon) {
    if (subtotal < coupon.minOrderValue) {
      messages.push(
        `Add items worth ₹${round2(coupon.minOrderValue - subtotal)} more to use ${coupon.code}`,
      );
    } else if (coupon.type === 'FLAT') {
      couponDiscount = Math.min(coupon.value, subtotal);
    } else if (coupon.type === 'PERCENT') {
      couponDiscount = round2((subtotal * coupon.value) / 100);
      if (coupon.maxDiscount != null) couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
    } else if (coupon.type === 'FREE_DELIVERY') {
      deliveryFeeWaived = input.deliveryFee;
    }
  }

  // ── membership ───────────────────────────────────────────────────────────
  let membershipDiscount = 0;
  const m = input.membership;
  if (m) {
    if (m.freeDeliveryAbove != null && subtotal >= m.freeDeliveryAbove && deliveryFeeWaived === 0) {
      deliveryFeeWaived = input.deliveryFee;
      if (input.deliveryFee > 0) messages.push('Free delivery with your membership');
    }
    if (m.extraDiscountPct) {
      const base = subtotal - couponDiscount;
      membershipDiscount = round2((base * m.extraDiscountPct) / 100);
      if (m.maxDiscountPerOrder != null)
        membershipDiscount = Math.min(membershipDiscount, m.maxDiscountPerOrder);
    }
  }

  const itemDiscount = round2(couponDiscount + membershipDiscount);
  const discountShares =
    subtotal > 0 ? allocate(itemDiscount, lineTotals) : lineTotals.map(() => 0);

  // ── GST on food ──────────────────────────────────────────────────────────
  // Tax is computed per line (and kept per line for the invoice), then split
  // into CGST/SGST once on the total: splitting each line rounds the odd paisa
  // the same way every time and the halves drift apart.
  let taxPaise = 0;
  const lineTax = input.lines.map((line, i) => {
    const taxable = round2(lineTotals[i]! - discountShares[i]!);
    const g = computeGst(taxable, line.gstRate, input.interState);
    taxPaise += Math.round(g.totalTax * 100);
    return { menuItemId: line.menuItemId, taxableValue: taxable, tax: g.totalTax };
  });
  const packagingRate = input.lines.reduce((max, l) => Math.max(max, l.gstRate), 0);
  taxPaise += Math.round(
    computeGst(input.packagingCharge, packagingRate, input.interState).totalTax * 100,
  );

  // ── GST on platform services ─────────────────────────────────────────────
  const deliveryFee = round2(input.deliveryFee - deliveryFeeWaived);
  taxPaise += Math.round(
    computeGst(deliveryFee + input.platformFee, serviceGstRate, input.interState).totalTax * 100,
  );

  const cgst = input.interState ? 0 : Math.floor(taxPaise / 2) / 100;
  const sgst = input.interState ? 0 : (taxPaise - Math.floor(taxPaise / 2)) / 100;
  const igst = input.interState ? taxPaise / 100 : 0;
  const taxTotal = round2(cgst + sgst + igst);
  const foodTaxableValue = round2(subtotal - itemDiscount + input.packagingCharge);

  const beforeRound = sumMoney([
    subtotal,
    -itemDiscount,
    input.packagingCharge,
    deliveryFee,
    input.platformFee,
    taxTotal,
    input.tip,
  ]);
  const total = Math.round(beforeRound);
  return {
    subtotal,
    couponDiscount: round2(couponDiscount),
    membershipDiscount,
    deliveryFee,
    deliveryFeeWaived: round2(deliveryFeeWaived),
    packagingCharge: input.packagingCharge,
    platformFee: input.platformFee,
    foodTaxableValue,
    cgst,
    sgst,
    igst,
    taxTotal,
    tip: input.tip,
    roundOff: round2(total - beforeRound),
    total,
    savings: round2(couponDiscount + membershipDiscount + deliveryFeeWaived),
    lineTax,
    messages,
  };
}

/** Local fallback when delivery-service quotes are unavailable. */
export function fallbackDeliveryFee(distanceKm: number): number {
  const base = 25;
  const perKm = 8;
  return round2(base + Math.max(0, distanceKm - 2) * perKm);
}
