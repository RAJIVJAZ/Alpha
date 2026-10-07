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
  ] as const)('rejects %o / %o with %s', (patch, ctxPatch, code) => {
    const res = checkCouponEligibility(
      { ...coupon, ...patch } as CouponRecord,
      { ...ctx, ...ctxPatch } as typeof ctx,
    );
    expect(res).toMatchObject({ valid: false, code });
  });
});
