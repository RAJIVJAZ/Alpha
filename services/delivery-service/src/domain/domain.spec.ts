import { buildHeatmap } from './heatmap';
import { rankCandidates, scoreRider, searchRadiusKm, updateAcceptanceRate } from './dispatch';
import {
  customerDeliveryFee,
  DEFAULT_PRICING,
  deliveryEtaMins,
  payableKm,
  riderPayout,
  waitingPay,
} from './fees';
import { splitByIstDay } from './attendance';
import { attendanceProgress, deliveryContribution } from './incentives';

const p = DEFAULT_PRICING;

describe('customer delivery fee', () => {
  it('charges the flat fee below the threshold and nothing from it', () => {
    expect(customerDeliveryFee(p, 0)).toBe(15);
    expect(customerDeliveryFee(p, 398.99)).toBe(15);
    expect(customerDeliveryFee(p, 399)).toBe(0);
    expect(customerDeliveryFee(p, 1250)).toBe(0);
  });
  it('is never free without a threshold', () => {
    expect(customerDeliveryFee({ ...p, freeDeliveryAbove: null }, 5000)).toBe(15);
  });
});

describe('rider payout', () => {
  it('rounds the payable distance to 0.1 km, halves up', () => {
    expect(payableKm(2.44)).toBe(2.4);
    expect(payableKm(2.45)).toBe(2.5);
    expect(payableKm(1.15)).toBe(1.2);
    expect(payableKm(-1)).toBe(0);
  });
  it('pays the greater of the minimum and ₹10 a km, never both', () => {
    const cases: [number, number, number, number][] = [
      // km, distance pay, top-up, total
      [0.4, 4, 29, 33],
      [1, 10, 23, 33],
      [3, 30, 3, 33],
      [3.3, 33, 0, 33],
      [3.34, 33, 0, 33],
      [3.4, 34, 0, 34],
      [7.25, 73, 0, 73],
      [12, 120, 0, 120],
    ];
    for (const [km, distancePay, minimumTopUp, total] of cases)
      expect(riderPayout(p, km)).toEqual({
        payableKm: payableKm(km),
        distancePay,
        minimumTopUp,
        surgePay: 0,
        total,
      });
  });
  it('adds surge on the payout as its own line', () => {
    expect(riderPayout(p, 2, 1.5)).toMatchObject({ minimumTopUp: 13, surgePay: 16.5, total: 49.5 });
    expect(riderPayout(p, 5, 1.2)).toMatchObject({ distancePay: 50, surgePay: 10, total: 60 });
  });
  it('follows a changed policy', () => {
    const q = { ...p, riderPerKm: 12, riderMinPayout: 40 };
    expect(riderPayout(q, 3).total).toBe(40);
    expect(riderPayout(q, 4).total).toBe(48);
  });
});

describe('waiting pay', () => {
  const at = new Date('2026-10-13T12:00:00Z');
  const after = (mins: number) => new Date(at.getTime() + mins * 60_000);
  it('pays once for a verified wait longer than the threshold', () => {
    expect(waitingPay(p, { arrivedAt: at, endedAt: after(5.5), verified: true })).toEqual({
      waitedMins: 5.5,
      amount: 3,
    });
    expect(waitingPay(p, { arrivedAt: at, endedAt: after(42), verified: true }).amount).toBe(3);
  });
  it('pays nothing at or under the threshold', () => {
    expect(waitingPay(p, { arrivedAt: at, endedAt: after(5), verified: true }).amount).toBe(0);
    expect(waitingPay(p, { arrivedAt: at, endedAt: after(2), verified: true }).amount).toBe(0);
  });
  it('counts the wait only until the order was ready, plus the handover allowance', () => {
    // ready 1 min after arrival, picked up 10 min after: 3 minutes count
    expect(
      waitingPay(p, { arrivedAt: at, endedAt: after(10), verified: true, readyAt: after(1) }),
    ).toEqual({ waitedMins: 3, amount: 0 });
    // ready 8 min after arrival, picked up at 9: the whole wait counts
    expect(
      waitingPay(p, { arrivedAt: at, endedAt: after(9), verified: true, readyAt: after(8) }),
    ).toEqual({ waitedMins: 9, amount: 3 });
    // ready before the rider arrived: only the handover allowance counts
    expect(
      waitingPay(p, { arrivedAt: at, endedAt: after(12), verified: true, readyAt: after(-5) }),
    ).toEqual({ waitedMins: 2, amount: 0 });
  });
  it('pays nothing when GPS did not confirm the arrival', () => {
    expect(waitingPay(p, { arrivedAt: at, endedAt: after(20), verified: false })).toEqual({
      waitedMins: 20,
      amount: 0,
    });
  });
});

describe('ETA', () => {
  it('estimates ETA', () => {
    expect(deliveryEtaMins(12, 8, 15)).toBe(30);
  });
});

describe('dispatch scoring', () => {
  const near = {
    riderId: 'near',
    distanceToPickupKm: 0.5,
    rating: 4.6,
    acceptanceRate: 0.9,
    idleMinutes: 5,
    activeDeliveries: 0,
  };
  const far = {
    riderId: 'far',
    distanceToPickupKm: 2.8,
    rating: 4.9,
    acceptanceRate: 1,
    idleMinutes: 40,
    activeDeliveries: 0,
  };
  const busy = {
    riderId: 'busy',
    distanceToPickupKm: 0.2,
    rating: 4.8,
    acceptanceRate: 1,
    idleMinutes: 0,
    activeDeliveries: 2,
  };
  it('prefers nearby riders and never full ones', () => {
    const ranked = rankCandidates([far, near, busy], 3);
    expect(ranked.map((r) => r.riderId)).toEqual(['near', 'far']);
    expect(scoreRider(busy, 3)).toBe(0);
  });
  it('excludes riders who already declined', () => {
    expect(rankCandidates([near, far], 3, new Set(['near']))[0]!.riderId).toBe('far');
  });
  it('widens the search radius and tracks acceptance', () => {
    expect([0, 1, 2, 5].map(searchRadiusKm)).toEqual([3, 5, 8, 12]);
    expect(updateAcceptanceRate(1, false)).toBe(0.9);
  });
});

describe('incentives', () => {
  const scheme = {
    type: 'PEAK_HOURS' as const,
    target: 10,
    peakWindows: [{ start: '12:00', end: '14:30' }],
    startsAt: new Date('2026-10-01'),
    endsAt: new Date('2026-10-31'),
  };
  it('counts only peak-hour deliveries', () => {
    expect(deliveryContribution(scheme, new Date('2026-10-06T07:00:00Z'), 4.5)).toBe(1); // 12:30 IST
    expect(deliveryContribution(scheme, new Date('2026-10-06T12:00:00Z'), 4.5)).toBe(0); // 17:30 IST
    expect(
      deliveryContribution(
        { ...scheme, type: 'ORDER_COUNT', minRating: 4.7 },
        new Date('2026-10-06T12:00:00Z'),
        4.5,
      ),
    ).toBe(0);
  });

  it('counts RATING deliveries only while the rider holds the rating', () => {
    const rating = { ...scheme, type: 'RATING' as const, minRating: 4.7 };
    const at = new Date('2026-10-06T12:00:00Z');
    expect(deliveryContribution(rating, at, 4.8)).toBe(1);
    expect(deliveryContribution(rating, at, 4.6)).toBe(0);
    expect(deliveryContribution(rating, new Date('2026-11-02T12:00:00Z'), 4.8)).toBe(0);
  });

  it('leaves attendance-based schemes to attendanceProgress', () => {
    const at = new Date('2026-10-06T07:00:00Z');
    expect(deliveryContribution({ ...scheme, type: 'LOGIN_HOURS' }, at, 5)).toBe(0);
    expect(deliveryContribution({ ...scheme, type: 'STREAK' }, at, 5)).toBe(0);
  });

  const day = (date: string, onlineMinutes: number, deliveryCount = 0) => ({
    date: new Date(`${date}T00:00:00Z`),
    onlineMinutes,
    deliveryCount,
  });

  it('totals LOGIN_HOURS in whole hours online', () => {
    expect(attendanceProgress('LOGIN_HOURS', [])).toBe(0);
    expect(attendanceProgress('LOGIN_HOURS', [day('2026-10-05', 150), day('2026-10-06', 29)])).toBe(
      2,
    );
    expect(attendanceProgress('LOGIN_HOURS', [day('2026-10-05', 150), day('2026-10-06', 30)])).toBe(
      3,
    );
  });

  it('measures STREAK as the longest run of consecutive days with a delivery', () => {
    expect(
      attendanceProgress('STREAK', [
        day('2026-10-01', 60, 3),
        day('2026-10-02', 60, 1),
        day('2026-10-03', 240, 0), // online but no delivery breaks the run
        day('2026-10-04', 60, 2),
        day('2026-10-06', 60, 2), // 5th missing
        day('2026-10-07', 60, 1),
        day('2026-10-08', 60, 4),
      ]),
    ).toBe(3);
    // order of rows does not matter, and a single day is a streak of one
    expect(attendanceProgress('STREAK', [day('2026-10-02', 0, 1), day('2026-10-01', 0, 1)])).toBe(
      2,
    );
    expect(attendanceProgress('STREAK', [day('2026-10-02', 0, 1)])).toBe(1);
    expect(attendanceProgress('STREAK', [day('2026-10-02', 300, 0)])).toBe(0);
    expect(attendanceProgress('ORDER_COUNT', [day('2026-10-02', 300, 9)])).toBe(0);
  });
});

describe('attendance', () => {
  it('splits a shift across IST midnight between both days', () => {
    // 22:30 → 01:15 IST
    expect(
      splitByIstDay(new Date('2026-10-05T17:00:00Z'), new Date('2026-10-05T19:45:00Z')),
    ).toEqual([
      { date: '2026-10-05', minutes: 90 },
      { date: '2026-10-06', minutes: 75 },
    ]);
  });

  it('keeps a same-day shift on one day and ignores empty sessions', () => {
    expect(
      splitByIstDay(new Date('2026-10-05T04:30:00Z'), new Date('2026-10-05T08:30:00Z')),
    ).toEqual([{ date: '2026-10-05', minutes: 240 }]);
    const t = new Date('2026-10-05T04:30:00Z');
    expect(splitByIstDay(t, t)).toEqual([]);
    expect(splitByIstDay(t, new Date(t.getTime() - 60_000))).toEqual([]);
  });

  it('credits every day of a shift longer than a day', () => {
    // 20:00 IST on the 5th → 02:00 IST on the 7th
    const days = splitByIstDay(new Date('2026-10-05T14:30:00Z'), new Date('2026-10-06T20:30:00Z'));
    expect(days).toEqual([
      { date: '2026-10-05', minutes: 240 },
      { date: '2026-10-06', minutes: 1440 },
      { date: '2026-10-07', minutes: 120 },
    ]);
  });
});

describe('heat map', () => {
  it('ranks under-supplied cells first', () => {
    const cells = buildHeatmap(
      [
        { lat: 12.9716, lng: 77.5946 },
        { lat: 12.9717, lng: 77.5947 },
        { lat: 12.935, lng: 77.62 },
      ],
      [{ lat: 12.935, lng: 77.62 }],
    );
    expect(cells[0]!.demand).toBe(2);
    expect(cells[0]!.pressure).toBe(2);
  });
});
