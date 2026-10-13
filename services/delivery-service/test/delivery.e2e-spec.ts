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
  issueServiceToken,
  issueTestToken,
  truncateSchemas,
} from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { DeliveryEventHandlers } from '../src/events/delivery-event.handlers';
import { DeliveryJobsService } from '../src/jobs/delivery-jobs.service';
import { PricingService } from '../src/pricing/pricing.service';
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

/** The editable rules of a pricing version, as POST /admin/delivery-pricing takes them. */
const pick = (v: Record<string, unknown>) => ({
  customerFlatFee: v.customerFlatFee,
  freeDeliveryAbove: v.freeDeliveryAbove,
  riderPerKm: v.riderPerKm,
  riderMinPayout: v.riderMinPayout,
  waitingThresholdMins: v.waitingThresholdMins,
  waitingPay: v.waitingPay,
  arrivalRadiusM: v.arrivalRadiusM,
  cancellationPay: v.cancellationPay,
});

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
    app.get(PricingService).reload();
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
    // marked arrived ~1 km away: the wait is recorded but cannot be paid
    expect(
      await prisma.deliveryWait.findUniqueOrThrow({ where: { deliveryId: id } }),
    ).toMatchObject({ verified: false, endedBy: 'PICKED_UP', amount: expect.anything() });
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

  it('pays a delivery once when completion is sent twice at the same time', async () => {
    const { id } = await dispatchToNext();
    await step(id, 'picked-up').expect(200);
    await api()
      .post('/api/v1/riders/me/location')
      .set('Authorization', auth('next'))
      .send(DROP)
      .expect(200);

    const results = await Promise.all([complete(id, { otp: OTP }), complete(id, { otp: OTP })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const rider = await prisma.riderProfile.findUniqueOrThrow({ where: { id: RIDERS.next.id } });
    expect(rider.totalDeliveries).toBe(1);
    expect(await prisma.riderEarning.count({ where: { deliveryId: id, type: 'BASE_PAY' } })).toBe(
      1,
    );
    const delivered = await prisma.outboxEvent.count({
      where: { type: EventTypes.DeliveryDelivered },
    });
    expect(delivered).toBe(1);
  });

  const moveTo = (key: RiderKey, at: { lat: number; lng: number }) =>
    api().post('/api/v1/riders/me/location').set('Authorization', auth(key)).send(at).expect(200);
  const earnings = async (deliveryId: string) =>
    (await prisma.riderEarning.findMany({ where: { deliveryId }, orderBy: { type: 'asc' } })).map(
      (e) => [e.type, Number(e.amount), e.description],
    );
  /** Puts the rider's arrival at the pickup `mins` minutes in the past. */
  const arrivedAgo = (deliveryId: string, mins: number) =>
    prisma.deliveryWait.update({
      where: { deliveryId },
      data: { arrivedAt: new Date(Date.now() - mins * 60_000) },
    });

  it('pays the greater of ₹33 and ₹10 a km, keeps the pricing version and credits it once', async () => {
    const { id } = await dispatchToNext();
    const created = await prisma.delivery.findUniqueOrThrow({ where: { id } });
    const v1 = await prisma.deliveryPricingPolicy.findUniqueOrThrow({ where: { version: 1 } });
    expect(created).toMatchObject({ pricingPolicyId: v1.id, payableKm: 2.6 });
    expect(Number(created.riderEarning)).toBe(33);
    expect(Number((await prisma.deliveryOffer.findFirstOrThrow()).estimatedEarning)).toBe(33);

    await step(id, 'picked-up').expect(200);
    await moveTo('next', DROP);
    await complete(id, { otp: OTP }).expect(200);

    expect(await earnings(id)).toEqual([
      ['BASE_PAY', 7, 'Top-up to the ₹33 minimum'],
      ['DISTANCE_PAY', 26, '2.6 km × ₹10'],
      ['TIP', 20, 'Customer tip'],
    ]);
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: EventTypes.DeliveryDelivered },
    });
    expect(event.payload).toMatchObject({ riderEarning: '33.00', tipAmount: '20.00' });
  });

  it('pays ₹3 once for a GPS-verified wait of more than five minutes at the pickup', async () => {
    const { id } = await dispatchToNext();
    await moveTo('next', PICKUP);
    await step(id, 'arrived-pickup').expect(200);
    await arrivedAgo(id, 7);
    await app.get(DeliveryEventHandlers).onReady({
      data: { orderId: 'ord_1' },
    } as unknown as EventEnvelope<string, OrderStatusChangedEvent>);
    await step(id, 'picked-up').expect(200);

    const wait = await prisma.deliveryWait.findUniqueOrThrow({ where: { deliveryId: id } });
    expect(wait).toMatchObject({ verified: true, arrivalDistanceM: 0, thresholdMins: 5 });
    expect(wait.endedBy).toBe('PICKED_UP');
    expect(wait.waitedMins).toBeGreaterThanOrEqual(7);
    expect(Number(wait.amount)).toBe(3);
    expect(wait.orderReadyAt).not.toBeNull();

    await moveTo('next', DROP);
    await complete(id, { otp: OTP }).expect(200);
    expect(await earnings(id)).toEqual(
      expect.arrayContaining([['WAITING_TIME', 3, expect.stringMatching(/^Waited 7(\.\d)? min/)]]),
    );
    expect(Number((await prisma.delivery.findUniqueOrThrow({ where: { id } })).riderEarning)).toBe(
      36,
    );
  });

  it('pays nothing for a wait of five minutes or less', async () => {
    const { id } = await dispatchToNext();
    await moveTo('next', PICKUP);
    await step(id, 'arrived-pickup').expect(200);
    await arrivedAgo(id, 4);
    await step(id, 'picked-up').expect(200);
    const wait = await prisma.deliveryWait.findUniqueOrThrow({ where: { deliveryId: id } });
    expect(wait).toMatchObject({ verified: true });
    expect(Number(wait.amount)).toBe(0);
  });

  it('pays cancellation and waiting pay when the order is cancelled after the rider arrived', async () => {
    http.on('POST', 'user', 'internal/audit-logs', { id: 'aud_1' });
    const v1 = (await api().get('/api/v1/delivery/pricing').expect(200)).body;
    await api()
      .post('/api/v1/admin/delivery-pricing')
      .set('Authorization', admin())
      .send({ ...pick(v1), cancellationPay: 20, note: 'Pay riders for cancelled orders' })
      .expect(201);

    const { id } = await dispatchToNext();
    await moveTo('next', PICKUP);
    await step(id, 'arrived-pickup').expect(200);
    await arrivedAgo(id, 6);
    const cancelled = {
      id: 'evt_c',
      type: EventTypes.OrderCancelled,
      data: { ...orderAccepted(1).data, status: 'CANCELLED' },
    } as unknown as EventEnvelope<string, OrderStatusChangedEvent>;
    await app.get(DeliveryEventHandlers).onCancelled(cancelled);
    await app.get(DeliveryEventHandlers).onCancelled(cancelled); // redelivered: no second pay

    const d = await prisma.delivery.findUniqueOrThrow({ where: { id }, include: { wait: true } });
    expect(d.status).toBe('CANCELLED');
    expect(Number(d.riderEarning)).toBe(23);
    expect(d.wait).toMatchObject({ endedBy: 'CANCELLED', verified: true });
    expect(await earnings(id)).toEqual([
      ['BASE_PAY', 20, 'Cancellation pay for FG-1'],
      ['WAITING_TIME', 3, expect.stringMatching(/^Waited 6(\.\d)? min/)],
    ]);
    const events = await prisma.outboxEvent.findMany({
      where: { type: EventTypes.DeliveryCancelled },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      riderEarning: '23.00',
      riderUserId: RIDERS.next.userId,
      status: 'CANCELLED',
    });
    const rider = await prisma.riderProfile.findUniqueOrThrow({ where: { id: RIDERS.next.id } });
    expect(rider.isOnDelivery).toBe(false);
  });

  it('still cancels when the rider moves the delivery on while the cancellation runs', async () => {
    const { id } = await dispatchToNext();
    await step(id, 'picked-up').expect(200);
    // the handler's first read is from before the pickup
    const real = prisma.delivery.findUnique.bind(prisma.delivery);
    const stale = await prisma.delivery.findUniqueOrThrow({ where: { id } });
    const spy = jest
      .spyOn(prisma.delivery, 'findUnique')
      .mockImplementationOnce((() => Promise.resolve({ ...stale, status: 'ASSIGNED' })) as never);
    try {
      await app.get(DeliveryEventHandlers).onCancelled({
        id: 'evt_c',
        type: EventTypes.OrderCancelled,
        data: { ...orderAccepted(1).data, status: 'CANCELLED' },
      } as unknown as EventEnvelope<string, OrderStatusChangedEvent>);
    } finally {
      spy.mockRestore();
    }
    expect(await real({ where: { id } })).toMatchObject({ status: 'CANCELLED' });
    expect(await prisma.outboxEvent.count({ where: { type: EventTypes.DeliveryCancelled } })).toBe(
      1,
    );
  });

  it('pays nothing when the order is cancelled before the rider reached the pickup', async () => {
    const { id } = await dispatchToNext();
    await app.get(DeliveryEventHandlers).onCancelled({
      id: 'evt_c',
      type: EventTypes.OrderCancelled,
      data: { ...orderAccepted(1).data, status: 'CANCELLED' },
    } as unknown as EventEnvelope<string, OrderStatusChangedEvent>);
    const d = await prisma.delivery.findUniqueOrThrow({ where: { id } });
    expect(d.status).toBe('CANCELLED');
    expect(Number(d.riderEarning)).toBe(0);
    expect(await earnings(id)).toEqual([]);
  });

  it('lets finance change delivery pricing as a new audited version used by new quotes', async () => {
    http.on('POST', 'user', 'internal/audit-logs', { id: 'aud_1' });
    const quote = (subtotal: number) =>
      api()
        .get('/api/v1/internal/delivery/quote')
        .set('x-service-token', issueServiceToken('order-service'))
        .query({
          pickupLat: PICKUP.lat,
          pickupLng: PICKUP.lng,
          dropLat: DROP.lat,
          dropLng: DROP.lng,
          subtotal,
        })
        .expect(200);
    // through the API, which also refreshes the cached zone list
    const zone = await api()
      .post('/api/v1/admin/delivery-zones')
      .set('Authorization', admin())
      .send({
        name: 'Koramangala',
        city: 'Bengaluru',
        polygon: [
          [77.5, 12.8],
          [77.8, 12.8],
          [77.8, 13.1],
          [77.5, 13.1],
          [77.5, 12.8],
        ],
        centerLat: PICKUP.lat,
        centerLng: PICKUP.lng,
        surgeMultiplier: 1.5,
      })
      .expect(201);
    try {
      const v1 = (await api().get('/api/v1/delivery/pricing').expect(200)).body;
      expect(v1).toMatchObject({
        version: 1,
        customerFlatFee: 15,
        freeDeliveryAbove: 399,
        riderPerKm: 10,
        riderMinPayout: 33,
        waitingThresholdMins: 5,
        waitingPay: 3,
        createdBy: 'system',
      });
      // surge raises rider pay, never the flat fee
      expect((await quote(398.99)).body).toMatchObject({ deliveryFee: 15, freeDeliveryAbove: 399 });
      expect((await quote(399)).body).toMatchObject({ deliveryFee: 0, pricingVersion: 1 });

      const change = { ...pick(v1), freeDeliveryAbove: 499, note: 'Free delivery from ₹499' };
      await api()
        .post('/api/v1/admin/delivery-pricing')
        .set('Authorization', auth('next'))
        .send(change)
        .expect(403);
      const finance = `Bearer ${issueTestToken({ sub: 'fin_1', roles: ['FINANCE'] })}`;
      await api()
        .post('/api/v1/admin/delivery-pricing')
        .set('Authorization', finance)
        .send({ ...change, riderMinPayout: -1 })
        .expect(400);
      const v2 = await api()
        .post('/api/v1/admin/delivery-pricing')
        .set('Authorization', finance)
        .send(change)
        .expect(201);
      expect(v2.body).toMatchObject({ version: 2, freeDeliveryAbove: 499, createdBy: 'fin_1' });
      expect(http.callsTo('user', 'internal/audit-logs')).toEqual([
        expect.objectContaining({
          body: expect.objectContaining({
            actorId: 'fin_1',
            action: 'delivery_pricing.create',
            entityType: 'DeliveryPricingPolicy',
          }),
        }),
      ]);
      expect((await quote(450)).body).toMatchObject({ deliveryFee: 15, pricingVersion: 2 });

      const list = await api()
        .get('/api/v1/admin/delivery-pricing')
        .set('Authorization', finance)
        .expect(200);
      expect(list.body.current.version).toBe(2);
      expect(list.body.history.map((v: { version: number }) => v.version)).toEqual([2, 1]);

      // the audit log is written first: when it is down, nothing changes
      http.reset(); // user-service unreachable
      await api()
        .post('/api/v1/admin/delivery-pricing')
        .set('Authorization', finance)
        .send({ ...change, customerFlatFee: 25 })
        .expect(503);
      expect(await prisma.deliveryPricingPolicy.count()).toBe(2);
    } finally {
      // the zone list is cached across tests: retire the zone so later deliveries skip it
      await api()
        .patch(`/api/v1/admin/delivery-zones/${zone.body.id}`)
        .set('Authorization', admin())
        .send({ isActive: false })
        .expect(200);
    }
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

  it('takes a rider application, shows the reviewer note and accepts a resubmission', async () => {
    http.on('POST', 'user', 'internal/approvals', { id: 'apr_1' });
    const applicant = `Bearer ${issueTestToken({ sub: 'applicant_u', roles: ['CUSTOMER'], phone: '+919800000300' })}`;
    const licence =
      'https://cdn.test/kyc/applicant_u/2026-10-10/0b8e3a52-1f7c-4c1e-9d55-3f0f7d2c9a10.jpg';
    const apply = (name: string, url = licence, auth = applicant) =>
      api()
        .post('/api/v1/riders/onboarding')
        .set('Authorization', auth)
        .send({
          name,
          city: 'Bengaluru',
          vehicleType: 'SCOOTER',
          vehicleNumber: 'KA01AB1234',
          documents: [{ kind: 'DRIVING_LICENSE', url }],
        });
    const me = async () =>
      (await api().get('/api/v1/riders/me').set('Authorization', applicant).expect(200)).body as {
        id: string;
        status: string;
        rejectionReason: string | null;
      };
    const decide = async (
      decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED',
      notes: string | null,
    ) =>
      app.get(DeliveryEventHandlers).onApproval({
        data: {
          entityType: 'RIDER',
          entityId: (await me()).id,
          decision,
          notes,
          reviewedBy: 'admin',
        },
      } as unknown as Parameters<DeliveryEventHandlers['onApproval']>[0]);

    await api().get('/api/v1/riders/me').set('Authorization', applicant).expect(404);
    const googleOnly = `Bearer ${issueTestToken({ sub: 'google_u', roles: ['CUSTOMER'] })}`;
    expect((await apply('Kiran', licence, googleOnly).expect(400)).body.code).toBe(
      'PHONE_REQUIRED',
    );
    expect((await apply('Kiran', 'https://example.com/dl.jpg').expect(400)).body.code).toBe(
      'INVALID_DOCUMENT',
    );
    await apply('Kiran').expect(201);
    expect(await me()).toMatchObject({ status: 'PENDING_APPROVAL', rejectionReason: null });
    expect(http.callsTo('user', 'internal/approvals')).toHaveLength(1);
    expect((await apply('Kiran').expect(409)).body.code).toBe('ALREADY_APPLIED');

    await decide('CHANGES_REQUESTED', 'Add the back of the licence');
    expect(await me()).toMatchObject({
      status: 'PENDING_APPROVAL',
      rejectionReason: 'Add the back of the licence',
    });
    await apply('Kiran').expect(201);
    expect(await me()).toMatchObject({ status: 'PENDING_APPROVAL', rejectionReason: null });

    await decide('REJECTED', 'Licence photo is blurred');
    expect(await me()).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Licence photo is blurred',
    });

    await apply('Kiran K').expect(201);
    expect(await me()).toMatchObject({ status: 'PENDING_APPROVAL', rejectionReason: null });
    expect(http.callsTo('user', 'internal/approvals')).toHaveLength(3);

    await decide('APPROVED', null);
    expect(await me()).toMatchObject({ status: 'ACTIVE', rejectionReason: null });
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
