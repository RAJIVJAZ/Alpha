import { resolveIstRange, resolveRange } from './dto';

describe('date ranges', () => {
  it('resolveRange keeps UTC-midnight bounds for @db.Date columns', () => {
    const r = resolveRange({ from: '2026-10-01', to: '2026-10-06' });
    expect(r.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-06T23:59:59.999Z');
  });

  it('resolveIstRange covers whole IST business days for timestamp columns', () => {
    const r = resolveIstRange({ from: '2026-10-01', to: '2026-10-06' });
    expect(r.from.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-06T18:29:59.999Z');
  });

  it('resolveIstRange defaults to the last N IST days ending now', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-06T20:00:00Z')); // 7 Oct 01:30 IST
    const r = resolveIstRange({}, 7);
    expect(r.from.toISOString()).toBe('2026-09-30T18:30:00.000Z'); // 1 Oct 00:00 IST
    expect(r.to.toISOString()).toBe('2026-10-06T20:00:00.000Z');
    jest.useRealTimers();
  });
});
