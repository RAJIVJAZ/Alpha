import { istDateStamp } from './sequence';

describe('istDateStamp', () => {
  it('rolls over at IST midnight, not UTC midnight', () => {
    // 2026-10-06T19:00Z is 2026-10-07 00:30 IST
    expect(istDateStamp(new Date('2026-10-06T19:00:00Z'))).toBe('261007');
    expect(istDateStamp(new Date('2026-10-06T18:00:00Z'))).toBe('261006');
  });
});
