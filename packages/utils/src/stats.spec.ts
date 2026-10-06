import { inverseNormalCdf, mape, mean, normalize, percentile, stdDev } from './stats';

describe('stats', () => {
  it('computes descriptive statistics', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9], false)).toBe(2);
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4], 90)).toBeCloseTo(3.7);
  });
  it('normalises with inversion', () => {
    expect(normalize(5, 0, 10)).toBe(0.5);
    expect(normalize(2, 0, 10, true)).toBe(0.8);
    expect(normalize(5, 5, 5)).toBe(1);
  });
  it('computes MAPE ignoring zero actuals', () => {
    expect(mape([100, 0, 200], [110, 5, 180])).toBeCloseTo(10);
  });
  it('approximates the inverse normal CDF', () => {
    expect(inverseNormalCdf(0.95)).toBeCloseTo(1.6449, 3);
    expect(inverseNormalCdf(0.5)).toBeCloseTo(0, 6);
    expect(inverseNormalCdf(0.01)).toBeCloseTo(-2.3263, 3);
  });
});
