import {
  allocateFefo,
  crossedReorderLevel,
  recipeRequirements,
  stockState,
  weightedAverageCost,
} from './stock';
import { menuCostRow, recipeCost } from './costing';

const d = (s: string) => new Date(s);

describe('FEFO allocation', () => {
  const batches = [
    {
      id: 'late',
      remainingQty: 5,
      unitCost: 50,
      expiresAt: d('2026-10-20'),
      receivedAt: d('2026-10-01'),
    },
    { id: 'none', remainingQty: 10, unitCost: 40, expiresAt: null, receivedAt: d('2026-09-01') },
    {
      id: 'soon',
      remainingQty: 2,
      unitCost: 55,
      expiresAt: d('2026-10-08'),
      receivedAt: d('2026-10-03'),
    },
  ];
  it('consumes the earliest-expiring batch first', () => {
    const r = allocateFefo(batches, 6);
    expect(r.allocations).toEqual([
      { batchId: 'soon', quantity: 2, unitCost: 55 },
      { batchId: 'late', quantity: 4, unitCost: 50 },
    ]);
    expect(r.shortfall).toBe(0);
  });
  it('reports shortfall when batches run out', () => {
    expect(allocateFefo(batches, 20).shortfall).toBe(3);
  });
});

describe('stock maths', () => {
  it('computes moving weighted average cost', () => {
    expect(weightedAverageCost(10, 40, 10, 60)).toBe(50);
    expect(weightedAverageCost(-2, 40, 10, 60)).toBe(60); // negative on-hand is ignored
  });
  it('converts recipe quantities into stock units with wastage', () => {
    const req = recipeRequirements(
      [
        { ingredientId: 'flour', quantity: 120, unit: 'G', wastagePct: 5 },
        { ingredientId: 'milk', quantity: 50, unit: 'ML', wastagePct: 0 },
      ],
      new Map([
        ['flour', 'KG'],
        ['milk', 'L'],
      ] as const),
      10,
    );
    expect(req.get('flour')).toBeCloseTo(1.26, 3);
    expect(req.get('milk')).toBeCloseTo(0.5, 3);
  });
  it('flags reorder crossings and stock states', () => {
    expect(crossedReorderLevel(12, 9, 10)).toBe(true);
    expect(crossedReorderLevel(9, 8, 10)).toBe(false);
    expect(stockState(0, 5)).toBe('OUT');
    expect(stockState(4, 5)).toBe('LOW');
    expect(stockState(6, 5)).toBe('OK');
  });
});

describe('costing', () => {
  it('computes plate cost and shares', () => {
    const c = recipeCost([
      {
        ingredientId: 'rice',
        name: 'Basmati',
        quantity: 150,
        unit: 'G',
        wastagePct: 0,
        ingredientUnit: 'KG',
        avgUnitCost: 120,
      },
      {
        ingredientId: 'chicken',
        name: 'Chicken',
        quantity: 200,
        unit: 'G',
        wastagePct: 10,
        ingredientUnit: 'KG',
        avgUnitCost: 260,
      },
    ]);
    expect(c.perPortion).toBe(75.2); // 18 + 57.2
    expect(c.lines[1]!.sharePct).toBeCloseTo(76.06, 1);
  });
  it('flags high food cost', () => {
    expect(menuCostRow('m', 'Biryani', 200, 80).flag).toBe('HIGH_COST');
    expect(menuCostRow('m', 'Biryani', 300, 80).flag).toBe('OK');
    expect(menuCostRow('m', 'Biryani', 300, null).flag).toBe('NO_RECIPE');
  });
});
