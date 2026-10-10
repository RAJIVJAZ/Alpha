import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import type { TenantRole } from '@foodgrid/types';
import { encodeGeohash, istDate, istParts } from '@foodgrid/utils';
import { InternalHttpService, REDIS } from '@foodgrid/utils/server';
import {
  createTestApp,
  FakeInternalHttp,
  issueServiceToken,
  issueTestToken,
  truncateSchemas,
} from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { OrderEventHandlers } from '../src/events/order-event.handlers';
import { SERVICE } from '../src/service.config';

const TENANT = 'tnt_test_kitchen';
const OTHER_TENANT = 'tnt_other_kitchen';

const customer = (id = 'cust_1') =>
  issueTestToken({ sub: id, roles: ['CUSTOMER'], name: 'Asha', phone: '+919800000001' });
const merchant = (tenantId = TENANT) =>
  issueTestToken({
    sub: `owner_${tenantId}`,
    roles: ['CUSTOMER'],
    tenantId,
    tenantType: 'RESTAURANT',
    tenantRole: 'OWNER',
    outletIds: [],
  });
const chef = () => staff('CHEF');
const staff = (tenantRole: TenantRole, outletIds: string[] = []) =>
  issueTestToken({
    sub: `${tenantRole.toLowerCase()}_1`,
    roles: ['CUSTOMER'],
    tenantId: TENANT,
    tenantType: 'RESTAURANT',
    tenantRole,
    outletIds,
  });

const HOME = {
  line1: '12, 5th Cross',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560034',
  lat: 12.9372,
  lng: 77.6268,
  contactName: 'Asha',
};

describe('order-service checkout & lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());
  let menu: { paneer: string; half: string; butter: string; lassi: string };

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) =>
      b.overrideProvider(InternalHttpService).useValue(http),
    );
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['commerce', 'platform']);
    await redis.flushdb();
    http.reset();
    http.on('GET', 'delivery', 'internal/delivery/quote', {
      serviceable: true,
      distanceKm: 2.4,
      deliveryFee: 31,
      etaMins: 32,
      surgeMultiplier: 1,
      zoneId: 'zone_1',
    });
    http.on('POST', 'ai', 'internal/ai/fraud/score', {
      score: 0.05,
      decision: 'ALLOW',
      reasons: [],
    });
    menu = await seedOutlet();
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedOutlet() {
    const outlet = await prisma.outlet.create({
      data: {
        id: 'outlet_1',
        tenantId: TENANT,
        type: 'RESTAURANT',
        status: 'ACTIVE',
        name: 'Test Kitchen',
        slug: 'test-kitchen',
        addressLine1: '80 Feet Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        stateCode: '29',
        pincode: '560034',
        lat: 12.9352,
        lng: 77.6245,
        geohash: 'tdr1wx',
        isOpen: true,
        packagingCharge: 20,
        minOrderValue: 100,
        kdsStations: ['MAIN', 'BAR'],
      },
    });
    const cat = await prisma.menuCategory.create({
      data: { tenantId: TENANT, outletId: outlet.id, name: 'Mains' },
    });
    const paneer = await prisma.menuItem.create({
      data: {
        tenantId: TENANT,
        outletId: outlet.id,
        categoryId: cat.id,
        name: 'Paneer Tikka',
        price: 300,
        variants: {
          create: [
            { name: 'Half', priceDelta: -100 },
            { name: 'Full', priceDelta: 0, isDefault: true },
          ],
        },
        addonGroups: {
          create: {
            name: 'Extras',
            maxSelect: 2,
            addons: { create: [{ name: 'Butter', price: 30 }] },
          },
        },
      },
      include: { variants: true, addonGroups: { include: { addons: true } } },
    });
    const lassi = await prisma.menuItem.create({
      data: {
        tenantId: TENANT,
        outletId: outlet.id,
        categoryId: cat.id,
        name: 'Sweet Lassi',
        price: 99,
        kdsStation: 'BAR',
      },
    });
    await prisma.coupon.create({
      data: {
        code: 'SAVE50',
        title: '₹50 off',
        type: 'FLAT',
        value: 50,
        minOrderValue: 200,
        validFrom: new Date(Date.now() - 86_400_000),
        validTo: new Date(Date.now() + 86_400_000),
      },
    });
    return {
      paneer: paneer.id,
      half: paneer.variants.find((v) => v.name === 'Half')!.id,
      butter: paneer.addonGroups[0]!.addons[0]!.id,
      lassi: lassi.id,
    };
  }

  async function fillCart(token: string) {
    await api()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ menuItemId: menu.paneer, quantity: 2, variantId: menu.half, addonIds: [menu.butter] })
      .expect(201);
    await api()
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ menuItemId: menu.lassi, quantity: 1 })
      .expect(201);
  }

  it('prices the cart server-side: variants, add-ons, coupon, packaging, fees and GST', async () => {
    const token = customer();
    await fillCart(token);
    await api()
      .post('/api/v1/cart/coupon')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'SAVE50' })
      .expect(200);

    const { body } = await api()
      .post('/api/v1/cart/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderType: 'DELIVERY', lat: HOME.lat, lng: HOME.lng })
      .expect(200);
    const p = body.cart.pricing;
    // 2 x (300 - 100 + 30) + 99 = 559
    expect(p.subtotal).toBe('559.00');
    expect(p.couponDiscount).toBe('50.00');
    expect(p.packagingCharge).toBe('20.00');
    expect(p.deliveryFee).toBe('31.00');
    expect(body.coupon).toEqual({ code: 'SAVE50', valid: true });
    const sum =
      [
        'subtotal',
        'packagingCharge',
        'deliveryFee',
        'platformFee',
        'taxTotal',
        'tip',
        'roundOff',
      ].reduce((s, k) => s + Number(p[k]), 0) -
      Number(p.couponDiscount) -
      Number(p.membershipDiscount);
    expect(Number(p.total)).toBeCloseTo(sum, 2);
    expect(Number(p.total) % 1).toBe(0); // grand total is rounded to the rupee
  });

  it('lists platform offers without an outlet and outlet-specific eligibility with one', async () => {
    const token = customer('cust_offers');
    const offers = await api()
      .get('/api/v1/coupons')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(offers.body).toEqual([expect.objectContaining({ code: 'SAVE50', eligible: true })]);
    await api()
      .get('/api/v1/coupons')
      .query({ outletId: 'outlet_1' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const missing = await api()
      .get('/api/v1/coupons')
      .query({ outletId: 'nope' })
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(missing.body.code).toBe('NOT_FOUND');
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
    // the replay is byte-for-byte the first response, money format included
    expect(first.body.order.total).toMatch(/^\d+\.\d{2}$/);
    expect(replay.body).toEqual(first.body);
    expect(await prisma.order.count()).toBe(1);

    const events = await prisma.outboxEvent.findMany({
      where: { aggregateId: first.body.order.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => e.type)).toEqual(['order.created', 'order.placed']);
    // the cart is emptied after checkout
    const cart = await api()
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(cart.body.lines).toHaveLength(0);
  });

  it('runs the kitchen lifecycle with per-station tickets and rejects illegal transitions', async () => {
    const token = customer();
    await fillCart(token);
    const { body } = await api()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderType: 'TAKEAWAY', paymentMethod: 'COD' })
      .expect(201);
    const id = body.order.id as string;
    const as = (t: string) => ({ Authorization: `Bearer ${t}` });

    const early = await api()
      .post(`/api/v1/merchant/orders/${id}/complete`)
      .set(as(merchant()))
      .expect(409);
    expect(early.body.code).toBeDefined();
    // a chef can run the KDS but cannot accept orders
    await api().post(`/api/v1/merchant/orders/${id}/accept`).set(as(chef())).send({}).expect(403);

    await api()
      .post(`/api/v1/merchant/orders/${id}/accept`)
      .set(as(merchant()))
      .send({ prepTimeMins: 15 })
      .expect(200);
    const tickets = await prisma.kitchenTicket.findMany({ where: { orderId: id } });
    expect(tickets.map((t) => t.station).sort()).toEqual(['BAR', 'MAIN']);

    await api().post(`/api/v1/merchant/orders/${id}/preparing`).set(as(chef())).expect(200);
    await api().post(`/api/v1/merchant/orders/${id}/ready`).set(as(chef())).expect(200);
    const done = await api()
      .post(`/api/v1/merchant/orders/${id}/complete`)
      .set(as(merchant()))
      .expect(200);
    expect(done.body.status).toBe('COMPLETED');

    const timeline = await prisma.orderStatusEvent.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(timeline.map((e) => e.toStatus)).toEqual([
      'PLACED',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'COMPLETED',
    ]);
  });

  it('keeps the commission payment-service charged on the order, for the merchant only', async () => {
    const token = customer();
    await fillCart(token);
    const { body } = await api()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderType: 'TAKEAWAY', paymentMethod: 'COD' })
      .expect(201);
    const id = body.order.id as string;
    // payment.commission.accrued for a business with a 12% override
    await app.get(OrderEventHandlers).onCommission({
      id: 'evt_comm_1',
      type: 'payment.commission.accrued',
      data: {
        orderId: id,
        tenantId: TENANT,
        outletId: 'outlet_1',
        commissionRate: '12.00',
        commissionAmount: '64.68',
      },
    } as never);

    const seen = await api()
      .get(`/api/v1/merchant/orders/${id}`)
      .set('Authorization', `Bearer ${merchant()}`)
      .expect(200);
    expect(seen.body).toMatchObject({ commissionRate: '12.00', commissionAmount: '64.68' });
    // later order events carry it to every consumer
    await api()
      .post(`/api/v1/merchant/orders/${id}/accept`)
      .set('Authorization', `Bearer ${merchant()}`)
      .send({})
      .expect(200);
    const accepted = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: id, type: 'order.accepted' },
    });
    expect(accepted.payload).toMatchObject({ commissionRate: '12.00', commissionAmount: '64.68' });
  });

  it('isolates orders between tenants and between customers', async () => {
    const token = customer('cust_A');
    await fillCart(token);
    const { body } = await api()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderType: 'TAKEAWAY', paymentMethod: 'COD' })
      .expect(201);
    const id = body.order.id as string;

    await api()
      .get(`/api/v1/merchant/orders/${id}`)
      .set('Authorization', `Bearer ${merchant(OTHER_TENANT)}`)
      .expect(404);
    await api()
      .post(`/api/v1/merchant/orders/${id}/accept`)
      .set('Authorization', `Bearer ${merchant(OTHER_TENANT)}`)
      .send({})
      .expect(404);
    const list = await api()
      .get('/api/v1/merchant/orders')
      .set('Authorization', `Bearer ${merchant(OTHER_TENANT)}`)
      .expect(200);
    expect(list.body.data).toHaveLength(0);

    await api()
      .get(`/api/v1/orders/${id}`)
      .set('Authorization', `Bearer ${customer('cust_B')}`)
      .expect(404);
    const mine = await api()
      .get(`/api/v1/orders/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const listed = await api()
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // risk, commission and request metadata never reach the customer
    for (const order of [mine.body, listed.body.data[0]]) {
      for (const field of [
        'fraudScore',
        'commissionRate',
        'commissionAmount',
        'couponFundedBy',
        'ipAddress',
        'deviceId',
        'idempotencyKey',
        'tenantId',
      ])
        expect(order).not.toHaveProperty(field);
    }
    expect(mine.body.events[0]).not.toHaveProperty('actorId');
    // a customer token cannot reach merchant routes at all
    await api().get('/api/v1/merchant/orders').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('lists open sponsored outlets first, with the campaign id for click attribution', async () => {
    await prisma.outlet.create({
      data: {
        id: 'outlet_2',
        tenantId: OTHER_TENANT,
        type: 'FOOD_CART',
        status: 'ACTIVE',
        name: 'Momo Cart',
        slug: 'momo-cart',
        addressLine1: '1st Main',
        city: 'Bengaluru',
        state: 'Karnataka',
        stateCode: '29',
        pincode: '560034',
        lat: 12.9452,
        lng: 77.6345,
        geohash: 'tdr1y0',
        isOpen: true,
      },
    });
    http.on('POST', 'ads', 'internal/ads/serve', [
      {
        campaignId: 'cmp_1',
        targetType: 'OUTLET',
        targetId: 'outlet_2',
        rank: 1,
        sponsored: true,
        clickToken: 'tok_1',
      },
    ]);
    const { body } = await api()
      .get('/api/v1/outlets/nearby')
      .query({ lat: 12.9352, lng: 77.6245 })
      .expect(200);
    expect(body.data.map((o: { id: string }) => o.id)).toEqual(['outlet_2', 'outlet_1']);
    expect(body.data[0]).toMatchObject({
      sponsored: true,
      adCampaignId: 'cmp_1',
      adClickToken: 'tok_1',
    });
    expect(body.data[1]).toMatchObject({ sponsored: false, adCampaignId: null });
  });

  it('reports daily item sales on IST calendar days for production planning', async () => {
    // 00:30 IST on day D is 19:00 UTC on day D-1: it must count towards day D
    const placedAt = new Date(Date.now() - 2 * 86_400_000);
    placedAt.setUTCHours(19, 0, 0, 0);
    const istDay = new Date(placedAt.getTime() + 330 * 60_000).toISOString().slice(0, 10);
    await prisma.order.create({
      data: {
        orderNumber: 'ORD-T-1',
        tenantId: TENANT,
        outletId: 'outlet_1',
        status: 'COMPLETED',
        channel: 'POS',
        type: 'TAKEAWAY',
        subtotal: 600,
        total: 630,
        placedAt,
        createdAt: placedAt,
        items: {
          create: {
            menuItemId: menu.paneer,
            name: 'Paneer Tikka',
            quantity: 2,
            unitPrice: 300,
            totalPrice: 600,
            gstRate: 5,
            taxAmount: 30,
          },
        },
      },
    });
    // today's sales so far are left out (a partial day would drag the forecast down)
    await prisma.order.create({
      data: {
        orderNumber: 'ORD-T-2',
        tenantId: TENANT,
        outletId: 'outlet_1',
        status: 'COMPLETED',
        channel: 'POS',
        type: 'TAKEAWAY',
        subtotal: 300,
        total: 315,
        placedAt: new Date(),
        createdAt: new Date(),
        items: {
          create: {
            menuItemId: menu.paneer,
            name: 'Paneer Tikka',
            quantity: 1,
            unitPrice: 300,
            totalPrice: 300,
            gstRate: 5,
            taxAmount: 15,
          },
        },
      },
    });
    const res = await api()
      .get('/api/v1/internal/outlets/outlet_1/item-sales')
      .query({ days: 7 })
      .set('x-service-token', issueServiceToken('inventory-service'))
      .expect(200);
    expect(res.body).toEqual([
      { menuItemId: menu.paneer, name: 'Paneer Tikka', date: istDay, quantity: 2, avgPrice: 300 },
    ]);
  });

  it('blocks checkout when the fraud engine says BLOCK and persists nothing', async () => {
    http.on('POST', 'ai', 'internal/ai/fraud/score', {
      score: 0.97,
      decision: 'BLOCK',
      reasons: ['VELOCITY'],
    });
    const token = customer('cust_risky');
    await fillCart(token);
    const res = await api()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderType: 'DELIVERY', paymentMethod: 'UPI', deliveryAddress: HOME })
      .expect(422);
    expect(res.body.code).toBe('ORDER_BLOCKED');
    expect(await prisma.order.count()).toBe(0);
  });

  it('still takes orders when optional upstreams are down (quote fallback, fraud skipped)', async () => {
    http.reset(); // delivery & ai unavailable
    const token = customer();
    await fillCart(token);
    const res = await api()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderType: 'DELIVERY', paymentMethod: 'UPI', deliveryAddress: HOME })
      .expect(201);
    expect(res.body.order.status).toBe('PENDING_PAYMENT');
    expect(res.body.payment).toMatchObject({
      required: true,
      purpose: 'ORDER',
      referenceId: res.body.order.id,
    });
  });
  // ─── coupons are validated when applied (K8) ─────────────────────────────
  it('rejects a coupon that cannot be used on this cart with a 422 and a readable reason', async () => {
    const token = customer('cust_coupons');
    const as = { Authorization: `Bearer ${token}` };
    await fillCart(token); // subtotal 559
    const live = {
      validFrom: new Date(Date.now() - 86_400_000),
      validTo: new Date(Date.now() + 86_400_000),
    };
    await prisma.coupon.createMany({
      data: [
        {
          code: 'OLDDEAL',
          title: 'Old',
          type: 'FLAT',
          value: 40,
          validFrom: new Date(Date.now() - 9 * 86_400_000),
          validTo: new Date(Date.now() - 86_400_000),
        },
        { code: 'PAUSED', title: 'Paused', type: 'FLAT', value: 40, isActive: false, ...live },
        {
          code: 'ELSEWHERE',
          title: 'Other kitchen',
          type: 'FLAT',
          value: 40,
          tenantId: OTHER_TENANT,
          ...live,
        },
        { code: 'BIGSPEND', title: 'Big', type: 'FLAT', value: 100, minOrderValue: 999, ...live },
        {
          code: 'SOLDOUT',
          title: 'Gone',
          type: 'FLAT',
          value: 40,
          usageLimit: 5,
          usedCount: 5,
          ...live,
        },
        { code: 'MEMBERS', title: 'Members', type: 'FLAT', value: 40, membersOnly: true, ...live },
        {
          code: 'NEWBIE',
          title: 'First order',
          type: 'FLAT',
          value: 40,
          firstOrderOnly: true,
          ...live,
        },
      ],
    });
    // a delivered order means NEWBIE no longer applies
    await prisma.order.create({
      data: {
        orderNumber: 'ORD-OLD-1',
        tenantId: TENANT,
        outletId: 'outlet_1',
        customerId: 'cust_coupons',
        status: 'DELIVERED',
        channel: 'APP',
        type: 'DELIVERY',
        subtotal: 300,
        total: 330,
      },
    });
    const cases: [string, string, RegExp][] = [
      ['NOPE123', 'COUPON_INVALID', /NOPE123 is not a valid coupon code/],
      ['OLDDEAL', 'COUPON_EXPIRED', /expired/],
      ['PAUSED', 'COUPON_INACTIVE', /no longer active/],
      ['ELSEWHERE', 'COUPON_NOT_APPLICABLE', /Not valid at this restaurant/],
      ['BIGSPEND', 'COUPON_MIN_ORDER', /Add items worth ₹440 more to use BIGSPEND/],
      ['SOLDOUT', 'COUPON_EXHAUSTED', /usage limit/],
      ['MEMBERS', 'COUPON_MEMBERS_ONLY', /members/i],
      ['newbie', 'COUPON_FIRST_ORDER', /first order/],
    ];
    for (const [code, error, message] of cases) {
      const res = await api().post('/api/v1/cart/coupon').set(as).send({ code }).expect(422);
      expect(res.body.code).toBe(error);
      expect(res.body.message).toMatch(message);
    }
    const cart = await api().get('/api/v1/cart').set(as).expect(200);
    expect(cart.body.couponCode).toBeNull();

    // a coupon this customer has already used up
    await prisma.couponRedemption.create({
      data: {
        couponId: (await prisma.coupon.findUniqueOrThrow({ where: { code: 'SAVE50' } })).id,
        userId: 'cust_coupons',
        orderId: 'order_old',
        discount: 50,
      },
    });
    const used = await api().post('/api/v1/cart/coupon').set(as).send({ code: 'SAVE50' });
    expect(used.status).toBe(422);
    expect(used.body.code).toBe('COUPON_USED');

    const empty = customer('cust_empty');
    const none = await api()
      .post('/api/v1/cart/coupon')
      .set('Authorization', `Bearer ${empty}`)
      .send({ code: 'SAVE50' })
      .expect(400);
    expect(none.body.code).toBe('CART_EMPTY');
  });

  it('re-checks an applied coupon on every quote and at checkout once the cart changes', async () => {
    const token = customer('cust_feast');
    const as = { Authorization: `Bearer ${token}` };
    await prisma.coupon.create({
      data: {
        code: 'FEAST',
        title: '₹75 off over ₹500',
        type: 'FLAT',
        value: 75,
        minOrderValue: 500,
        validFrom: new Date(Date.now() - 86_400_000),
        validTo: new Date(Date.now() + 86_400_000),
      },
    });
    await fillCart(token); // 460 paneer + 99 lassi
    const applied = await api()
      .post('/api/v1/cart/coupon')
      .set(as)
      .send({ code: 'feast' })
      .expect(200);
    expect(applied.body.couponCode).toBe('FEAST');

    const lassi = applied.body.lines.find(
      (l: { menuItemId: string }) => l.menuItemId === menu.lassi,
    );
    await api().delete(`/api/v1/cart/items/${lassi.lineId}`).set(as).expect(200);
    const { body } = await api()
      .post('/api/v1/cart/quote')
      .set(as)
      .send({ orderType: 'TAKEAWAY' })
      .expect(200);
    expect(body.coupon).toEqual({
      code: 'FEAST',
      valid: false,
      reason: 'Add items worth ₹40 more to use FEAST',
    });
    expect(body.cart.pricing.couponDiscount).toBe('0.00');
    expect(body.cart.pricing.messages).toContain('Add items worth ₹40 more to use FEAST');

    const order = await api()
      .post('/api/v1/orders')
      .set(as)
      .send({ orderType: 'TAKEAWAY', paymentMethod: 'COD' })
      .expect(422);
    expect(order.body).toMatchObject({
      code: 'COUPON_INVALID',
      message: 'Add items worth ₹40 more to use FEAST',
    });
    expect(await prisma.couponRedemption.count()).toBe(0);
  });

  // ─── money is always a two-decimal string (K6) ───────────────────────────
  it('sends every amount as a two-decimal string: outlet, menu, quote and orders', async () => {
    const twoDp = /^-?\d+\.\d{2}$/;
    const detail = await api().get('/api/v1/outlets/test-kitchen').expect(200);
    expect(detail.body).toMatchObject({
      costForTwo: '300.00',
      minOrderValue: '100.00',
      packagingCharge: '20.00',
    });
    const menuRes = await api().get('/api/v1/outlets/test-kitchen/menu').expect(200);
    const paneer = menuRes.body.categories[0].items.find(
      (i: { id: string }) => i.id === menu.paneer,
    );
    expect(paneer.price).toBe('300.00');
    expect(paneer.variants.map((v: { priceDelta: string }) => v.priceDelta).sort()).toEqual([
      '-100.00',
      '0.00',
    ]);
    const nearby = await api()
      .get('/api/v1/outlets/nearby')
      .query({ lat: 12.9352, lng: 77.6245 })
      .expect(200);
    expect(nearby.body.data[0].costForTwo).toBe('300.00');

    const token = customer('cust_money');
    const as = { Authorization: `Bearer ${token}` };
    await fillCart(token);
    const quote = await api()
      .post('/api/v1/cart/quote')
      .set(as)
      .send({ orderType: 'DELIVERY', lat: HOME.lat, lng: HOME.lng })
      .expect(200);
    expect(quote.body.delivery).toMatchObject({ deliveryFee: '31.00', distanceKm: 2.4 });
    for (const v of Object.values(quote.body.cart.pricing).filter((v) => typeof v === 'string'))
      expect(v).toMatch(twoDp);

    const placed = await api()
      .post('/api/v1/orders')
      .set(as)
      .send({ orderType: 'DELIVERY', paymentMethod: 'COD', deliveryAddress: HOME })
      .expect(201);
    const order = await api().get(`/api/v1/orders/${placed.body.order.id}`).set(as).expect(200);
    for (const k of ['subtotal', 'deliveryFee', 'packagingCharge', 'taxTotal', 'roundOff', 'total'])
      expect(order.body[k]).toMatch(twoDp);
    expect(order.body.items[0].unitPrice).toMatch(twoDp);
    const list = await api().get('/api/v1/orders').set(as).expect(200);
    expect(list.body.data[0].total).toBe(order.body.total);
  });

  // ─── tracking stops counting down once the order is over (K7) ────────────
  it('tracks with an ETA while the order is live and etaMins null once it is over', async () => {
    const token = customer('cust_track');
    const as = { Authorization: `Bearer ${token}` };
    const place = async () => {
      await fillCart(token);
      const { body } = await api()
        .post('/api/v1/orders')
        .set(as)
        .send({ orderType: 'DELIVERY', paymentMethod: 'COD', deliveryAddress: HOME })
        .expect(201);
      return body.order.id as string;
    };
    const track = (id: string) => api().get(`/api/v1/orders/${id}/track`).set(as).expect(200);

    const first = await place();
    const live = await track(first);
    expect(live.body.status).toBe('PLACED');
    expect(live.body.etaMins).toBeGreaterThan(25); // the quote promised 32 minutes
    await api()
      .post(`/api/v1/orders/${first}/cancel`)
      .set(as)
      .send({ reason: 'Changed my mind' })
      .expect(200);
    expect((await track(first)).body).toMatchObject({ status: 'CANCELLED', etaMins: null });

    const second = await place();
    await prisma.order.update({
      where: { id: second },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
    expect((await track(second)).body).toMatchObject({ status: 'DELIVERED', etaMins: null });

    const third = await place();
    await prisma.order.update({ where: { id: third }, data: { status: 'REJECTED' } });
    expect((await track(third)).body.etaMins).toBeNull();
  });

  // ─── open flags mean the same on cards and on the outlet page (K2) ────────
  it('shows isOpen as the accepting-orders switch and isOpenNow as open right now', async () => {
    const otherDay = (istParts().weekday + 3) % 7;
    const place = (id: string, lat: number, lng: number, extra: object) =>
      prisma.outlet.create({
        data: {
          id,
          tenantId: OTHER_TENANT,
          type: 'RESTAURANT',
          status: 'ACTIVE',
          name: `Kitchen ${id}`,
          slug: id,
          addressLine1: '1st Main',
          city: 'Bengaluru',
          state: 'Karnataka',
          stateCode: '29',
          pincode: '560034',
          lat,
          lng,
          geohash: encodeGeohash(lat, lng, 9),
          ...extra,
        },
      });
    // switch on, but its only opening hours are on another day of the week
    await place('after-hours', 12.9362, 77.6255, {
      isOpen: true,
      openingHours: [{ day: otherDay, open: '10:00', close: '11:00' }],
    });
    // inside opening hours (none set means always), but the merchant paused orders
    await place('paused-intake', 12.9342, 77.6235, { isOpen: false });

    const flags = (o: { id: string; isOpen: boolean; isOpenNow: boolean }) => [
      o.id,
      o.isOpen,
      o.isOpenNow,
    ];
    const nearby = await api()
      .get('/api/v1/outlets/nearby')
      .query({ lat: 12.9352, lng: 77.6245 })
      .expect(200);
    expect(nearby.body.data).toHaveLength(3);
    expect(flags(nearby.body.data[0])).toEqual(['outlet_1', true, true]); // open ranks first
    expect(nearby.body.data.map(flags)).toEqual(
      expect.arrayContaining([
        ['after-hours', true, false],
        ['paused-intake', false, false],
      ]),
    );
    for (const id of ['after-hours', 'paused-intake', 'test-kitchen']) {
      const detail = await api().get(`/api/v1/outlets/${id}`).expect(200);
      const card = nearby.body.data.find((o: { id: string }) => o.id === detail.body.id);
      expect([card.isOpen, card.isOpenNow]).toEqual([detail.body.isOpen, detail.body.isOpenNow]);
    }
    const openOnly = await api()
      .get('/api/v1/outlets/nearby')
      .query({ lat: 12.9352, lng: 77.6245, openNow: true })
      .expect(200);
    expect(openOnly.body.data.map((o: { id: string }) => o.id)).toEqual(['outlet_1']);

    const search = await api()
      .get('/api/v1/search')
      .query({ q: 'kitchen', lat: 12.9352, lng: 77.6245 })
      .expect(200);
    expect(search.body.outlets[0]).toMatchObject({ id: 'outlet_1', isOpen: true, isOpenNow: true });
    expect(search.body.outlets.find((o: { id: string }) => o.id === 'after-hours')).toMatchObject({
      isOpen: true,
      isOpenNow: false,
    });
  });

  // ─── merchant access (M2, M5) ──────────────────────────────────────────────
  it('lets any staff member list the outlets they work at, honouring outlet limits', async () => {
    await prisma.outlet.create({
      data: {
        id: 'outlet_3',
        tenantId: TENANT,
        type: 'RESTAURANT',
        status: 'ACTIVE',
        name: 'Test Kitchen Annexe',
        slug: 'test-kitchen-annexe',
        addressLine1: '100 Feet Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
        lat: 12.97,
        lng: 77.64,
        geohash: encodeGeohash(12.97, 77.64, 9),
      },
    });
    const ids = (body: { id: string }[]) => body.map((o) => o.id).sort();
    for (const role of ['PROCUREMENT_MANAGER', 'CHEF', 'STAFF', 'ACCOUNTANT'] as const) {
      const res = await api()
        .get('/api/v1/merchant/outlets')
        .set('Authorization', `Bearer ${staff(role)}`)
        .expect(200);
      expect(ids(res.body)).toEqual(['outlet_1', 'outlet_3']);
    }
    const scoped = await api()
      .get('/api/v1/merchant/outlets')
      .set('Authorization', `Bearer ${staff('PROCUREMENT_MANAGER', ['outlet_3'])}`)
      .expect(200);
    expect(ids(scoped.body)).toEqual(['outlet_3']);
    expect(scoped.body[0].costForTwo).toBe('300.00');
    // still a merchant route: a token without a business gets nothing
    await api()
      .get('/api/v1/merchant/outlets')
      .set('Authorization', `Bearer ${customer()}`)
      .expect(403);
  });

  it('shows the daily sales summary only to roles that can read reports, amounts as strings', async () => {
    const sold = await prisma.order.create({
      data: {
        orderNumber: 'POS-T-1',
        tenantId: TENANT,
        outletId: 'outlet_1',
        status: 'COMPLETED',
        channel: 'POS',
        type: 'TAKEAWAY',
        paymentMethod: 'UPI',
        paymentStatus: 'PAID',
        subtotal: 600,
        taxTotal: 30,
        total: 630,
        items: {
          create: {
            menuItemId: menu.paneer,
            name: 'Paneer Tikka',
            quantity: 2,
            unitPrice: 300,
            totalPrice: 600,
            gstRate: 5,
            taxAmount: 30,
          },
        },
      },
    });
    const summary = (token: string) =>
      api()
        .get('/api/v1/pos/summary')
        .query({ outletId: 'outlet_1', date: istDate(sold.createdAt) })
        .set('Authorization', `Bearer ${token}`);

    for (const role of ['CHEF', 'CASHIER', 'STAFF'] as const) {
      const res = await summary(staff(role)).expect(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
      expect(JSON.stringify(res.body.details)).toContain('reports:read');
    }
    for (const token of [merchant(), staff('ACCOUNTANT'), staff('PROCUREMENT_MANAGER')]) {
      const res = await summary(token).expect(200);
      expect(res.body).toMatchObject({
        orders: 1,
        grossSales: '630.00',
        taxCollected: '30.00',
        averageTicket: '630.00',
        byPaymentMethod: { UPI: '630.00' },
        byChannel: { POS: '630.00' },
        topItems: [{ name: 'Paneer Tikka', quantity: 2, sales: '600.00' }],
      });
      const hour = istParts(sold.createdAt).hour;
      expect(res.body.hourly[hour]).toEqual({ hour, orders: 1, sales: '630.00' });
      expect(res.body.hourly[(hour + 1) % 24].sales).toBe('0.00');
    }
  });
});
