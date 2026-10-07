import { analyseTrajectory, scoreOrderRisk, OrderRiskFeatures } from './fraud';
import { abcClassify, optimizeItem } from './inventory-optimization';
import { deliverySurge, estimateElasticity, markdown, suggestMenuPrice } from './dynamic-pricing';
import { bestByStrategy, rankSuppliers, SupplierOffer } from './supplier-ranking';
import { isFeasible, optimizeRoute, Stop } from './routing';
import { rankOutlets, recommendItems } from './recommendations';
import { scoreOutlet } from './outlet-scoring';

describe('inventory optimisation', () => {
  it('computes safety stock, reorder point and EOQ', () => {
    const p = optimizeItem(
      {
        id: 'flour',
        avgDailyDemand: 10,
        demandStdDev: 3,
        leadTimeDays: 4,
        unitCost: 40,
        currentStock: 30,
      },
      0.95,
      7,
    );
    expect(p.safetyStock).toBeCloseTo(1.645 * 3 * 2, 1);
    expect(p.reorderPoint).toBeCloseTo(40 + 9.87, 1);
    expect(p.eoq).toBeCloseTo(Math.sqrt((2 * 3650 * 150) / 10), 0);
    expect(p.flags).toContain('STOCKOUT_RISK');
    expect(p.suggestedOrderQty).toBeGreaterThan(80);
  });
  it('caps perishable orders at shelf life and flags expiry risk', () => {
    const p = optimizeItem({
      id: 'milk',
      avgDailyDemand: 20,
      demandStdDev: 2,
      leadTimeDays: 1,
      unitCost: 60,
      currentStock: 200,
      shelfLifeDays: 3,
    });
    expect(p.eoq).toBeLessThanOrEqual(60);
    expect(p.flags).toContain('EXPIRY_RISK');
  });
  it('classifies by consumption value', () => {
    const items = [
      optimizeItem({
        id: 'a',
        avgDailyDemand: 100,
        demandStdDev: 1,
        leadTimeDays: 1,
        unitCost: 100,
        currentStock: 0,
      }),
      optimizeItem({
        id: 'b',
        avgDailyDemand: 10,
        demandStdDev: 1,
        leadTimeDays: 1,
        unitCost: 100,
        currentStock: 0,
      }),
      optimizeItem({
        id: 'c',
        avgDailyDemand: 1,
        demandStdDev: 1,
        leadTimeDays: 1,
        unitCost: 10,
        currentStock: 0,
      }),
    ];
    const classes = Object.fromEntries(abcClassify(items).map((p) => [p.id, p.abcClass]));
    expect(classes).toEqual({ a: 'A', b: 'B', c: 'C' });
  });
});

describe('supplier ranking', () => {
  const base: Omit<SupplierOffer, 'productId' | 'supplierTenantId' | 'supplierName'> = {
    productName: 'Maida 25kg',
    unitPrice: 900,
    baseQtyPerPack: 25,
    moq: 1,
    stepQty: 1,
    gstRate: 0,
    deliveryCharge: 100,
    leadTimeHours: 24,
    rating: 4.2,
    ratingCount: 50,
    onTimeRate: 0.9,
    fillRate: 0.95,
    stockQty: 1000,
  };
  const offers: SupplierOffer[] = [
    {
      ...base,
      productId: 'cheap',
      supplierTenantId: 's1',
      supplierName: 'Cheap Mills',
      unitPrice: 850,
      leadTimeHours: 72,
      rating: 3.6,
      onTimeRate: 0.7,
    },
    {
      ...base,
      productId: 'fast',
      supplierTenantId: 's2',
      supplierName: 'Quick Supply',
      unitPrice: 980,
      leadTimeHours: 6,
    },
    {
      ...base,
      productId: 'best',
      supplierTenantId: 's3',
      supplierName: 'Premium Foods',
      unitPrice: 940,
      rating: 4.9,
      ratingCount: 400,
      onTimeRate: 0.99,
      fillRate: 1,
    },
    {
      ...base,
      productId: 'oos',
      supplierTenantId: 's4',
      supplierName: 'Empty Shelves',
      unitPrice: 500,
      stockQty: 0,
    },
  ];
  it('picks a different winner per strategy and never an out-of-stock offer', () => {
    const best = bestByStrategy(offers, 100);
    expect(best.LOWEST_COST?.productId).toBe('cheap');
    expect(best.FASTEST?.productId).toBe('fast');
    expect(best.BEST_RATED?.productId).toBe('best');
    expect(Object.values(best).some((b) => b?.productId === 'oos')).toBe(false);
  });
  it('costs packs with MOQ, tiers and free delivery', () => {
    const [r] = rankSuppliers(
      [
        {
          ...base,
          productId: 'p',
          supplierTenantId: 's',
          supplierName: 'S',
          moq: 5,
          gstRate: 5,
          freeDeliveryAbove: 4000,
          tiers: [{ minQty: 5, unitPrice: 800 }],
        },
      ],
      30,
      'LOWEST_COST',
    );
    expect(r!.packs).toBe(5); // 2 packs needed, MOQ 5
    expect(r!.subtotal).toBe(4000);
    expect(r!.deliveryCharge).toBe(0);
    expect(r!.landedCost).toBe(4200);
    expect(r!.overbuyRatio).toBeCloseTo(125 / 30, 2);
  });
});

describe('dynamic pricing', () => {
  it('surges with demand, rain and peak hours and caps at 2x', () => {
    expect(deliverySurge({ pendingOrders: 5, onlineRiders: 10, hourOfDay: 16 }).multiplier).toBe(1);
    const surge = deliverySurge({ pendingOrders: 30, onlineRiders: 10, rainMm: 12, hourOfDay: 20 });
    expect(surge.multiplier).toBe(2);
    expect(surge.reasons).toEqual(expect.arrayContaining(['Heavy rain', 'Peak hours']));
  });
  it('recovers elasticity from price experiments', () => {
    const pts = [200, 220, 240, 260, 280].map((p) => ({ price: p, quantity: 1e6 * p ** -1.5 }));
    expect(estimateElasticity(pts)!.elasticity).toBeCloseTo(-1.5, 3);
  });
  it('suggests margin-aware prices within guardrails', () => {
    const s = suggestMenuPrice({
      id: 'x',
      name: 'Paneer Tikka',
      price: 200,
      unitCost: 110,
      history: [],
    });
    expect(s.suggestedPrice).toBeLessThanOrEqual(220);
    expect(s.suggestedPrice).toBeGreaterThanOrEqual(180);
    expect(String(s.suggestedPrice).endsWith('9')).toBe(true);
  });
  it('marks down stock that will expire unsold', () => {
    expect(
      markdown({ id: 'p', price: 100, stockQty: 100, avgDailySales: 10, daysToExpiry: 5 })
        .discountPct,
    ).toBe(25);
    expect(
      markdown({ id: 'p', price: 100, stockQty: 40, avgDailySales: 10, daysToExpiry: 5 })
        .discountPct,
    ).toBe(0);
  });
});

describe('fraud detection', () => {
  const clean: OrderRiskFeatures = {
    accountAgeDays: 400,
    ordersLast24h: 1,
    failedPaymentsLast24h: 0,
    cancelledLast30d: 0,
    completedOrders: 25,
    isFirstOrder: false,
    orderValue: 450,
    avgOrderValue: 420,
    isCod: false,
    couponUsed: false,
    firstOrderCoupon: false,
    accountsOnDevice: 1,
    addressDistanceFromUsualKm: 0.5,
    hourOfDay: 20,
  };
  it('allows normal behaviour', () => {
    expect(scoreOrderRisk(clean).decision).toBe('ALLOW');
  });
  it('flags first-order coupon farming across accounts', () => {
    const r = scoreOrderRisk({
      ...clean,
      accountAgeDays: 0,
      completedOrders: 0,
      isFirstOrder: true,
      couponUsed: true,
      firstOrderCoupon: true,
      accountsOnDevice: 4,
      isCod: true,
      orderValue: 1800,
      avgOrderValue: null,
    });
    expect(r.decision).toBe('BLOCK');
    expect(r.reasons).toContain('First-order coupon reuse');
  });
  it('detects GPS teleports and remote delivery marking', () => {
    const t = analyseTrajectory(
      [
        { lat: 12.97, lng: 77.6, at: '2026-10-06T10:00:00Z' },
        { lat: 12.98, lng: 77.61, at: '2026-10-06T10:05:00Z' },
        { lat: 13.3, lng: 77.9, at: '2026-10-06T10:06:00Z' },
      ],
      { lat: 12.99, lng: 77.62 },
    );
    expect(t.anomalies.length).toBe(1);
    expect(t.decision).not.toBe('ALLOW');
  });
});

describe('route optimisation', () => {
  const stops: Stop[] = [
    { id: 'd1', type: 'DROP', orderId: 'o1', lat: 12.935, lng: 77.62 },
    { id: 'p2', type: 'PICKUP', orderId: 'o2', lat: 12.972, lng: 77.641 },
    { id: 'p1', type: 'PICKUP', orderId: 'o1', lat: 12.975, lng: 77.605 },
    { id: 'd2', type: 'DROP', orderId: 'o2', lat: 12.93, lng: 77.63 },
  ];
  it('produces a feasible, improved batch route', () => {
    const r = optimizeRoute({ start: { lat: 12.976, lng: 77.6 }, stops });
    expect(isFeasible(r.stops)).toBe(true);
    expect(r.stops[0]!.id).toBe('p1');
    expect(r.stops.map((s) => s.type).slice(0, 2)).toEqual(['PICKUP', 'PICKUP']);
    expect(r.totalKm).toBeGreaterThan(0);
    expect(r.navigationUrl).toContain('google.com/maps/dir');
  });
});

describe('recommendations', () => {
  it('ranks by learned cuisine affinity for returning users', () => {
    const now = new Date('2026-10-06T12:00:00Z');
    const history = Array.from({ length: 5 }, (_, i) => ({
      outletId: 'x',
      cuisines: ['South Indian'],
      total: 300,
      at: new Date(now.getTime() - i * 86_400_000).toISOString(),
    }));
    const ranked = rankOutlets(
      history,
      [
        {
          outletId: 'dosa',
          cuisines: ['South Indian'],
          rating: 4.2,
          ratingCount: 300,
          costForTwo: 300,
          distanceKm: 3,
          etaMins: 30,
          isPureVeg: true,
        },
        {
          outletId: 'pizza',
          cuisines: ['Italian'],
          rating: 4.4,
          ratingCount: 300,
          costForTwo: 600,
          distanceKm: 2,
          etaMins: 25,
          isPureVeg: false,
        },
      ],
      now,
    );
    expect(ranked[0]!.outletId).toBe('dosa');
    expect(ranked[0]!.reasons[0]).toBe('Because you like South Indian');
  });
  it('finds frequently-bought-together items', () => {
    const baskets = [
      ['biryani', 'raita'],
      ['biryani', 'raita', 'coke'],
      ['biryani', 'kebab'],
      ['naan', 'paneer'],
    ];
    expect(recommendItems(baskets, ['biryani'])[0]!.itemId).toBe('raita');
    expect(recommendItems(baskets, [], 1)[0]!.itemId).toBe('biryani');
  });
});

describe('outlet scoring', () => {
  it('grades strong and weak outlets', () => {
    const strong = scoreOutlet({
      avgRating: 4.6,
      ratingCount: 900,
      acceptanceRate: 0.99,
      avgPrepMins: 15,
      slaPrepMins: 20,
      cancellationRate: 0.005,
      complaintRate: 0.02,
      repeatRate: 0.45,
      onTimeRate: 0.96,
    });
    const weak = scoreOutlet({
      avgRating: 3.3,
      ratingCount: 120,
      acceptanceRate: 0.8,
      avgPrepMins: 38,
      slaPrepMins: 20,
      cancellationRate: 0.08,
      complaintRate: 0.12,
      repeatRate: 0.1,
      onTimeRate: 0.7,
    });
    expect(strong.grade).toBe('A');
    expect(['D', 'E']).toContain(weak.grade);
    expect(weak.recommendations.length).toBe(3);
  });
});
