import { allocate, formatINR, money, round2, sumMoney } from './money';

describe('money', () => {
  it('rounds half away from zero', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(2.344)).toBe(2.34);
  });
  it('sums without floating point drift', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(['199.99', '0.01'])).toBe(200);
  });
  it('formats fixed point and INR', () => {
    expect(money(249)).toBe('249.00');
    expect(formatINR(123456.5)).toBe('₹1,23,456.50');
  });
  it('allocates exactly', () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(parts).toEqual([33.34, 33.33, 33.33]);
    expect(sumMoney(parts)).toBe(100);
  });
});
