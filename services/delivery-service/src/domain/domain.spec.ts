import { buildHeatmap } from './heatmap';
import { rankCandidates, scoreRider, searchRadiusKm, updateAcceptanceRate } from './dispatch';
import { deliveryEtaMins, deliveryFee, riderEarning, splitEarning } from './fees';
import { deliveryContribution } from './incentives';

const tariff = { baseFee: 25, perKmFee: 8, freeKm: 2, riderBasePay: 30, riderPerKm: 6 };

describe('fees & earnings', () => {
  it('charges per km beyond the free radius with surge', () => {
    expect(deliveryFee(tariff, 1.5)).toBe(25);
    expect(deliveryFee(tariff, 6)).toBe(57);
    expect(deliveryFee(tariff, 6, 1.5)).toBe(86);
  });
  it('pays riders base + distance + surge + waiting', () => {
    expect(riderEarning(tariff, 5)).toEqual({ basePay: 30, distancePay: 30, surgePay: 0, waitingPay: 0, total: 60 });
    expect(riderEarning(tariff, 5, 1.2, 15).total).toBe(77);
  });
  it('splits a quoted earning back into statement lines that sum to the quote', () => {
    for (const [km, surge] of [[5, 1], [4.3, 1.5], [0.4, 1.2], [7.7, 1.35]] as const) {
      const q = riderEarning(tariff, km, surge);
      const s = splitEarning(q.total, surge, tariff.riderBasePay);
      expect(Math.round((s.basePay + s.distancePay + s.surgePay) * 100)).toBe(Math.round(q.total * 100));
      expect(Math.abs(s.surgePay - q.surgePay)).toBeLessThanOrEqual(0.01);
      expect(s.basePay).toBe(30);
    }
    // a flat quote below the zone base pay is all base pay
    expect(splitEarning(20, 1, 30)).toEqual({ basePay: 20, distancePay: 0, surgePay: 0 });
  });
  it('estimates ETA', () => {
    expect(deliveryEtaMins(12, 8, 15)).toBe(30);
  });
});

describe('dispatch scoring', () => {
  const near = { riderId: 'near', distanceToPickupKm: 0.5, rating: 4.6, acceptanceRate: 0.9, idleMinutes: 5, activeDeliveries: 0 };
  const far = { riderId: 'far', distanceToPickupKm: 2.8, rating: 4.9, acceptanceRate: 1, idleMinutes: 40, activeDeliveries: 0 };
  const busy = { riderId: 'busy', distanceToPickupKm: 0.2, rating: 4.8, acceptanceRate: 1, idleMinutes: 0, activeDeliveries: 2 };
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
    expect(deliveryContribution({ ...scheme, type: 'ORDER_COUNT', minRating: 4.7 }, new Date('2026-10-06T12:00:00Z'), 4.5)).toBe(0);
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
