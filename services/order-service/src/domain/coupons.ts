import type { Coupon } from '@foodgrid/database';
import type { PaymentMethod } from '@foodgrid/types';
import { round2 } from '@foodgrid/utils';

export interface CouponRecord {
  code: string;
  tenantId: string | null;
  outletIds: string[];
  type: 'FLAT' | 'PERCENT' | 'FREE_DELIVERY';
  value: number;
  maxDiscount: number | null;
  minOrderValue: number;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  firstOrderOnly: boolean;
  membersOnly: boolean;
  paymentMethods: PaymentMethod[];
  validFrom: Date;
  validTo: Date;
  isActive: boolean;
}

export interface CouponContext {
  now: Date;
  outletId: string;
  tenantId: string;
  isFirstOrder: boolean;
  isMember: boolean;
  userRedemptions: number;
  paymentMethod?: PaymentMethod | null;
  /** Cart subtotal; leave out where there is no cart (offer listings show the minimum as a hint). */
  subtotal?: number;
}

export type CouponCheck = { valid: true } | { valid: false; code: string; reason: string };

export function toCouponRecord(c: Coupon): CouponRecord {
  return {
    ...c,
    value: Number(c.value),
    maxDiscount: c.maxDiscount == null ? null : Number(c.maxDiscount),
    minOrderValue: Number(c.minOrderValue),
  };
}

/**
 * Eligibility rules, shared by applying a code, quoting and checkout so they
 * always agree. The minimum order check comes last: its reason doubles as the
 * "add items worth ₹X more" nudge.
 */
export function checkCouponEligibility(c: CouponRecord, ctx: CouponContext): CouponCheck {
  const fail = (code: string, reason: string): CouponCheck => ({ valid: false, code, reason });
  if (!c.isActive) return fail('COUPON_INACTIVE', 'This coupon is no longer active');
  if (ctx.now < c.validFrom) return fail('COUPON_NOT_STARTED', 'This coupon is not valid yet');
  if (ctx.now > c.validTo) return fail('COUPON_EXPIRED', 'This coupon has expired');
  if (c.tenantId && c.tenantId !== ctx.tenantId)
    return fail('COUPON_NOT_APPLICABLE', 'Not valid at this restaurant');
  if (c.outletIds.length && !c.outletIds.includes(ctx.outletId)) {
    return fail('COUPON_NOT_APPLICABLE', 'Not valid at this outlet');
  }
  if (c.usageLimit != null && c.usedCount >= c.usageLimit)
    return fail('COUPON_EXHAUSTED', 'Coupon usage limit reached');
  if (ctx.userRedemptions >= c.perUserLimit)
    return fail('COUPON_USED', 'You have already used this coupon');
  if (c.firstOrderOnly && !ctx.isFirstOrder)
    return fail('COUPON_FIRST_ORDER', 'Valid on your first order only');
  if (c.membersOnly && !ctx.isMember) return fail('COUPON_MEMBERS_ONLY', 'Exclusive to members');
  if (
    ctx.paymentMethod &&
    c.paymentMethods.length &&
    !c.paymentMethods.includes(ctx.paymentMethod)
  ) {
    return fail('COUPON_PAYMENT_METHOD', `Valid only with ${c.paymentMethods.join(', ')}`);
  }
  if (ctx.subtotal !== undefined && ctx.subtotal < c.minOrderValue) {
    return fail(
      'COUPON_MIN_ORDER',
      `Add items worth ₹${round2(c.minOrderValue - ctx.subtotal)} more to use ${c.code}`,
    );
  }
  return { valid: true };
}
