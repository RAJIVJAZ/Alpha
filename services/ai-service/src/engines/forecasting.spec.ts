import { fitHoltWinters, forecastDemand, predictDepletion } from './forecasting';

/** 10 weeks of synthetic demand: weekly pattern + mild upward trend. */
function syntheticSeries(weeks = 10) {
  const weekly = [20, 18, 19, 21, 26, 34, 30]; // Mon..Sun (Thu = index 3)
  return Array.from({ length: weeks * 7 }, (_, i) => weekly[i % 7]! + i * 0.05);
}

describe('forecastDemand', () => {
  it('captures weekly seasonality with Holt-Winters', () => {
    const series = syntheticSeries();
    const res = forecastDemand({ series, startDate: '2026-07-27', horizon: 7 }); // 2026-07-27 is a Monday
    expect(res.model).toBe('HOLT_WINTERS');
    const values = res.points.map((p) => p.value);
    // Saturday (index 5) should be the peak, Tuesday (index 1) the trough
    expect(values.indexOf(Math.max(...values))).toBe(5);
    expect(values.indexOf(Math.min(...values))).toBe(1);
    expect(res.mape).not.toBeNull();
    expect(res.mape!).toBeLessThan(5);
    for (const p of res.points) {
      expect(p.lower).toBeLessThanOrEqual(p.value);
      expect(p.upper).toBeGreaterThanOrEqual(p.value);
    }
  });

  it('applies festival multipliers for matching categories only', () => {
    const series = syntheticSeries();
    const base = forecastDemand({ series, startDate: '2026-07-27', horizon: 3 });
    const target = base.points[1]!.date;
    const withSignal = forecastDemand({
      series,
      startDate: '2026-07-27',
      horizon: 3,
      category: 'SUGAR',
      signals: [{ date: target, impact: 1.6, name: 'Raksha Bandhan', categories: ['SUGAR', 'DAIRY'] }],
    });
    expect(withSignal.points[1]!.value).toBeCloseTo(base.points[1]!.value * 1.6, 1);
    expect(withSignal.points[1]!.signals).toEqual(['Raksha Bandhan']);
    const otherCategory = forecastDemand({
      series,
      startDate: '2026-07-27',
      horizon: 3,
      category: 'OIL',
      signals: [{ date: target, impact: 1.6, categories: ['SUGAR'] }],
    });
    expect(otherCategory.points[1]!.value).toBeCloseTo(base.points[1]!.value, 5);
  });

  it('de-signals history so past festivals do not inflate the baseline', () => {
    const series = syntheticSeries(4);
    series[20] = series[20]! * 3; // a festival spike
    const raw = forecastDemand({ series, startDate: '2026-09-07', horizon: 7 });
    const cleaned = forecastDemand({
      series,
      startDate: '2026-09-07',
      horizon: 7,
      signals: [{ date: '2026-09-27', impact: 3 }],
    });
    expect(cleaned.points[6]!.value).toBeLessThan(raw.points[6]!.value);
  });

  it('degrades gracefully on short or empty history', () => {
    expect(forecastDemand({ series: [], startDate: '2026-10-01', horizon: 3 }).model).toBe('ZERO');
    expect(forecastDemand({ series: [5, 6, 7], startDate: '2026-10-01', horizon: 3 }).model).toBe('MOVING_AVERAGE');
    const sn = forecastDemand({ series: [1, 2, 3, 4, 5, 6, 7, 1, 2, 3], startDate: '2026-10-01', horizon: 2 });
    expect(sn.model).toBe('SEASONAL_NAIVE');
    expect(sn.points.every((p) => p.value >= 0)).toBe(true);
  });

  it('fits a perfectly seasonal series with near-zero error', () => {
    const y = Array.from({ length: 28 }, (_, i) => [10, 20, 30, 40, 50, 60, 70][i % 7]!);
    expect(fitHoltWinters(y, 7, 0.2, 0, 0.1, 0.9).sse).toBeLessThan(1e-6);
  });
});

describe('predictDepletion', () => {
  const pts = ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map((date) => ({ date, value: 10 }));
  it('finds the day stock runs out', () => {
    expect(predictDepletion(25, pts)).toEqual({ daysOfCover: 2.5, depletionDate: '2026-10-09' });
  });
  it('handles zero stock and stock beyond the horizon', () => {
    expect(predictDepletion(0, pts).daysOfCover).toBe(0);
    expect(predictDepletion(100, pts)).toEqual({ daysOfCover: 10, depletionDate: null });
  });
});
