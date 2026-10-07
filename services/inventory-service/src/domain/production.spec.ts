import { forecastItemDemand, plannedQuantity } from './production';

describe('production forecasting', () => {
  it('weights recent same weekdays more', () => {
    // target Tuesday 2026-10-13; previous Tuesdays: 10-06, 09-29, 09-22, 09-15
    const series = [
      { date: '2026-10-06', quantity: 40 },
      { date: '2026-09-29', quantity: 30 },
      { date: '2026-09-22', quantity: 20 },
      { date: '2026-09-15', quantity: 10 },
      { date: '2026-10-07', quantity: 999 }, // a Wednesday — ignored
    ];
    expect(forecastItemDemand(series, new Date('2026-10-13T00:00:00Z'))).toBeCloseTo(30, 5);
  });
  it('falls back to the average when no same-weekday history exists', () => {
    expect(
      forecastItemDemand([{ date: '2026-10-07', quantity: 12 }], new Date('2026-10-13T00:00:00Z')),
    ).toBe(12);
  });
  it('adds a buffer and rounds up', () => {
    expect(plannedQuantity(30)).toBe(33);
    expect(plannedQuantity(0)).toBe(0);
  });
});
