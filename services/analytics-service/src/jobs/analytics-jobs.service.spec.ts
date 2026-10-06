import { lastCompleteWeek } from './analytics-jobs.service';

describe('lastCompleteWeek', () => {
  it('is the Monday–Sunday before the current IST week', () => {
    // Wednesday 7 Oct 2026, 10:00 IST
    const w = lastCompleteWeek(new Date('2026-10-07T04:30:00Z'));
    expect(w.from.toISOString().slice(0, 10)).toBe('2026-09-28');
    expect(w.to.toISOString().slice(0, 10)).toBe('2026-10-04');
  });

  it('treats Sunday as part of the current week and uses IST for the day', () => {
    // Sunday 11 Oct 2026 23:00 UTC is already Monday 12 Oct in India
    expect(lastCompleteWeek(new Date('2026-10-11T23:00:00Z')).to.toISOString().slice(0, 10)).toBe('2026-10-11');
    // Sunday 11 Oct 2026, 10:00 IST
    expect(lastCompleteWeek(new Date('2026-10-11T04:30:00Z')).to.toISOString().slice(0, 10)).toBe('2026-10-04');
  });
});
