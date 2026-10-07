import { checkCouponEligibility, CouponRecord } from './coupons';

const coupon: CouponRecord = {
  code: 'WELCOME',
  tenantId: null,
  outletIds: [],
  type: 'PERCENT',
  value: 50,
  maxDiscount: 100,
  minOrderValue: 0,
  usageLimit: 1000,
  perUserLimit: 1,
  usedCount: 10,
  firstOrderOnly: true,
  membersOnly: false,
  paymentMethods: [],
  validFrom: new Date('2026-01-01'),
  validTo: new Date('2026-12-31'),
  isActive: true,
};
const ctx = {
  now: new Date('2026-10-06'),
  outletId: 'o1',
  tenantId: 't1',
  isFirstOrder: true,
  isMember: false,
  userRedemptions: 0,
};

describe('checkCouponEligibility', () => {
  it('accepts an eligible coupon', () => {
    expect(checkCouponEligibility(coupon, ctx)).toEqual({ valid: true });
  });
  it.each([
    [{ isActive: false }, {}, 'COUPON_INACTIVE'],
    [{ validTo: new Date('2026-01-31') }, {}, 'COUPON_EXPIRED'],
    [{ tenantId: 't2' }, {}, 'COUPON_NOT_APPLICABLE'],
    [{ outletIds: ['o9'] }, {}, 'COUPON_NOT_APPLICABLE'],
    [{ usedCount: 1000 }, {}, 'COUPON_EXHAUSTED'],
    [{}, { userRedemptions: 1 }, 'COUPON_USED'],
    [{}, { isFirstOrder: false }, 'COUPON_FIRST_ORDER'],
    [{ membersOnly: true }, {}, 'COUPON_MEMBERS_ONLY'],
    [{ paymentMethods: ['UPI'] }, { paymentMethod: 'CARD' }, 'COUPON_PAYMENT_METHOD'],
    [{ minOrderValue: 299 }, { subtotal: 250 }, 'COUPON_MIN_ORDER'],
  ] as const)('rejects %o / %o with %s', (patch, ctxPatch, code) => {
    const res = checkCouponEligibility(
      { ...coupon, ...patch } as CouponRecord,
      { ...ctx, ...ctxPatch } as typeof ctx,
    );
    expect(res).toMatchObject({ valid: false, code });
  });

  it('checks the minimum order against the cart subtotal, with the nudge as the reason', () => {
    const c = { ...coupon, code: 'FOODGRID20', minOrderValue: 299 };
    expect(checkCouponEligibility(c, { ...ctx, subtotal: 249.5 })).toEqual({
      valid: false,
      code: 'COUPON_MIN_ORDER',
      reason: 'Add items worth ₹49.5 more to use FOODGRID20',
    });
    expect(checkCouponEligibility(c, { ...ctx, subtotal: 299 })).toEqual({ valid: true });
    // offer listings have no cart: the minimum is shown as a hint, not a rejection
    expect(checkCouponEligibility(c, ctx)).toEqual({ valid: true });
  });

  it('reports the more fundamental problem before the minimum order', () => {
    const res = checkCouponEligibility(
      { ...coupon, minOrderValue: 500, validTo: new Date('2026-01-31') },
      { ...ctx, subtotal: 100 },
    );
    expect(res).toMatchObject({ valid: false, code: 'COUPON_EXPIRED' });
  });
});
