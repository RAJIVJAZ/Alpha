import { mealsInPlan, scheduleMeals, todayIst } from './meal-plan';

describe('meal plan scheduling', () => {
  const monday = new Date('2026-10-05T00:00:00Z');
  it('counts served weekdays in the plan window', () => {
    expect(mealsInPlan(7, [1, 2, 3, 4, 5], monday)).toBe(5);
    expect(mealsInPlan(30, [1, 2, 3, 4, 5, 6], monday)).toBe(26);
  });
  it('skips non-served and paused days', () => {
    const dates = scheduleMeals(monday, [1, 3, 5], 4, [new Date('2026-10-07T00:00:00Z')]);
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-05', '2026-10-09', '2026-10-12', '2026-10-14']);
  });
  it('computes the IST business day', () => {
    expect(todayIst(new Date('2026-10-06T20:00:00Z')).toISOString().slice(0, 10)).toBe('2026-10-07');
  });
});
