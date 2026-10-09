import type { Outlet } from '@foodgrid/database';
import { Prisma } from '@foodgrid/database';
import { toCard } from './discovery.service';

const outlet = {
  id: 'o1',
  slug: 'spice-route',
  name: 'Spice Route',
  type: 'RESTAURANT',
  cuisines: ['North Indian'],
  city: 'Bengaluru',
  lat: 12.93,
  lng: 77.62,
  ratingAvg: 4.26,
  ratingCount: 120,
  costForTwo: new Prisma.Decimal('700'),
  avgPrepTimeMins: 20,
  isPureVeg: false,
  isOpen: true,
  coverImageUrl: null,
} as unknown as Outlet;

describe('outlet cards', () => {
  it('separates the accepting-orders switch (isOpen) from open right now (isOpenNow)', () => {
    const outsideHours = toCard({ outlet, distanceKm: 1.23, etaMins: 30, openNow: false });
    expect(outsideHours).toMatchObject({ isOpen: true, isOpenNow: false });

    const switchedOff = toCard({
      outlet: { ...outlet, isOpen: false } as Outlet,
      distanceKm: 1.23,
      etaMins: 30,
      openNow: false,
    });
    expect(switchedOff).toMatchObject({ isOpen: false, isOpenNow: false });

    const open = toCard({ outlet, distanceKm: 1.23, etaMins: 30, openNow: true });
    expect(open).toMatchObject({ isOpen: true, isOpenNow: true });
  });

  it('sends cost for two as a two-decimal string and rounds display figures', () => {
    const card = toCard(
      { outlet, distanceKm: 1.26, etaMins: 30, openNow: true },
      { campaignId: 'cmp_1', clickToken: 'tok' },
    );
    expect(card).toMatchObject({
      costForTwo: '700.00',
      ratingAvg: 4.3,
      distanceKm: 1.3,
      sponsored: true,
      adCampaignId: 'cmp_1',
      adClickToken: 'tok',
    });
  });
});
