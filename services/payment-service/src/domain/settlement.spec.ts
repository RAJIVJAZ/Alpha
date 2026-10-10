import {
  computeCommission,
  computeSettlementLine,
  resolveCommissionRule,
  CommissionRuleLike,
} from './settlement';

const rule = (p: Partial<CommissionRuleLike>): CommissionRuleLike => ({
  id: 'r',
  tenantType: null,
  tenantId: null,
  outletId: null,
  ratePct: 20,
  fixedFee: 0,
  minFee: null,
  maxFee: null,
  priority: 0,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  isActive: true,
  ...p,
});

describe('commission rules', () => {
  const at = new Date('2026-10-01');
  const rules = [
    rule({ id: 'default', ratePct: 20 }),
    rule({ id: 'carts', tenantType: 'FOOD_CART', ratePct: 8 }),
    rule({ id: 'tenant', tenantId: 't1', ratePct: 15 }),
    rule({ id: 'outlet', outletId: 'o1', ratePct: 12 }),
    rule({ id: 'expired', tenantId: 't2', ratePct: 1, effectiveTo: new Date('2026-06-01') }),
  ];
  it('prefers the most specific active rule', () => {
    expect(
      resolveCommissionRule(rules, { tenantId: 't1', outletId: 'o1', tenantType: 'RESTAURANT', at })
        ?.id,
    ).toBe('outlet');
    expect(
      resolveCommissionRule(rules, { tenantId: 't1', outletId: 'o2', tenantType: 'RESTAURANT', at })
        ?.id,
    ).toBe('tenant');
    expect(
      resolveCommissionRule(rules, { tenantId: 't9', outletId: 'o9', tenantType: 'FOOD_CART', at })
        ?.id,
    ).toBe('carts');
    expect(
      resolveCommissionRule(rules, { tenantId: 't2', outletId: 'o9', tenantType: 'RESTAURANT', at })
        ?.id,
    ).toBe('default');
  });
  it("applies a business override to all of that business's outlets, not to others", () => {
    const withOverride = [
      rule({ id: 'default', ratePct: 20 }),
      rule({ id: 'restaurants', tenantType: 'RESTAURANT', ratePct: 18 }),
      rule({ id: 'override', tenantId: 'biz', ratePct: 12 }),
      rule({ id: 'stale', tenantId: 'biz', ratePct: 5, isActive: false }),
      rule({ id: 'later', tenantId: 'biz', ratePct: 6, effectiveFrom: new Date('2027-01-01') }),
    ];
    const ctx = { tenantType: 'RESTAURANT', at };
    for (const outletId of ['o1', 'o2'])
      expect(resolveCommissionRule(withOverride, { ...ctx, tenantId: 'biz', outletId })?.id).toBe(
        'override',
      );
    expect(
      resolveCommissionRule(withOverride, { ...ctx, tenantId: 'other', outletId: 'o3' })?.id,
    ).toBe('restaurants');
    // the override drives the commission, the 18% GST on it and the payout
    const line = computeSettlementLine(
      {
        subtotal: 1000,
        packagingCharge: 0,
        merchantDiscount: 0,
        deliveryFee: 0,
        platformFee: 0,
        taxTotal: 50,
      },
      resolveCommissionRule(withOverride, { ...ctx, tenantId: 'biz', outletId: 'o1' })!,
    );
    expect(line).toMatchObject({ commission: 120, commissionGst: 21.6, tds: 1, netAmount: 857.4 });
  });
  it('clamps commission to min/max', () => {
    expect(computeCommission({ ratePct: 10, fixedFee: 5, minFee: 20, maxFee: 100 }, 100)).toBe(20);
    expect(computeCommission({ ratePct: 10, fixedFee: 5, minFee: 20, maxFee: 100 }, 5000)).toBe(
      100,
    );
    expect(computeCommission({ ratePct: 18, fixedFee: 0, minFee: null, maxFee: null }, 500)).toBe(
      90,
    );
  });
});

describe('computeSettlementLine', () => {
  it('settles a restaurant order (GST paid by platform under 9(5), TDS 0.1%, no TCS)', () => {
    const line = computeSettlementLine(
      {
        subtotal: 580,
        packagingCharge: 20,
        merchantDiscount: 50,
        deliveryFee: 40,
        platformFee: 5,
        taxTotal: 35.6,
      },
      { ratePct: 20, fixedFee: 0, minFee: null, maxFee: null },
    );
    expect(line.taxableValue).toBe(550);
    expect(line.commission).toBe(110);
    expect(line.commissionGst).toBe(19.8);
    expect(line.tds).toBe(0.55);
    expect(line.tcs).toBe(0);
    expect(line.gstCollected).toBe(27.5); // 35.60 - 18% of 45
    expect(line.netAmount).toBe(419.65);
  });
  it('collects 1% TCS for goods sellers', () => {
    const line = computeSettlementLine(
      {
        subtotal: 10000,
        packagingCharge: 0,
        merchantDiscount: 0,
        deliveryFee: 0,
        platformFee: 0,
        taxTotal: 500,
      },
      { ratePct: 3, fixedFee: 0, minFee: null, maxFee: null },
      { tcsApplicable: true },
    );
    expect(line.tcs).toBe(100);
    expect(line.netAmount).toBe(10000 - 300 - 54 - 100 - 10);
  });
});
