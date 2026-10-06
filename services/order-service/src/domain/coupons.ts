import type { PaymentMethod } from '@foodgrid/types';

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
}

export type CouponCheck =
  | { valid: true }
  | { valid: false; code: string; reason: string };

/** Eligibility rules (minimum order value is applied during pricing so the UI can nudge). */
export function checkCouponEligibility(c: CouponRecord, ctx: CouponContext): CouponCheck {
  const fail = (code: string, reason: string): CouponCheck => ({ valid: false, code, reason });
  if (!c.isActive) return fail('COUPON_INACTIVE', 'This coupon is no longer active');
  if (ctx.now < c.validFrom) return fail('COUPON_NOT_STARTED', 'This coupon is not valid yet');
  if (ctx.now > c.validTo) return fail('COUPON_EXPIRED', 'This coupon has expired');
  if (c.tenantId && c.tenantId !== ctx.tenantId) return fail('COUPON_NOT_APPLICABLE', 'Not valid at this restaurant');
  if (c.outletIds.length && !c.outletIds.includes(ctx.outletId)) {
    return fail('COUPON_NOT_APPLICABLE', 'Not valid at this outlet');
  }
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) return fail('COUPON_EXHAUSTED', 'Coupon usage limit reached');
  if (ctx.userRedemptions >= c.perUserLimit) return fail('COUPON_USED', 'You have already used this coupon');
  if (c.firstOrderOnly && !ctx.isFirstOrder) return fail('COUPON_FIRST_ORDER', 'Valid on your first order only');
  if (c.membersOnly && !ctx.isMember) return fail('COUPON_MEMBERS_ONLY', 'Exclusive to members');
  if (ctx.paymentMethod && c.paymentMethods.length && !c.paymentMethods.includes(ctx.paymentMethod)) {
    return fail('COUPON_PAYMENT_METHOD', `Valid only with ${c.paymentMethods.join(', ')}`);
  }
  return { valid: true };
}
