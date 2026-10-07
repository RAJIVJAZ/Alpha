import { cartSubtotal, computePricing, fallbackDeliveryFee, PricingInput } from './pricing';

const base: PricingInput = {
  lines: [
    { menuItemId: 'biryani', quantity: 2, unitPrice: 250, gstRate: 5 },
    { menuItemId: 'lassi', quantity: 1, unitPrice: 80, gstRate: 5 },
  ],
  packagingCharge: 20,
  deliveryFee: 40,
  platformFee: 5,
  tip: 0,
  interState: false,
};

describe('computePricing', () => {
  it('prices a plain order with food GST and service GST', () => {
    const p = computePricing(base);
    expect(p.subtotal).toBe(580);
    // food: 580 + 20 packaging at 5% = 30; services: (40 + 5) at 18% = 8.10
    expect(p.taxTotal).toBeCloseTo(38.1, 2);
    expect(p.cgst).toBeCloseTo(p.sgst, 1);
    expect(p.igst).toBe(0);
    // 580 + 20 + 40 + 5 + 38.10 = 683.10 -> 683
    expect(p.total).toBe(683);
    expect(p.roundOff).toBeCloseTo(-0.1, 2);
  });

  it('applies percent coupons with caps and reduces taxable value', () => {
    const p = computePricing({
      ...base,
      coupon: { code: 'SAVE50', type: 'PERCENT', value: 50, maxDiscount: 100, minOrderValue: 199 },
    });
    expect(p.couponDiscount).toBe(100);
    expect(p.foodTaxableValue).toBe(500);
    expect(p.lineTax.reduce((s, l) => s + l.taxableValue, 0)).toBeCloseTo(480, 2);
    expect(p.savings).toBe(100);
  });

  it('does not apply coupons below the minimum order value but explains why', () => {
    const p = computePricing({
      ...base,
      coupon: { code: 'BIG', type: 'FLAT', value: 150, maxDiscount: null, minOrderValue: 999 },
    });
    expect(p.couponDiscount).toBe(0);
    expect(p.messages[0]).toContain('BIG');
  });

  it('waives delivery for free-delivery coupons', () => {
    const p = computePricing({
      ...base,
      coupon: {
        code: 'FREEDEL',
        type: 'FREE_DELIVERY',
        value: 0,
        maxDiscount: null,
        minOrderValue: 0,
      },
    });
    expect(p.deliveryFee).toBe(0);
    expect(p.deliveryFeeWaived).toBe(40);
  });

  it('stacks membership benefits on top of coupons', () => {
    const p = computePricing({
      ...base,
      coupon: { code: 'FLAT50', type: 'FLAT', value: 50, maxDiscount: null, minOrderValue: 0 },
      membership: { freeDeliveryAbove: 199, extraDiscountPct: 10, maxDiscountPerOrder: 40 },
    });
    expect(p.couponDiscount).toBe(50);
    expect(p.membershipDiscount).toBe(40); // 10% of 530 = 53, capped at 40
    expect(p.deliveryFee).toBe(0);
    expect(p.savings).toBe(130);
  });

  it('charges IGST for inter-state supply', () => {
    const p = computePricing({ ...base, interState: true });
    expect(p.cgst).toBe(0);
    expect(p.sgst).toBe(0);
    expect(p.igst).toBeCloseTo(38.1, 2);
  });

  it('adds tips outside tax', () => {
    const withTip = computePricing({ ...base, tip: 30 });
    expect(withTip.total - computePricing(base).total).toBe(30);
    expect(withTip.taxTotal).toBe(computePricing(base).taxTotal);
  });

  it('has a sane fallback delivery fee', () => {
    expect(fallbackDeliveryFee(1.5)).toBe(25);
    expect(fallbackDeliveryFee(5)).toBe(49);
  });

  it('splits CGST and SGST evenly on the bill, not line by line', () => {
    // 2.95 + 0.25 of tax: per-line halves would be 1.47/1.48 and 0.12/0.13
    const p = computePricing({
      ...base,
      lines: [
        { menuItemId: 'pani-puri', quantity: 2, unitPrice: 49, gstRate: 5 },
        { menuItemId: 'sev-puri', quantity: 1, unitPrice: 59, gstRate: 5 },
      ],
      packagingCharge: 5,
      deliveryFee: 0,
      platformFee: 0,
    });
    expect(p.taxTotal).toBe(8.1);
    expect(p.cgst).toBe(4.05);
    expect(p.sgst).toBe(4.05);
    expect(p.total).toBe(170);
  });
});

describe('cartSubtotal', () => {
  it('is the subtotal the bill uses, so coupon minimums are judged on the same figure', () => {
    const lines = [
      { menuItemId: 'a', quantity: 3, unitPrice: 33.33, gstRate: 5 },
      { menuItemId: 'b', quantity: 1, unitPrice: 0.1, gstRate: 5 },
    ];
    expect(cartSubtotal(lines)).toBe(100.09);
    expect(cartSubtotal(lines)).toBe(computePricing({ ...base, lines }).subtotal);
  });
});
