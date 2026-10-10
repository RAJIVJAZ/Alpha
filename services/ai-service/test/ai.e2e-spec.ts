import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
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
import { SERVICE } from '../src/service.config';

const TENANT = 'tnt_test_kitchen';
const OTHER_TENANT = 'tnt_other_kitchen';
const OUTLET = 'outlet_1';

const admin = () => `Bearer ${issueTestToken({ sub: 'admin_1', roles: ['ADMIN'] })}`;
const customer = () => `Bearer ${issueTestToken({ sub: 'cust_1', roles: ['CUSTOMER'] })}`;
const owner = (tenantId = TENANT) =>
  `Bearer ${issueTestToken({
    sub: `owner_${tenantId}`,
    roles: ['CUSTOMER'],
    tenantId,
    tenantType: 'RESTAURANT',
    tenantRole: 'OWNER',
    outletIds: [],
  })}`;
const service = () => issueServiceToken('procurement-service');

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const day = (offset: number) => ymd(addDays(dateOnly(istDate()), offset));
/** Unix seconds of a time of day (IST) on the day `offset` days from today. */
const slotAt = (offset: number, hhmm: string) =>
  Date.parse(`${day(offset)}T${hhmm}:00+05:30`) / 1000;

/** 28 days of history ending yesterday, so the first forecast point is today. */
const flatHistory = (value = 10) =>
  Array.from({ length: 28 }, (_, i) => ({ date: day(i - 28), value }));

const lowRisk = {
  accountAgeDays: 400,
  ordersLast24h: 1,
  failedPaymentsLast24h: 0,
  cancelledLast30d: 0,
  completedOrders: 30,
  isFirstOrder: false,
  orderValue: 450,
  avgOrderValue: 420,
  isCod: false,
  couponUsed: false,
  firstOrderCoupon: false,
  accountsOnDevice: 1,
  addressDistanceFromUsualKm: 1,
  hourOfDay: 20,
};

describe('ai-service models and signals (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) =>
      b.overrideProvider(InternalHttpService).useValue(http),
    );
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['ai']);
    await redis.flushdb();
    http.reset();
  });

  afterEach(() => {
    process.env.OPENWEATHER_API_KEY = '';
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const forecast = (body: Record<string, unknown>) =>
    api()
      .post('/api/v1/internal/ai/forecast/demand')
      .set('x-service-token', service())
      .send(body)
      .expect(200);

  describe('weather-aware demand forecast', () => {
    const owm = {
      list: [
        // today: already past for the forecast, must not be stored
        { dt: Math.floor(Date.now() / 1000), main: { temp_max: 31 }, rain: { '3h': 25 } },
        // tomorrow: 12 mm over the day is heavy rain
        { dt: slotAt(1, '09:00'), main: { temp_max: 27 }, rain: { '3h': 4 } },
        { dt: slotAt(1, '12:00'), main: { temp_max: 29 }, rain: { '3h': 5 } },
        { dt: slotAt(1, '15:00'), main: { temp_max: 28 }, rain: { '3h': 3 } },
        // the day after: dry and 39 °C, a heatwave for drinks and dairy
        { dt: slotAt(2, '12:00'), main: { temp_max: 36 } },
        { dt: slotAt(2, '15:00'), main: { temp_max: 39 } },
      ],
    };

    function stubWeather() {
      process.env.OPENWEATHER_API_KEY = 'owm-test-key';
      http.on('GET', 'order', 'internal/outlets/cities', [
        { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
      ]);
      return jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => new Response(JSON.stringify(owm), { status: 200 }));
    }

    it('stores the coming days for every city with active outlets and the forecast applies them', async () => {
      const fetch = stubWeather();
      await prisma.externalSignal.createMany({
        data: [
          // an earlier run saw heavy rain the day after tomorrow; the new forecast is dry
          {
            type: 'WEATHER',
            name: 'Heavy rain',
            city: 'Bengaluru',
            date: dateOnly(day(2)),
            impact: 1.25,
          },
          // signals entered by hand are left alone
          {
            type: 'WEATHER',
            name: 'Cyclone warning',
            city: 'Bengaluru',
            date: dateOnly(day(2)),
            impact: 1.1,
          },
          { type: 'FESTIVAL', name: 'Ugadi', city: null, date: dateOnly(day(3)), impact: 1.5 },
        ],
      });

      const sync = await api()
        .post('/api/v1/admin/ai/signals/weather/sync')
        .set('Authorization', admin())
        .expect(200);
      expect(sync.body).toEqual({ synced: 2, cities: 1 });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(fetch.mock.calls[0]![0])).toContain('lat=12.9716&lon=77.5946');

      const rows = await prisma.externalSignal.findMany({
        where: { type: 'WEATHER' },
        orderBy: [{ date: 'asc' }, { name: 'asc' }],
      });
      expect(rows.map((r) => [ymd(r.date), r.name, r.impact])).toEqual([
        [day(1), 'Heavy rain', 1.25],
        [day(2), 'Cyclone warning', 1.1],
        [day(2), 'Heatwave', 1.3],
      ]);
      expect(rows[0]!.data).toEqual({ rainMm: 12, tempMax: 29 });

      // a second run replaces the same rows instead of adding to them
      await api()
        .post('/api/v1/admin/ai/signals/weather/sync')
        .set('Authorization', admin())
        .expect(200);
      expect(await prisma.externalSignal.count({ where: { type: 'WEATHER' } })).toBe(3);

      const dairy = await forecast({
        series: flatHistory(),
        horizonDays: 4,
        category: 'DAIRY',
        city: 'Bengaluru',
        currentStock: 21,
      });
      expect(dairy.body.model).toBe('HOLT_WINTERS');
      expect(dairy.body.points.map((p: { date: string }) => p.date)).toEqual([
        day(0),
        day(1),
        day(2),
        day(3),
      ]);
      const [today, rainy, hot, festival] = dairy.body.points;
      expect(today).toMatchObject({ multiplier: 1, signals: [] });
      expect(rainy).toMatchObject({ multiplier: 1.25, signals: ['Heavy rain'] });
      expect(hot).toMatchObject({ multiplier: 1.43 });
      expect([...hot.signals].sort()).toEqual(['Cyclone warning', 'Heatwave']);
      expect(festival).toMatchObject({ multiplier: 1.5, signals: ['Ugadi'] });
      expect(rainy.value).toBeCloseTo(rainy.baseline * 1.25, 1);
      // 21 units would last until the day after tomorrow at 10 a day; the rain uses them up tomorrow
      expect(dairy.body.depletion.depletionDate).toBe(day(1));

      // the heatwave only lifts drinks, dairy and fruit
      const grains = await forecast({
        series: flatHistory(),
        horizonDays: 3,
        category: 'GRAINS',
        city: 'Bengaluru',
      });
      expect(grains.body.points[2]).toMatchObject({
        multiplier: 1.1,
        signals: ['Cyclone warning'],
      });

      // another city's forecast sees no Bengaluru weather
      const mumbai = await forecast({ series: flatHistory(), horizonDays: 3, city: 'Mumbai' });
      expect(mumbai.body.points.map((p: { multiplier: number }) => p.multiplier)).toEqual([
        1, 1, 1,
      ]);
    });

    it('skips the sync without an API key and keeps going when one city fails', async () => {
      const skipped = await api()
        .post('/api/v1/admin/ai/signals/weather/sync')
        .set('Authorization', admin())
        .expect(200);
      expect(skipped.body).toEqual({
        synced: 0,
        cities: 0,
        skipped: 'OPENWEATHER_API_KEY not configured',
      });
      expect(http.calls).toHaveLength(0);

      const fetch = stubWeather();
      http.on('GET', 'order', 'internal/outlets/cities', [
        { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
        { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
      ]);
      fetch.mockImplementationOnce(async () => new Response('{"cod":401}', { status: 401 }));
      const res = await api()
        .post('/api/v1/admin/ai/signals/weather/sync')
        .set('Authorization', admin())
        .expect(200);
      expect(res.body).toEqual({ synced: 2, cities: 2 });
      const cities = await prisma.externalSignal.findMany({
        distinct: ['city'],
        select: { city: true },
      });
      expect(cities).toEqual([{ city: 'Bengaluru' }]);
    });

    it('lets only platform config admins manage signals', async () => {
      await api()
        .post('/api/v1/admin/ai/signals/weather/sync')
        .set('Authorization', owner())
        .expect(403);
      const created = await api()
        .post('/api/v1/admin/ai/signals')
        .set('Authorization', admin())
        .send({
          type: 'FESTIVAL',
          name: 'Diwali',
          date: day(5),
          impact: 1.6,
          categories: ['SUGAR'],
        })
        .expect(201);
      await api()
        .post('/api/v1/admin/ai/signals')
        .set('Authorization', admin())
        .send({ type: 'FESTIVAL', name: 'Diwali', date: day(5), impact: 9 })
        .expect(400);
      const list = await api()
        .get('/api/v1/admin/ai/signals')
        .query({ from: day(0), to: day(7) })
        .set('Authorization', admin())
        .expect(200);
      expect(list.body.map((s: { name: string }) => s.name)).toEqual(['Diwali']);
      await api()
        .delete(`/api/v1/admin/ai/signals/${created.body.id}`)
        .set('Authorization', admin())
        .expect(204);
      expect(await prisma.externalSignal.count()).toBe(0);
    });
  });

  it('ranks supplier offers by strategy and never recommends one without stock', async () => {
    const offer = (o: Record<string, unknown>) => ({
      productId: `prod_${o.supplierTenantId}`,
      productName: 'Paneer 1 kg',
      baseQtyPerPack: 1,
      moq: 1,
      stepQty: 1,
      gstRate: 5,
      deliveryCharge: 0,
      rating: 4.5,
      ratingCount: 120,
      onTimeRate: 0.95,
      fillRate: 0.98,
      stockQty: 500,
      ...o,
    });
    const offers = [
      offer({
        supplierTenantId: 'sup_cheap',
        supplierName: 'Cheap Dairy',
        unitPrice: 300,
        leadTimeHours: 48,
      }),
      offer({
        supplierTenantId: 'sup_fast',
        supplierName: 'Fast Dairy',
        unitPrice: 340,
        leadTimeHours: 6,
      }),
      // cheapest of all, but cannot fill 20 kg
      offer({
        supplierTenantId: 'sup_empty',
        supplierName: 'Empty Dairy',
        unitPrice: 250,
        leadTimeHours: 24,
        stockQty: 5,
      }),
    ];
    const rank = (strategy: string) =>
      api()
        .post('/api/v1/internal/ai/suppliers/rank')
        .set('x-service-token', service())
        .send({ offers, quantity: 20, strategy, tenantId: TENANT })
        .expect(200);

    const cheapest = await rank('LOWEST_COST');
    expect(cheapest.body.options[0]).toMatchObject({
      supplierTenantId: 'sup_cheap',
      packs: 20,
      subtotal: 6000,
      tax: 300,
      landedCost: 6300,
      feasible: true,
    });
    const empty = cheapest.body.options.find(
      (o: { supplierTenantId: string }) => o.supplierTenantId === 'sup_empty',
    );
    expect(empty.feasible).toBe(false);
    expect(cheapest.body.best.LOWEST_COST.supplierTenantId).toBe('sup_cheap');
    expect(cheapest.body.best.FASTEST.supplierTenantId).toBe('sup_fast');

    const fastest = await rank('FASTEST');
    expect(fastest.body.options[0].supplierTenantId).toBe('sup_fast');

    await api()
      .post('/api/v1/internal/ai/suppliers/rank')
      .set('x-service-token', service())
      .send({ offers, quantity: 20, strategy: 'CHEAPEST' })
      .expect(400);
    await api()
      .post('/api/v1/internal/ai/suppliers/rank')
      .send({ offers, quantity: 20, strategy: 'FASTEST' })
      .expect(401);
  });

  it('recommends outlets from order history, popularity for new customers, and items bought together', async () => {
    const candidates = [
      {
        outletId: 'o_punjabi',
        cuisines: ['North Indian'],
        rating: 4.2,
        ratingCount: 300,
        costForTwo: 500,
        distanceKm: 3,
        etaMins: 30,
        isPureVeg: false,
      },
      {
        outletId: 'o_wok',
        cuisines: ['Chinese'],
        rating: 4.4,
        ratingCount: 2000,
        costForTwo: 500,
        distanceKm: 2.5,
        etaMins: 28,
        isPureVeg: false,
      },
    ];
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    const history = [1, 4, 9].map((d) => ({
      outletId: 'o_dhaba',
      cuisines: ['North Indian'],
      total: 480,
      at: ago(d),
    }));

    const returning = await api()
      .post('/api/v1/internal/ai/recommendations/outlets')
      .set('x-service-token', service())
      .send({ userId: 'cust_1', history, candidates })
      .expect(200);
    expect(returning.body[0]).toMatchObject({
      outletId: 'o_punjabi',
      reasons: expect.arrayContaining(['Because you like North Indian']),
    });

    const newcomer = await api()
      .post('/api/v1/internal/ai/recommendations/outlets')
      .set('x-service-token', service())
      .send({ history: [], candidates })
      .expect(200);
    expect(newcomer.body[0]).toMatchObject({
      outletId: 'o_wok',
      reasons: expect.arrayContaining(['Popular near you']),
    });

    const items = await api()
      .post('/api/v1/internal/ai/recommendations/items')
      .set('x-service-token', service())
      .send({
        baskets: [
          ['naan', 'paneer'],
          ['naan', 'paneer', 'lassi'],
          ['naan', 'dal'],
          ['rice', 'dal'],
        ],
        seedItemIds: ['naan'],
        // cosine: paneer 2/√(3·2), lassi 1/√(3·1), dal 1/√(3·2)
        limit: 2,
      })
      .expect(200);
    expect(items.body.map((i: { itemId: string }) => i.itemId)).toEqual(['paneer', 'lassi']);
  });

  it('orders a batched route so every drop follows its pickup', async () => {
    const stops = [
      { id: 'drop_a', type: 'DROP', orderId: 'A', lat: 12.9784, lng: 77.6408 },
      { id: 'pick_b', type: 'PICKUP', orderId: 'B', lat: 12.9365, lng: 77.6263 },
      { id: 'drop_b', type: 'DROP', orderId: 'B', lat: 12.9121, lng: 77.6446 },
      { id: 'pick_a', type: 'PICKUP', orderId: 'A', lat: 12.9352, lng: 77.6245 },
    ];
    const res = await api()
      .post('/api/v1/internal/ai/routes/optimize')
      .set('x-service-token', issueServiceToken('delivery-service'))
      .send({ start: { lat: 12.934, lng: 77.62 }, stops })
      .expect(200);
    const seq = Object.fromEntries(
      res.body.stops.map((s: { id: string; sequence: number }) => [s.id, s.sequence]),
    );
    expect(Object.keys(seq).sort()).toEqual(['drop_a', 'drop_b', 'pick_a', 'pick_b']);
    expect(seq.drop_a).toBeGreaterThan(seq.pick_a);
    expect(seq.drop_b).toBeGreaterThan(seq.pick_b);
    expect(res.body.totalKm).toBeGreaterThan(0);
    expect(res.body.stops.at(-1).cumulativeKm).toBe(res.body.totalKm);
    expect(res.body.navigationUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/);

    const tooMany = Array.from({ length: 31 }, (_, i) => ({ ...stops[0], id: `s${i}` }));
    await api()
      .post('/api/v1/internal/ai/routes/optimize')
      .set('x-service-token', issueServiceToken('delivery-service'))
      .send({ start: { lat: 12.934, lng: 77.62 }, stops: tooMany })
      .expect(400);
  });

  it('scores outlets once per period and shows each business only its own scores', async () => {
    const strong = {
      avgRating: 4.6,
      ratingCount: 800,
      acceptanceRate: 0.99,
      avgPrepMins: 14,
      slaPrepMins: 15,
      cancellationRate: 0.01,
      complaintRate: 0.01,
      repeatRate: 0.45,
      onTimeRate: 0.97,
    };
    const weak = {
      ...strong,
      avgRating: 3.1,
      acceptanceRate: 0.7,
      avgPrepMins: 30,
      cancellationRate: 0.12,
      repeatRate: 0.05,
    };
    const score = (tenantId: string, outletId: string, metrics: object) =>
      api()
        .post('/api/v1/internal/ai/outlets/score')
        .set('x-service-token', issueServiceToken('analytics-service'))
        .send({ tenantId, outletId, periodStart: day(-7), periodEnd: day(-1), metrics })
        .expect(200);

    const first = await score(TENANT, OUTLET, weak);
    expect(first.body.grade).not.toBe('A');
    expect(first.body.recommendations.length).toBeGreaterThan(0);
    // re-scoring the same week replaces the row
    const again = await score(TENANT, OUTLET, strong);
    expect(again.body.grade).toBe('A');
    await score(OTHER_TENANT, 'outlet_other', weak);
    expect(await prisma.outletScore.count()).toBe(2);

    const mine = await api()
      .get('/api/v1/ai/outlet-scores')
      .set('Authorization', owner())
      .expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ outletId: OUTLET, grade: 'A', score: again.body.score });

    const board = await api()
      .get('/api/v1/admin/ai/outlet-scores')
      .set('Authorization', admin())
      .expect(200);
    expect(board.body.map((s: { outletId: string }) => s.outletId)).toEqual([
      OUTLET,
      'outlet_other',
    ]);
    await api().get('/api/v1/admin/ai/outlet-scores').set('Authorization', owner()).expect(403);
  });

  it('scores order risk, queues the doubtful ones for review and records the outcome', async () => {
    const score = (entityId: string, features: object) =>
      api()
        .post('/api/v1/internal/ai/fraud/score')
        .set('x-service-token', issueServiceToken('order-service'))
        .send({ entityType: 'ORDER', entityId, userId: `user_${entityId}`, features })
        .expect(200);

    const regular = await score('ord_ok', lowRisk);
    expect(regular.body).toMatchObject({ decision: 'ALLOW' });
    const doubtful = await score('ord_review', {
      ...lowRisk,
      accountAgeDays: 0,
      completedOrders: 0,
      isFirstOrder: true,
      isCod: true,
      orderValue: 2000,
      avgOrderValue: null,
      couponUsed: true,
      firstOrderCoupon: true,
      accountsOnDevice: 2,
    });
    expect(doubtful.body.decision).toBe('REVIEW');
    expect(doubtful.body.reasons).toContain('First-order coupon reuse');
    const farm = await score('ord_farm', { ...lowRisk, accountsOnDevice: 6 });
    expect(farm.body.decision).toBe('BLOCK');
    expect(await prisma.fraudAssessment.count()).toBe(3);

    const queue = await api()
      .get('/api/v1/admin/ai/fraud/assessments')
      .set('Authorization', admin())
      .expect(200);
    expect(queue.body.meta.total).toBe(1);
    expect(queue.body.data[0]).toMatchObject({ entityId: 'ord_review', decision: 'REVIEW' });

    await api()
      .get('/api/v1/admin/ai/fraud/assessments')
      .set('Authorization', customer())
      .expect(403);
    await api()
      .post(`/api/v1/admin/ai/fraud/assessments/${queue.body.data[0].id}/review`)
      .set('Authorization', admin())
      .send({ outcome: 'MAYBE' })
      .expect(400);
    const reviewed = await api()
      .post(`/api/v1/admin/ai/fraud/assessments/${queue.body.data[0].id}/review`)
      .set('Authorization', admin())
      .send({ outcome: 'FALSE_POSITIVE' })
      .expect(200);
    expect(reviewed.body).toMatchObject({ reviewOutcome: 'FALSE_POSITIVE', reviewedBy: 'admin_1' });

    const after = await api()
      .get('/api/v1/admin/ai/fraud/assessments')
      .set('Authorization', admin())
      .expect(200);
    expect(after.body.meta.total).toBe(0);
    const stats = await api()
      .get('/api/v1/admin/ai/fraud/stats')
      .set('Authorization', admin())
      .expect(200);
    expect(stats.body).toEqual({
      last30Days: { ALLOW: 1, REVIEW: 1, BLOCK: 1 },
      reviewOutcomes: { FALSE_POSITIVE: 1 },
    });
  });

  it('flags a rider GPS trail that jumps impossibly far and lets a clean one through', async () => {
    const t0 = Date.now() - 10 * 60_000;
    const ping = (minute: number, lat: number, lng: number) => ({
      lat,
      lng,
      at: new Date(t0 + minute * 60_000).toISOString(),
    });
    const trail = [ping(0, 12.9352, 77.6245), ping(1, 12.9395, 77.6262), ping(2, 12.944, 77.628)];
    const drop = { lat: 12.9445, lng: 77.6283 };
    const check = (deliveryId: string, pings: object[]) =>
      api()
        .post('/api/v1/internal/ai/fraud/rider-trajectory')
        .set('x-service-token', issueServiceToken('delivery-service'))
        .send({ riderId: 'rider_1', deliveryId, pings, drop })
        .expect(200);

    const clean = await check('del_clean', [...trail].reverse());
    expect(clean.body).toMatchObject({ decision: 'ALLOW', anomalies: [] });
    expect(clean.body.distanceKm).toBeGreaterThan(0.9);

    // a spoofed fix 25 km away for one minute, then back
    const spoofed = await check('del_spoofed', [
      trail[0],
      trail[1],
      ping(1.5, 13.16, 77.62),
      trail[2],
    ]);
    expect(spoofed.body.decision).toBe('REVIEW');
    expect(spoofed.body.anomalies).toHaveLength(2);
    expect(spoofed.body.reasons).toContain('2 impossible jump(s) in GPS trail');
    const stored = await prisma.fraudAssessment.findMany();
    expect(stored).toEqual([
      expect.objectContaining({ entityType: 'RIDER', entityId: 'del_spoofed', userId: 'rider_1' }),
    ]);
  });

  it('suggests menu prices for the merchant who owns the outlet and lets them act on it', async () => {
    http
      .on('GET', 'order', 'internal/outlets/:id', ({ params }) => ({
        id: params.id,
        tenantId: params.id === OUTLET ? TENANT : OTHER_TENANT,
      }))
      .on('GET', 'order', 'internal/outlets/:id/menu-prices', [
        { id: 'item_thali', name: 'Veg Thali', price: '200.00', isAvailable: true },
        { id: 'item_soup', name: 'Tomato Soup', price: '150.00', isAvailable: true },
        { id: 'item_off', name: 'Seasonal Special', price: '400.00', isAvailable: false },
      ])
      .on('GET', 'order', 'internal/outlets/:id/item-sales', [])
      .on('GET', 'inventory', 'internal/inventory/outlets/:id/plate-costs', [
        // 50% food cost: below the 60% margin floor, so the price goes up (within 10%)
        { menuItemId: 'item_thali', foodCost: 100 },
        { menuItemId: 'item_off', foodCost: 100 },
      ]);

    const res = await api()
      .post('/api/v1/ai/pricing/menu-suggestions')
      .query({ outletId: OUTLET })
      .set('Authorization', owner())
      .expect(201);
    // the soup has no plate cost and the special is unavailable: neither is priced
    expect(res.body.generated).toBe(1);
    expect(res.body.suggestions[0]).toMatchObject({
      id: 'item_thali',
      currentPrice: 200,
      suggestedPrice: 219,
    });

    await api()
      .post('/api/v1/ai/pricing/menu-suggestions')
      .query({ outletId: 'outlet_other' })
      .set('Authorization', owner())
      .expect(404);

    const list = await api()
      .get('/api/v1/ai/pricing/suggestions')
      .set('Authorization', owner())
      .expect(200);
    expect(list.body).toHaveLength(1);
    const theirs = await api()
      .get('/api/v1/ai/pricing/suggestions')
      .set('Authorization', owner(OTHER_TENANT))
      .expect(200);
    expect(theirs.body).toEqual([]);
    await api()
      .post(`/api/v1/ai/pricing/suggestions/${list.body[0].id}/apply`)
      .set('Authorization', owner(OTHER_TENANT))
      .expect(404);
    const applied = await api()
      .post(`/api/v1/ai/pricing/suggestions/${list.body[0].id}/apply`)
      .set('Authorization', owner())
      .expect(200);
    expect(applied.body.status).toBe('APPLIED');

    // every model call above is in the audit trail the admin dashboard reads
    const runs = await eventually(async () => {
      const r = await api()
        .get('/api/v1/admin/ai/model-runs')
        .set('Authorization', admin())
        .expect(200);
      return r.body.length ? r.body : undefined;
    });
    expect(runs).toEqual([
      { kind: 'DYNAMIC_PRICING', success: true, runs: 1, avgMs: expect.any(Number) },
    ]);
  });
});

/** Model runs are written after the response (fire and forget), so poll briefly. */
async function eventually<T>(fn: () => Promise<T | undefined>, timeoutMs = 3000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() > until) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 50));
  }
}
