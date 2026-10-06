import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import { InternalHttpService, REDIS } from '@foodgrid/utils/server';
import { createTestApp, FakeInternalHttp, issueTestToken, truncateSchemas } from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { SERVICE } from '../src/service.config';

const TENANT = 'tnt_test_kitchen';
const OTHER_TENANT = 'tnt_other_kitchen';

const customer = (id = 'cust_1') => issueTestToken({ sub: id, roles: ['CUSTOMER'], name: 'Asha', phone: '+919800000001' });
const merchant = (tenantId = TENANT) =>
  issueTestToken({ sub: `owner_${tenantId}`, roles: ['CUSTOMER'], tenantId, tenantType: 'RESTAURANT', tenantRole: 'OWNER', outletIds: [] });
const chef = () => issueTestToken({ sub: 'chef_1', roles: ['CUSTOMER'], tenantId: TENANT, tenantType: 'RESTAURANT', tenantRole: 'CHEF', outletIds: [] });

const HOME = { line1: '12, 5th Cross', city: 'Bengaluru', state: 'Karnataka', pincode: '560034', lat: 12.9372, lng: 77.6268, contactName: 'Asha' };

describe('order-service checkout & lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());
  let menu: { paneer: string; half: string; butter: string; lassi: string };

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) => b.overrideProvider(InternalHttpService).useValue(http));
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['commerce', 'platform']);
    await redis.flushdb();
    http.reset();
    http.on('GET', 'delivery', 'internal/delivery/quote', { serviceable: true, distanceKm: 2.4, deliveryFee: 31, etaMins: 32, surgeMultiplier: 1, zoneId: 'zone_1' });
    http.on('POST', 'ai', 'internal/ai/fraud/score', { score: 0.05, decision: 'ALLOW', reasons: [] });
    menu = await seedOutlet();
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedOutlet() {
    const outlet = await prisma.outlet.create({
      data: {
        id: 'outlet_1', tenantId: TENANT, type: 'RESTAURANT', status: 'ACTIVE', name: 'Test Kitchen', slug: 'test-kitchen', addressLine1: '80 Feet Road',
        city: 'Bengaluru', state: 'Karnataka', stateCode: '29', pincode: '560034', lat: 12.9352, lng: 77.6245, geohash: 'tdr1wx', isOpen: true,
        packagingCharge: 20, minOrderValue: 100, kdsStations: ['MAIN', 'BAR'],
      },
    });
    const cat = await prisma.menuCategory.create({ data: { tenantId: TENANT, outletId: outlet.id, name: 'Mains' } });
    const paneer = await prisma.menuItem.create({
      data: {
        tenantId: TENANT, outletId: outlet.id, categoryId: cat.id, name: 'Paneer Tikka', price: 300,
        variants: { create: [{ name: 'Half', priceDelta: -100 }, { name: 'Full', priceDelta: 0, isDefault: true }] },
        addonGroups: { create: { name: 'Extras', maxSelect: 2, addons: { create: [{ name: 'Butter', price: 30 }] } } },
      },
      include: { variants: true, addonGroups: { include: { addons: true } } },
    });
    const lassi = await prisma.menuItem.create({ data: { tenantId: TENANT, outletId: outlet.id, categoryId: cat.id, name: 'Sweet Lassi', price: 99, kdsStation: 'BAR' } });
    await prisma.coupon.create({
      data: { code: 'SAVE50', title: '₹50 off', type: 'FLAT', value: 50, minOrderValue: 200, validFrom: new Date(Date.now() - 86_400_000), validTo: new Date(Date.now() + 86_400_000) },
    });
    return {
      paneer: paneer.id,
      half: paneer.variants.find((v) => v.name === 'Half')!.id,
      butter: paneer.addonGroups[0]!.addons[0]!.id,
      lassi: lassi.id,
    };
  }

  async function fillCart(token: string) {
    await api().post('/api/v1/cart/items').set('Authorization', `Bearer ${token}`).send({ menuItemId: menu.paneer, quantity: 2, variantId: menu.half, addonIds: [menu.butter] }).expect(201);
    await api().post('/api/v1/cart/items').set('Authorization', `Bearer ${token}`).send({ menuItemId: menu.lassi, quantity: 1 }).expect(201);
  }

  it('prices the cart server-side: variants, add-ons, coupon, packaging, fees and GST', async () => {
    const token = customer();
    await fillCart(token);
    await api().post('/api/v1/cart/coupon').set('Authorization', `Bearer ${token}`).send({ code: 'SAVE50' }).expect(200);

    const { body } = await api().post('/api/v1/cart/quote').set('Authorization', `Bearer ${token}`).send({ orderType: 'DELIVERY', lat: HOME.lat, lng: HOME.lng }).expect(200);
    const p = body.cart.pricing;
    // 2 x (300 - 100 + 30) + 99 = 559
    expect(p.subtotal).toBe('559.00');
    expect(p.couponDiscount).toBe('50.00');
    expect(p.packagingCharge).toBe('20.00');
    expect(p.deliveryFee).toBe('31.00');
    expect(body.coupon).toEqual({ code: 'SAVE50', valid: true });
    const sum = ['subtotal', 'packagingCharge', 'deliveryFee', 'platformFee', 'taxTotal', 'tip', 'roundOff'].reduce((s, k) => s + Number(p[k]), 0) - Number(p.couponDiscount) - Number(p.membershipDiscount);
    expect(Number(p.total)).toBeCloseTo(sum, 2);
    expect(Number(p.total) % 1).toBe(0); // grand total is rounded to the rupee
  });

  it('places a COD order once per idempotency key and writes the outbox events', async () => {
    const token = customer();
    await fillCart(token);
    const place = () =>
      api()
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'checkout-abc-123')
        .send({ orderType: 'DELIVERY', paymentMethod: 'COD', deliveryAddress: HOME });

    const first = await place().expect(201);
    expect(first.body.order).toMatchObject({ status: 'PLACED', paymentStatus: 'COD_PENDING' });
    expect(first.body.payment).toBeNull();

    const replay = await place().expect(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.order.id).toBe(first.body.order.id);
    expect(await prisma.order.count()).toBe(1);

    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: first.body.order.id }, orderBy: { occurredAt: 'asc' } });
    expect(events.map((e) => e.type)).toEqual(['order.created', 'order.placed']);
    // the cart is emptied after checkout
    const cart = await api().get('/api/v1/cart').set('Authorization', `Bearer ${token}`).expect(200);
    expect(cart.body.lines).toHaveLength(0);
  });

  it('runs the kitchen lifecycle with per-station tickets and rejects illegal transitions', async () => {
    const token = customer();
    await fillCart(token);
    const { body } = await api().post('/api/v1/orders').set('Authorization', `Bearer ${token}`).send({ orderType: 'TAKEAWAY', paymentMethod: 'COD' }).expect(201);
    const id = body.order.id as string;
    const as = (t: string) => ({ Authorization: `Bearer ${t}` });

    const early = await api().post(`/api/v1/merchant/orders/${id}/complete`).set(as(merchant())).expect(409);
    expect(early.body.code).toBeDefined();
    // a chef can run the KDS but cannot accept orders
    await api().post(`/api/v1/merchant/orders/${id}/accept`).set(as(chef())).send({}).expect(403);

    await api().post(`/api/v1/merchant/orders/${id}/accept`).set(as(merchant())).send({ prepTimeMins: 15 }).expect(200);
    const tickets = await prisma.kitchenTicket.findMany({ where: { orderId: id } });
    expect(tickets.map((t) => t.station).sort()).toEqual(['BAR', 'MAIN']);

    await api().post(`/api/v1/merchant/orders/${id}/preparing`).set(as(chef())).expect(200);
    await api().post(`/api/v1/merchant/orders/${id}/ready`).set(as(chef())).expect(200);
    const done = await api().post(`/api/v1/merchant/orders/${id}/complete`).set(as(merchant())).expect(200);
    expect(done.body.status).toBe('COMPLETED');

    const timeline = await prisma.orderStatusEvent.findMany({ where: { orderId: id }, orderBy: { createdAt: 'asc' } });
    expect(timeline.map((e) => e.toStatus)).toEqual(['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']);
  });

  it('isolates orders between tenants and between customers', async () => {
    const token = customer('cust_A');
    await fillCart(token);
    const { body } = await api().post('/api/v1/orders').set('Authorization', `Bearer ${token}`).send({ orderType: 'TAKEAWAY', paymentMethod: 'COD' }).expect(201);
    const id = body.order.id as string;

    await api().get(`/api/v1/merchant/orders/${id}`).set('Authorization', `Bearer ${merchant(OTHER_TENANT)}`).expect(404);
    await api().post(`/api/v1/merchant/orders/${id}/accept`).set('Authorization', `Bearer ${merchant(OTHER_TENANT)}`).send({}).expect(404);
    const list = await api().get('/api/v1/merchant/orders').set('Authorization', `Bearer ${merchant(OTHER_TENANT)}`).expect(200);
    expect(list.body.data).toHaveLength(0);

    await api().get(`/api/v1/orders/${id}`).set('Authorization', `Bearer ${customer('cust_B')}`).expect(404);
    await api().get(`/api/v1/orders/${id}`).set('Authorization', `Bearer ${token}`).expect(200);
    // a customer token cannot reach merchant routes at all
    await api().get('/api/v1/merchant/orders').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('blocks checkout when the fraud engine says BLOCK and persists nothing', async () => {
    http.on('POST', 'ai', 'internal/ai/fraud/score', { score: 0.97, decision: 'BLOCK', reasons: ['VELOCITY'] });
    const token = customer('cust_risky');
    await fillCart(token);
    const res = await api().post('/api/v1/orders').set('Authorization', `Bearer ${token}`).send({ orderType: 'DELIVERY', paymentMethod: 'UPI', deliveryAddress: HOME }).expect(422);
    expect(res.body.code).toBe('ORDER_BLOCKED');
    expect(await prisma.order.count()).toBe(0);
  });

  it('still takes orders when optional upstreams are down (quote fallback, fraud skipped)', async () => {
    http.reset(); // delivery & ai unavailable
    const token = customer();
    await fillCart(token);
    const res = await api().post('/api/v1/orders').set('Authorization', `Bearer ${token}`).send({ orderType: 'DELIVERY', paymentMethod: 'UPI', deliveryAddress: HOME }).expect(201);
    expect(res.body.order.status).toBe('PENDING_PAYMENT');
    expect(res.body.payment).toMatchObject({ required: true, purpose: 'ORDER', referenceId: res.body.order.id });
  });
});
