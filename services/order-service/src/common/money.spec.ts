import { Prisma } from '@foodgrid/database';
import { toMoney, withMoneyStrings } from './money';

const dec = (v: string) => new Prisma.Decimal(v);

describe('money on the wire', () => {
  it('formats decimals, numbers and strings with exactly two decimals', () => {
    expect(toMoney(dec('700'))).toBe('700.00');
    expect(toMoney(dec('31.5'))).toBe('31.50');
    expect(toMoney(44)).toBe('44.00');
    expect(toMoney(0.1 + 0.2)).toBe('0.30');
    expect(toMoney('99.9')).toBe('99.90');
  });

  it('rewrites Decimals anywhere in a response and leaves everything else alone', () => {
    const placedAt = new Date('2026-10-06T10:00:00Z');
    const body = withMoneyStrings({
      total: dec('700'),
      items: [{ unitPrice: dec('250.5'), quantity: 2, name: 'Thali' }],
      outlet: { costForTwo: dec('600'), commissionRate: null },
      placedAt,
      tags: ['veg'],
    });
    expect(body).toEqual({
      total: '700.00',
      items: [{ unitPrice: '250.50', quantity: 2, name: 'Thali' }],
      outlet: { costForTwo: '600.00', commissionRate: null },
      placedAt,
      tags: ['veg'],
    });
    expect(body.placedAt).toBe(placedAt);
    expect(JSON.parse(JSON.stringify(withMoneyStrings({ d: dec('12.3') })))).toEqual({
      d: '12.30',
    });
  });

  it('never rounds away precision a column might have', () => {
    expect(withMoneyStrings(dec('1.125'))).toBe('1.125');
    expect(withMoneyStrings(null)).toBeNull();
    expect(withMoneyStrings('700')).toBe('700');
  });
});
