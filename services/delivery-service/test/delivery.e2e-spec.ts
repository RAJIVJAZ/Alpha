import type { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import type Redis from 'ioredis';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import { EventTypes, type EventEnvelope, type OrderStatusChangedEvent } from '@foodgrid/types';
import { addDays, dateOnly, istDate } from '@foodgrid/utils';
import { InternalHttpService, REDIS } from '@foodgrid/utils/server';
import {
  createTestApp,
  FakeInternalHttp,
  issueTestToken,
  truncateSchemas,
} from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { DeliveryEventHandlers } from '../src/events/delivery-event.handlers';
import { DeliveryJobsService } from '../src/jobs/delivery-jobs.service';
import { SERVICE } from '../src/service.config';

const PICKUP = { lat: 12.9352, lng: 77.6245 };
/** ~2.3 km from the pickup */
const DROP = { lat: 12.95, lng: 77.64 };
const OTP = '4821';

const RIDERS = {
  near: { id: 'rider_near', userId: 'rider_u1', name: 'Ravi', at: PICKUP },
  // ~1 km from the pickup: second choice
  next: { id: 'rider_next', userId: 'rider_u2', name: 'Sunil', at: { lat: 12.9442, lng: 77.6245 } },
};
type RiderKey = keyof typeof RIDERS;

const auth = (key: RiderKey) =>
  `Bearer ${issueTestToken({ sub: RIDERS[key].userId, roles: ['RIDER'] })}`;
const admin = () => `Bearer ${issueTestToken({ sub: 'admin', roles: ['ADMIN'] })}`;

const orderAccepted = (n: number) =>
  ({
    id: `evt_${n}`,
    type: EventTypes.OrderAccepted,
    data: {
      orderId: `ord_${n}`,
      orderNumber: `FG-${n}`,
      tenantId: 'tnt_test_kitchen',
      outletId: 'outlet_1',
      outletName: 'Test Kitchen',
      outletAddress: '80 Feet Road, Koramangala',
      outletLat: PICKUP.lat,
      outletLng: PICKUP.lng,
      outletPhone: '+919800000100',
      customerId: 'cust_1',
      customerName: 'Asha',
      customerPhone: '+919800000001',
      type: 'DELIVERY',
      paymentMethod: 'UPI',
      total: '450.00',
      tip: '20.00',
      distanceKm: 2.6,
      deliveryOtp: OTP,
      deliveryAddress: {
        line1: '12, 5th Cross',
        city: 'Bengaluru',
        pincode: '560034',
        lat: DROP.lat,
        lng: DROP.lng,
      },
    },
  }) as unknown as EventEnvelope<string, OrderStatusChangedEvent>;

describe('delivery-service dispatch, proof of delivery and incentives (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) =>
      b.overrideProvider(InternalHttpService).useValue(http),
    );
    // the suite drives the jobs itself
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) void job.stop();
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['delivery', 'platform']);
    await redis.flushdb();
    http.reset();
    http.on('POST', 'notification', 'internal/notifications/send', { queued: true });
    http.on('POST', 'ai', 'internal/ai/fraud/rider-trajectory', { score: 0 });
    for (const r of Object.values(RIDERS))
      await prisma.riderProfile.create({
        data: {
          id: r.id,
          userId: r.userId,
          name: r.name,
          phone: '+919800000200',
          city: 'Bengaluru',
          status: 'ACTIVE',
        },
      });
  });

  afterAll(async () => {
    await app.close();
  });

  const goOnline = (key: RiderKey) =>
    api()
      .post('/api/v1/riders/me/online')
      .set('Authorization', auth(key))
      .send(RIDERS[key].at)
      .expect(200);

  const pendingOffers = async (key: RiderKey) =>
    (await api().get('/api/v1/riders/me/offers').set('Authorization', auth(key)).expect(200))
      .body as { id: string; delivery: { id: string } }[];

  /** Both riders online; the nearest one rejects the order and the next one accepts it. */
  async function dispatchToNext() {
    await goOnline('near');
    await goOnline('next');
    await app.get(DeliveryEventHandlers).onAccepted(orderAccepted(1));

    const [first] = await pendingOffers('near');
    expect(await pendingOffers('next')).toHaveLength(0);
    await api()
      .post(`/api/v1/deliveries/offers/${first!.id}/reject`)
      .set('Authorization', auth('near'))
      .send({ reason: 'Too far' })
      .expect(200);

    const [second] = await pendingOffers('next');
    expect(second!.delivery.id).toBe(first!.delivery.id);
    const { body } = await api()
      .post(`/api/v1/deliveries/offers/${second!.id}/accept`)
      .set('Authorization', auth('next'))
      .expect(200);
    return body as Record<string, unknown> & { id: string };
  }

  const step = (id: string, action: string) =>
    api().post(`/api/v1/deliveries/${id}/${action}`).set('Authorization', auth('next'));
  const complete = (id: string, body: object) => step(id, 'complete').send(body);

  function createScheme(body: object) {
    const now = Date.now();
    return api()
      .post('/api/v1/admin/incentives')
      .set('Authorization', admin())
      .send({
        city: 'Bengaluru',
        rewardAmount: 100,
        startsAt: new Date(now - 2 * 86_400_000).toISOString(),
        endsAt: new Date(now + 5 * 86_400_000).toISOString(),
        ...body,
      });
  }

  async function myIncentives(key: RiderKey) {
    const { body } = await api()
      .get('/api/v1/riders/me/incentives')
      .set('Authorization', auth(key))
      .expect(200);
    return Object.fromEntries(
      (body as { type: string; progress: number; status: string }[]).map((i) => [
        i.type,
        { progress: i.progress, status: i.status },
      ]),
    );
  }

  it('checks riders in, offers to the nearest, and moves a rejected offer to the next rider', async () => {
    const online = await goOnline('near');
    expect(online.body).toMatchObject({ online: true });
    expect(
      await prisma.riderAttendance.findFirst({ where: { riderId: RIDERS.near.id } }),
    ).toMatchObject({ status: 'PRESENT', checkInLat: PICKUP.lat });

    const delivery = await dispatchToNext();
    expect(delivery).toMatchObject({ status: 'ASSIGNED', riderId: RIDERS.next.id });
    expect(delivery).not.toHaveProperty('deliveryOtp');

    const offers = await prisma.deliveryOffer.findMany({ orderBy: { offeredAt: 'asc' } });
    expect(offers.map((o) => [o.riderId, o.status])).toEqual([
      [RIDERS.near.id, 'REJECTED'],
      [RIDERS.next.id, 'ACCEPTED'],
    ]);
    const [near, next] = await Promise.all([
      prisma.riderProfile.findUniqueOrThrow({ where: { id: RIDERS.near.id } }),
      prisma.riderProfile.findUniqueOrThrow({ where: { id: RIDERS.next.id } }),
    ]);
    expect(near.acceptanceRate).toBeLessThan(1);
    expect(next).toMatchObject({ isOnDelivery: true, acceptanceRate: 1 });
  });

  it('completes only with the customer OTP at the drop point, then pays earnings and incentives', async () => {
    await createScheme({ name: 'First order', type: 'ORDER_COUNT', target: 1 }).expect(201);
    await createScheme({ name: 'Two-day streak', type: 'STREAK', target: 2 }).expect(201);
    await createScheme({ name: 'Top rated', type: 'RATING', target: 5, minRating: 4.5 }).expect(
      201,
    );
    // delivered yesterday too, so today's delivery makes a two-day streak
    await prisma.riderAttendance.create({
      data: {
        riderId: RIDERS.next.id,
        date: dateOnly(istDate(addDays(new Date(), -1))),
        deliveryCount: 1,
      },
    });

    const { id } = await dispatchToNext();
    await step(id, 'arrived-pickup').expect(200);
    const picked = await step(id, 'picked-up').expect(200);
    expect(picked.body).toMatchObject({ status: 'PICKED_UP' });
    expect(picked.body).not.toHaveProperty('deliveryOtp');
    await step(id, 'arrived-drop').expect(200);

    // a photo is no substitute for the customer's code
    const photo = `https://cdn.test/delivery-proof/${RIDERS.next.userId}/2026-10-10/0b8e3a52-1f7c-4c1e-9d55-3f0f7d2c9a10.jpg`;
    let res = await complete(id, { proofPhotoUrl: photo }).expect(400);
    expect(res.body.code).toBe('OTP_REQUIRED');
    res = await complete(id, { otp: '1111' }).expect(400);
    expect(res.body.code).toBe('OTP_MISMATCH');
    // still where they went online, ~1.5 km from the drop
    res = await complete(id, { otp: OTP }).expect(409);
    expect(res.body.code).toBe('TOO_FAR_FROM_DROP');

    await api()
      .post('/api/v1/riders/me/location')
      .set('Authorization', auth('next'))
      .send(DROP)
      .expect(200);
    res = await complete(id, { otp: OTP, proofPhotoUrl: 'https://example.com/door.jpg' }).expect(
      400,
    );
    expect(res.body.code).toBe('INVALID_PROOF_PHOTO');

    const done = await complete(id, { otp: OTP, proofPhotoUrl: photo }).expect(200);
    expect(done.body).toMatchObject({ status: 'DELIVERED', proofPhotoUrl: photo });
    expect(done.body).not.toHaveProperty('deliveryOtp');
    await complete(id, { otp: OTP }).expect(409); // already delivered

    const rider = await prisma.riderProfile.findUniqueOrThrow({ where: { id: RIDERS.next.id } });
    expect(rider).toMatchObject({ totalDeliveries: 1, isOnDelivery: false });
    const today = await prisma.riderAttendance.findUniqueOrThrow({
      where: {
        riderId_date: { riderId: RIDERS.next.id, date: dateOnly(istDate()) },
      },
    });
    expect(today.deliveryCount).toBe(1);

    expect(await myIncentives('next')).toEqual({
      ORDER_COUNT: { progress: 1, status: 'ACHIEVED' },
      STREAK: { progress: 2, status: 'ACHIEVED' },
      RATING: { progress: 1, status: 'IN_PROGRESS' },
    });
    const rewards = await prisma.riderEarning.findMany({
      where: { riderId: RIDERS.next.id, type: 'INCENTIVE' },
    });
    expect(rewards.map((r) => r.description).sort()).toEqual(['First order', 'Two-day streak']);
    const events = await prisma.outboxEvent.findMany({ select: { type: true } });
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === EventTypes.IncentiveAchieved)).toHaveLength(2);
    expect(types).toEqual(
      expect.arrayContaining([
        EventTypes.DeliveryAssigned,
        EventTypes.DeliveryPickedUp,
        EventTypes.DeliveryDelivered,
      ]),
    );
  });

  it('locks the delivery code after five wrong tries', async () => {
    const { id } = await dispatchToNext();
    await step(id, 'picked-up').expect(200);
    for (let i = 0; i < 5; i++) await complete(id, { otp: '0000' }).expect(400);
    const res = await complete(id, { otp: OTP }).expect(429);
    expect(res.body.code).toBe('OTP_LOCKED');
  });

  it('credits online minutes to LOGIN_HOURS when the rider goes offline', async () => {
    await createScheme({ name: 'Two hours online', type: 'LOGIN_HOURS', target: 2 }).expect(201);
    await goOnline('next');
    // the shift started 125 minutes ago
    await redis.set(
      `riders:session:${RIDERS.next.id}`,
      new Date(Date.now() - 125 * 60_000).toISOString(),
    );

    const off = await api()
      .post('/api/v1/riders/me/offline')
      .set('Authorization', auth('next'))
      .expect(200);
    expect(off.body).toEqual({ online: false, sessionMinutes: 125 });
    const days = await prisma.riderAttendance.findMany({ where: { riderId: RIDERS.next.id } });
    expect(days.reduce((s, d) => s + d.onlineMinutes, 0)).toBe(125);
    expect(await myIncentives('next')).toEqual({
      LOGIN_HOURS: { progress: 2, status: 'ACHIEVED' },
    });
    expect(
      await prisma.riderEarning.count({ where: { riderId: RIDERS.next.id, type: 'INCENTIVE' } }),
    ).toBe(1);
  });

  it('takes a silent rider offline and credits the shift up to their last position', async () => {
    await createScheme({ name: 'Two hours online', type: 'LOGIN_HOURS', target: 2 }).expect(201);
    await goOnline('near');
    await goOnline('next');
    // near went silent 15 minutes ago, 75 minutes into the shift
    await prisma.riderProfile.update({
      where: { id: RIDERS.near.id },
      data: { lastLocationAt: new Date(Date.now() - 15 * 60_000) },
    });
    await redis.set(
      `riders:session:${RIDERS.near.id}`,
      new Date(Date.now() - 75 * 60_000).toISOString(),
    );

    await app.get(DeliveryJobsService).staleRiders();

    const [near, next] = await Promise.all([
      prisma.riderProfile.findUniqueOrThrow({ where: { id: RIDERS.near.id } }),
      prisma.riderProfile.findUniqueOrThrow({ where: { id: RIDERS.next.id } }),
    ]);
    expect(near.isOnline).toBe(false);
    expect(next.isOnline).toBe(true);
    const days = await prisma.riderAttendance.findMany({ where: { riderId: RIDERS.near.id } });
    expect(days.reduce((s, d) => s + d.onlineMinutes, 0)).toBe(60);
    expect(await redis.get(`riders:session:${RIDERS.near.id}`)).toBeNull();
    expect(await redis.get(`riders:last:${RIDERS.near.id}`)).toBeNull();
    expect(await myIncentives('near')).toEqual({
      LOGIN_HOURS: { progress: 1, status: 'IN_PROGRESS' },
    });
  });

  it('ends the shift of a rider suspended while online', async () => {
    await goOnline('next');
    await redis.set(
      `riders:session:${RIDERS.next.id}`,
      new Date(Date.now() - 70 * 60_000).toISOString(),
    );

    await api()
      .patch(`/api/v1/admin/riders/${RIDERS.next.id}`)
      .set('Authorization', admin())
      .send({ status: 'SUSPENDED' })
      .expect(200);

    const days = await prisma.riderAttendance.findMany({ where: { riderId: RIDERS.next.id } });
    expect(days.reduce((s, d) => s + d.onlineMinutes, 0)).toBe(70);
    // a later check-in starts a fresh session instead of counting the suspension
    expect(await redis.get(`riders:session:${RIDERS.next.id}`)).toBeNull();
    expect(
      await prisma.riderProfile.findUniqueOrThrow({ where: { id: RIDERS.next.id } }),
    ).toMatchObject({ status: 'SUSPENDED', isOnline: false });
  });

  it('refuses a RATING scheme without the rating it is about', async () => {
    const res = await createScheme({ name: 'Top rated', type: 'RATING', target: 5 }).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');

    // an update cannot leave a RATING scheme without it either (it would pay every delivery)
    const orders = await createScheme({ name: 'Orders', type: 'ORDER_COUNT', target: 5 }).expect(
      201,
    );
    const rated = await createScheme({
      name: 'Top rated',
      type: 'RATING',
      target: 5,
      minRating: 4.5,
    }).expect(201);
    const patch = (id: string, body: object) =>
      api().patch(`/api/v1/admin/incentives/${id}`).set('Authorization', admin()).send(body);
    for (const [id, body] of [
      [orders.body.id, { type: 'RATING' }],
      [rated.body.id, { minRating: null }],
    ] as const)
      expect((await patch(id, body).expect(400)).body.code).toBe('VALIDATION_FAILED');
    await patch(orders.body.id, { type: 'RATING', minRating: 4 }).expect(200);
    await patch(rated.body.id, { target: 10 }).expect(200);
  });
});
