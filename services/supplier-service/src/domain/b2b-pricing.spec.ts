import {
  catalogueUnitPrice,
  computeB2bTotals,
  creditDays,
  tierPrice,
  validateQuantity,
} from './b2b-pricing';
import { deliveryChargeFor, findZone, slotBookable } from './logistics';

describe('bulk pricing tiers', () => {
  const tiers = [
    { minQty: 10, maxQty: null, unitPrice: 950, segment: 'ALL' as const },
    { minQty: 50, maxQty: null, unitPrice: 900, segment: 'ALL' as const },
    { minQty: 50, maxQty: null, unitPrice: 870, segment: 'DEALER' as const },
  ];
  it('picks the highest applicable break', () => {
    expect(tierPrice(1000, tiers, 5, 'RESTAURANT')).toBe(1000);
    expect(tierPrice(1000, tiers, 10, 'RESTAURANT')).toBe(950);
    expect(tierPrice(1000, tiers, 60, 'RESTAURANT')).toBe(900);
  });
  it('prefers segment-specific tiers', () => {
    expect(tierPrice(1000, tiers, 60, 'DEALER')).toBe(870);
  });
  it('ignores expired tiers', () => {
    expect(tierPrice(1000, [{ ...tiers[0]!, validTo: new Date('2020-01-01') }], 20, 'ALL')).toBe(
      1000,
    );
  });
});

describe('catalogue price for a buyer', () => {
  const tier = (over: object) => ({
    minQty: '1',
    maxQty: null,
    unitPrice: '0',
    segment: 'ALL',
    validFrom: null,
    validTo: null,
    ...over,
  });
  const flour = {
    price: '680',
    priceTiers: [
      tier({ unitPrice: '400', validTo: new Date('2026-01-31T23:59:59Z') }), // expired promo
      tier({ unitPrice: '410', validFrom: new Date('2999-01-01') }), // not started
      tier({ unitPrice: '450', maxQty: '2' }), // trial price, capped
      tier({ unitPrice: '500', segment: 'RETAILER' }),
    ],
  };
  it('ignores expired, future, over-cap and other-segment tiers', () => {
    expect(catalogueUnitPrice(flour, 4, 'RESTAURANT')).toBe(680);
    expect(catalogueUnitPrice(flour, 4, 'DEALER')).toBe(680);
    expect(catalogueUnitPrice(flour, 2, 'RESTAURANT')).toBe(450);
    expect(catalogueUnitPrice(flour, 2, 'RETAILER')).toBe(500);
  });
});

describe('credit terms', () => {
  it('ranks terms by days of credit', () => {
    expect(['PREPAID', 'COD', 'NET_7', 'NET_15', 'NET_30'].map(creditDays)).toEqual([
      0, 0, 7, 15, 30,
    ]);
  });
});

describe('quantity rules', () => {
  it('enforces MOQ, steps and maximum', () => {
    const rules = { moq: 5, stepQty: 5, maxOrderQty: 100 };
    expect(validateQuantity(3, rules)).toMatch(/Minimum/);
    expect(validateQuantity(12, rules)).toMatch(/multiples/);
    expect(validateQuantity(150, rules)).toMatch(/Maximum/);
    expect(validateQuantity(15, rules)).toBeNull();
  });
});

describe('B2B totals', () => {
  it('applies dealer discount before GST and taxes delivery at 18%', () => {
    const t = computeB2bTotals(
      [
        { productId: 'sugar', quantity: 10, unitPrice: 2000, gstRate: 5 },
        { productId: 'boxes', quantity: 4, unitPrice: 500, gstRate: 18 },
      ],
      { discountPct: 5, deliveryCharge: 200, interState: false },
    );
    expect(t.subtotal).toBe(22000);
    expect(t.discount).toBe(1100);
    // 19000 @5% = 950 ; 1900 @18% = 342 ; delivery 200 @18% = 36
    expect(t.taxTotal).toBe(1328);
    expect(t.total).toBe(20900 + 200 + 1328);
    expect(t.igst).toBe(0);
  });
});

describe('logistics', () => {
  const zones = [
    {
      id: 'pin',
      pincodes: ['560038'],
      centerLat: null,
      centerLng: null,
      radiusKm: null,
      deliveryCharge: 0,
      freeDeliveryAbove: null,
      minOrderValue: 0,
      leadTimeHours: 12,
      isActive: true,
    },
    {
      id: 'radius',
      pincodes: [],
      centerLat: 12.97,
      centerLng: 77.59,
      radiusKm: 10,
      deliveryCharge: 150,
      freeDeliveryAbove: 5000,
      minOrderValue: 1000,
      leadTimeHours: 24,
      isActive: true,
    },
  ];
  it('matches pincode before radius', () => {
    expect(findZone(zones, { pincode: '560038', lat: 12.97, lng: 77.59 })?.id).toBe('pin');
    expect(findZone(zones, { pincode: '560001', lat: 12.98, lng: 77.6 })?.id).toBe('radius');
    expect(findZone(zones, { pincode: '110001', lat: 28.6, lng: 77.2 })).toBeNull();
  });
  it('waives delivery above the threshold', () => {
    expect(deliveryChargeFor(zones[1]!, 4999)).toBe(150);
    expect(deliveryChargeFor(zones[1]!, 5000)).toBe(0);
  });
  it('checks slot day, capacity and cut-off', () => {
    const slot = {
      dayOfWeek: 3,
      startTime: '09:00',
      endTime: '12:00',
      capacity: 2,
      cutoffMinutes: 720,
      isActive: true,
    };
    const now = new Date('2026-10-06T10:00:00+05:30'); // Tuesday
    expect(slotBookable(slot, '2026-10-07', 0, now).ok).toBe(true); // Wed 09:00, cut-off Tue 21:00
    expect(slotBookable(slot, '2026-10-07', 2, now).reason).toBe('Slot is full');
    expect(slotBookable(slot, '2026-10-08', 0, now).reason).toMatch(/not offered/);
    expect(
      slotBookable(slot, '2026-10-07', 0, new Date('2026-10-06T22:00:00+05:30')).reason,
    ).toMatch(/cut-off/);
  });
});
