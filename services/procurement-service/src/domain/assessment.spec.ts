import { assessIngredient, requiresApproval } from './assessment';
import { poStateMachine } from './po-state';

const base = {
  currentStock: 30,
  reorderLevel: 10,
  reorderQty: 50,
  maxStock: null,
  leadTimeDays: 2,
  forecast: Array(14).fill(10),
  forecastDates: Array.from({ length: 14 }, (_, i) => `2026-10-${String(7 + i).padStart(2, '0')}`),
  demandStd: 2,
  serviceLevel: 0.95,
  reviewPeriodDays: 7,
};

describe('assessIngredient', () => {
  it('predicts depletion from the forecast', () => {
    const a = assessIngredient(base);
    expect(a.daysOfCover).toBe(3);
    expect(a.depletionDate).toBe('2026-10-09');
    expect(a.leadTimeDemand).toBe(20);
    expect(a.safetyStock).toBeCloseTo(1.645 * 2 * Math.SQRT2, 1);
  });

  it('reorders when stock falls to the reorder point', () => {
    const a = assessIngredient({ ...base, currentStock: 22 });
    expect(a.needsReorder).toBe(true);
    // demand over L+R = 90, + SS ≈ 4.65, − stock 22
    expect(a.suggestedQty).toBeCloseTo(72.65, 1);
    expect(a.severity).toBe('MEDIUM');
  });

  it('does not reorder with ample stock', () => {
    const a = assessIngredient({ ...base, currentStock: 200 });
    expect(a.needsReorder).toBe(false);
    expect(a.severity).toBe('LOW');
  });

  it('escalates severity as cover drops below the lead time', () => {
    expect(assessIngredient({ ...base, currentStock: 15 }).severity).toBe('HIGH');
    expect(assessIngredient({ ...base, currentStock: 5 }).severity).toBe('CRITICAL');
    expect(assessIngredient({ ...base, currentStock: 0 }).severity).toBe('CRITICAL');
  });

  it('respects reorder qty minimum and max stock cap', () => {
    expect(assessIngredient({ ...base, currentStock: 20, reorderQty: 200 }).suggestedQty).toBe(200);
    expect(assessIngredient({ ...base, currentStock: 20, maxStock: 60 }).suggestedQty).toBe(40);
  });

  it('honours a higher configured reorder level', () => {
    expect(assessIngredient({ ...base, currentStock: 40, reorderLevel: 45 }).needsReorder).toBe(
      true,
    );
  });
});

describe('PO workflow', () => {
  it('enforces approval and supplier confirmation order', () => {
    expect(poStateMachine.can('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    expect(poStateMachine.can('DRAFT', 'SENT_TO_SUPPLIER')).toBe(false);
    expect(poStateMachine.can('SENT_TO_SUPPLIER', 'CONFIRMED')).toBe(true);
    expect(poStateMachine.can('CONFIRMED', 'RECEIVED')).toBe(false);
    expect(requiresApproval(5000, 2000)).toBe(true);
    expect(requiresApproval(1500, 2000)).toBe(false);
  });
});
