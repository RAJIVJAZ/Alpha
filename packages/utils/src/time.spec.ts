import { istDate, istMonthStart, isWithinOpeningHours, isWithinWindow } from './time';

describe('time (IST)', () => {
  it('derives IST business dates', () => {
    expect(istDate(new Date('2026-10-06T19:00:00Z'))).toBe('2026-10-07');
  });
  it('evaluates opening hours in IST, including past-midnight windows', () => {
    // Tuesday 2026-10-06 21:30 IST = 16:00Z
    const tue2130 = new Date('2026-10-06T16:00:00Z');
    expect(isWithinOpeningHours([{ day: 2, open: '11:00', close: '23:00' }], tue2130)).toBe(true);
    expect(isWithinOpeningHours([{ day: 2, open: '11:00', close: '21:00' }], tue2130)).toBe(false);
    // Wednesday 00:30 IST, window opened Tuesday 18:00 closing 02:00
    const wed0030 = new Date('2026-10-06T19:00:00Z');
    expect(isWithinOpeningHours([{ day: 2, open: '18:00', close: '02:00' }], wed0030)).toBe(true);
    expect(isWithinOpeningHours([], wed0030)).toBe(true);
  });
  it('checks time windows', () => {
    const noonIst = new Date('2026-10-06T06:45:00Z'); // 12:15 IST
    expect(isWithinWindow([{ start: '12:00', end: '14:30' }], noonIst)).toBe(true);
    expect(isWithinWindow([{ start: '19:00', end: '22:00' }], noonIst)).toBe(false);
  });

  it('starts the month at IST midnight, not UTC midnight', () => {
    expect(istMonthStart(new Date('2026-10-06T12:00:00Z')).toISOString()).toBe('2026-09-30T18:30:00.000Z');
    // 31 Oct 20:00 UTC is already 1 Nov in India
    expect(istMonthStart(new Date('2026-10-31T20:00:00Z')).toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });
});
