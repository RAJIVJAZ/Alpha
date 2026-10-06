import { CUSTOMER_AREAS, FIRST_NAMES, LAST_NAMES, LOCALITIES } from './catalog';
import type { SeedContext } from './context';
import { addMinutes, istMidnight, log } from './lib';

const RIDERS_PER_ZONE = [3, 3, 2, 2, 2, 2, 2];
const VEHICLES = ['MOTORCYCLE', 'SCOOTER', 'EV_SCOOTER', 'MOTORCYCLE', 'BICYCLE'] as const;

/** Monday 00:00 IST of the current IST week. */
export function istWeekStart(now: Date): Date {
  const today = istMidnight(0, now);
  const wd = new Date(today.getTime() + 330 * 60_000).getUTCDay(); // 0 = Sunday
  const back = (wd + 6) % 7;
  return new Date(today.getTime() - back * 86_400_000);
}

export async function seedDelivery(ctx: SeedContext) {
  const { prisma, rng } = ctx;
  const d = 0.03;

  for (const key of CUSTOMER_AREAS) {
    const loc = LOCALITIES[key]!;
    const ring = [
      [loc.lng - d, loc.lat - d],
      [loc.lng + d, loc.lat - d],
      [loc.lng + d, loc.lat + d],
      [loc.lng - d, loc.lat + d],
      [loc.lng - d, loc.lat - d],
    ];
    const tariff = { baseFee: 25, perKmFee: 8, freeKm: 2, riderBasePay: 25, riderPerKm: 7 };
    const zone = await prisma.deliveryZone.create({
      data: {
        name: `Bengaluru - ${loc.name}`, city: loc.city, polygon: [ring], centerLat: loc.lat, centerLng: loc.lng,
        ...tariff, surgeMultiplier: key === 'whitefield' ? 1.1 : 1,
      },
    });
    ctx.zones.set(key, { id: zone.id, ...tariff });
  }
  log('delivery zones', ctx.zones.size);

  const joined = istMidnight(200, ctx.now);
  let n = 0;
  for (const [zi, key] of CUSTOMER_AREAS.entries()) {
    const zone = ctx.zones.get(key)!;
    const loc = LOCALITIES[key]!;
    for (let i = 0; i < RIDERS_PER_ZONE[zi]!; i++) {
      n++;
      const name = `${rng.pick(FIRST_NAMES.slice(0, 25))} ${rng.pick(LAST_NAMES)}`;
      const phone = `+9197400${(10100 + n).toString()}`;
      const online = n % 3 !== 0;
      const user = await prisma.user.create({ data: { name, phone, roles: ['RIDER'], phoneVerifiedAt: joined, createdAt: joined } });
      const vehicle = VEHICLES[n % VEHICLES.length]!;
      const profile = await prisma.riderProfile.create({
        data: {
          userId: user.id, status: 'ACTIVE', name, phone, city: 'Bengaluru', zoneId: zone.id, vehicleType: vehicle,
          vehicleNumber: vehicle === 'BICYCLE' ? null : `KA-0${rng.int(1, 5)}-${rng.pick(['EA', 'HF', 'JK', 'MR'])}-${rng.digits(4)}`,
          licenseNumber: vehicle === 'BICYCLE' ? null : `KA0${rng.int(1, 5)}20${rng.int(10, 22)}000${rng.digits(4)}`,
          aadhaarLast4: rng.digits(4), upiId: `${name.split(' ')[0]!.toLowerCase()}${n}@okaxis`,
          documents: [{ type: 'DRIVING_LICENSE', verified: true }, { type: 'AADHAAR', verified: true }, { type: 'VEHICLE_RC', verified: vehicle !== 'BICYCLE' }],
          bankAccount: { holder: name, ifsc: 'HDFC0001234', last4: rng.digits(4) },
          isOnline: online, currentLat: online ? loc.lat + rng.float(-0.01, 0.01) : null, currentLng: online ? loc.lng + rng.float(-0.01, 0.01) : null,
          lastLocationAt: online ? addMinutes(ctx.now, -rng.int(0, 3)) : null, approvedAt: addMinutes(joined, 2880), approvedBy: ctx.adminUserId, createdAt: joined,
        },
      });
      ctx.riders.push({ userId: user.id, profileId: profile.id, name, phone, zoneId: zone.id, zoneKey: key });
    }
  }

  // one applicant waiting for KYC review
  const applicant = await prisma.user.create({ data: { name: 'Ravi Kumar', phone: '+919740019999', roles: ['CUSTOMER'], phoneVerifiedAt: ctx.now } });
  const pending = await prisma.riderProfile.create({
    data: {
      userId: applicant.id, status: 'PENDING_APPROVAL', name: 'Ravi Kumar', phone: '+919740019999', city: 'Bengaluru', vehicleType: 'EV_SCOOTER',
      vehicleNumber: 'KA-51-EV-2231', licenseNumber: 'KA5120230004411', aadhaarLast4: '7781', upiId: 'ravik@okicici',
      documents: [{ type: 'DRIVING_LICENSE', url: 's3://foodgrid-kyc/riders/ravi/dl.jpg' }, { type: 'AADHAAR', url: 's3://foodgrid-kyc/riders/ravi/aadhaar.jpg' }],
    },
  });
  await prisma.approvalRequest.create({
    data: {
      entityType: 'RIDER', entityId: pending.id, title: 'Rider onboarding: Ravi Kumar (Bengaluru, EV_SCOOTER)', submittedBy: applicant.id,
      documents: pending.documents as object, metadata: { userId: applicant.id, city: 'Bengaluru', vehicleNumber: 'KA-51-EV-2231' },
    },
  });
  log('riders', `${ctx.riders.length} active + 1 pending approval`);

  const weekStart = istWeekStart(ctx.now);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  await prisma.incentiveScheme.createMany({
    data: [
      { name: 'Weekly 60 deliveries bonus', description: 'Complete 60 deliveries this week to earn ₹600.', type: 'ORDER_COUNT', city: 'Bengaluru', target: 60, rewardAmount: 600, startsAt: weekStart, endsAt: weekEnd },
      { name: 'Lunch & dinner rush hero', description: '20 deliveries inside peak windows this week.', type: 'PEAK_HOURS', city: 'Bengaluru', target: 20, rewardAmount: 300, peakWindows: [{ start: '12:00', end: '14:30' }, { start: '19:30', end: '22:00' }], startsAt: weekStart, endsAt: weekEnd },
      { name: 'Five-star rider', description: '40 deliveries with rating at or above 4.7.', type: 'RATING', city: 'Bengaluru', target: 40, minRating: 4.7, rewardAmount: 250, startsAt: weekStart, endsAt: weekEnd },
      { name: 'Whitefield login hours', description: 'Stay online 40 hours in Whitefield this week.', type: 'LOGIN_HOURS', zoneId: ctx.zones.get('whitefield')!.id, target: 40, rewardAmount: 400, startsAt: weekStart, endsAt: weekEnd },
      { name: 'Monsoon streak (ended)', description: '7-day streak bonus.', type: 'STREAK', city: 'Bengaluru', target: 7, rewardAmount: 350, startsAt: new Date(weekStart.getTime() - 21 * 86_400_000), endsAt: new Date(weekStart.getTime() - 14 * 86_400_000), isActive: false },
    ],
  });
}
