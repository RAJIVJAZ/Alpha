import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import {
  EventTypes,
  type EventEnvelope,
  type EventStream,
  type OrderStatusChangedEvent,
  type StockLowEvent,
} from '@foodgrid/types';
import { InternalHttpService, REDIS } from '@foodgrid/utils/server';
import {
  createTestApp,
  FakeInternalHttp,
  issueServiceToken,
  issueTestToken,
  truncateSchemas,
} from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { NotificationEventHandlers } from '../src/events/notification-event.handlers';
import { NotificationJobsService } from '../src/jobs/notification-jobs.service';
import {
  PUSH_PROVIDER,
  type PushProvider,
  SMS_PROVIDER,
  type SmsProvider,
} from '../src/providers/providers';
import { SERVICE } from '../src/service.config';

const TENANT = 'tnt_spice';

const user = (sub: string, roles: ('CUSTOMER' | 'RIDER' | 'ADMIN')[] = ['CUSTOMER']) =>
  `Bearer ${issueTestToken({ sub, roles })}`;
const admin = () => user('admin_1', ['ADMIN']);

const order = (o: Partial<OrderStatusChangedEvent> = {}) =>
  ({
    orderId: 'ord_1',
    orderNumber: 'FG-1001',
    tenantId: TENANT,
    outletId: 'outlet_1',
    outletName: 'Spice Route',
    customerId: 'cust_1',
    channel: 'APP',
    type: 'DELIVERY',
    total: '640.00',
    items: [
      {
        menuItemId: 'm1',
        name: 'Paneer Tikka',
        quantity: 2,
        unitPrice: '250.00',
        totalPrice: '500.00',
      },
      { menuItemId: 'm2', name: 'Lassi', quantity: 1, unitPrice: '140.00', totalPrice: '140.00' },
    ],
    previousStatus: null,
    ...o,
  }) as OrderStatusChangedEvent;

const envelope = <T>(
  type: string,
  data: T,
  stream: EventStream = 'order',
): EventEnvelope<string, T> => ({
  id: `evt_${Math.random()}`,
  type,
  source: 'test',
  stream,
  occurredAt: new Date().toISOString(),
  tenantId: TENANT,
  aggregateType: 'Order',
  aggregateId: 'ord_1',
  version: 1,
  data,
});

describe('notification-service inbox, devices, templates and campaigns (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let handlers: NotificationEventHandlers;
  let push: jest.SpiedFunction<PushProvider['send']>;
  let sms: jest.SpiedFunction<SmsProvider['send']>;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) =>
      b.overrideProvider(InternalHttpService).useValue(http),
    );
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
    handlers = app.get(NotificationEventHandlers);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['notifications']);
    await redis.flushdb();
    http.reset();
    // the real log-only providers, spied on so the suite can read what was sent
    push = jest.spyOn(app.get<PushProvider>(PUSH_PROVIDER), 'send');
    sms = jest.spyOn(app.get<SmsProvider>(SMS_PROVIDER), 'send');
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await app.close();
  });

  const registerDevice = (
    userId: string,
    token: string,
    app: string,
    roles?: ('CUSTOMER' | 'RIDER')[],
  ) =>
    api()
      .post('/api/v1/devices')
      .set('Authorization', user(userId, roles))
      .send({ token, platform: 'ANDROID', app })
      .expect(201);

  const inbox = (userId: string) =>
    api().get('/api/v1/notifications').set('Authorization', user(userId)).expect(200);

  it('registers device tokens per user and moves a reused token to its new owner', async () => {
    await api()
      .post('/api/v1/devices')
      .send({ token: 't', platform: 'ANDROID', app: 'CUSTOMER' })
      .expect(401);
    await api()
      .post('/api/v1/devices')
      .set('Authorization', user('cust_1'))
      .send({ token: 'fcm-phone-1', platform: 'SYMBIAN', app: 'CUSTOMER' })
      .expect(400);
    await api()
      .post('/api/v1/devices')
      .set('Authorization', user('cust_1'))
      .send({ token: 'fcm-phone-1', platform: 'ANDROID', app: 'CUSTOMER', userId: 'cust_2' })
      .expect(400);

    const first = await registerDevice('cust_1', 'fcm-phone-1', 'CUSTOMER');
    expect(first.body).toMatchObject({ userId: 'cust_1', app: 'CUSTOMER', isActive: true });
    // the phone changes hands (or accounts): the token follows the latest sign-in
    await registerDevice('cust_2', 'fcm-phone-1', 'CUSTOMER');
    expect(await prisma.deviceToken.count()).toBe(1);

    // the previous owner cannot switch it off any more; the current one can
    await api()
      .delete('/api/v1/devices/fcm-phone-1')
      .set('Authorization', user('cust_1'))
      .expect(204);
    expect(
      await prisma.deviceToken.findUniqueOrThrow({ where: { token: 'fcm-phone-1' } }),
    ).toMatchObject({
      userId: 'cust_2',
      isActive: true,
    });
    await api()
      .delete('/api/v1/devices/fcm-phone-1')
      .set('Authorization', user('cust_2'))
      .expect(204);
    expect(
      await prisma.deviceToken.findUniqueOrThrow({ where: { token: 'fcm-phone-1' } }),
    ).toMatchObject({
      isActive: false,
    });
  });

  it('turns order events into merchant pushes and an inbox only its owner can read', async () => {
    http.on('GET', 'user', 'internal/tenants/:id/members', [
      { userId: 'owner_1', role: 'OWNER' },
      { userId: 'cashier_1', role: 'CASHIER' },
    ]);
    await registerDevice('owner_1', 'owner-phone', 'MERCHANT');
    await registerDevice('cust_1', 'cust-phone', 'CUSTOMER');
    // a rider-app token of the same user must not get customer pushes
    await registerDevice('cust_1', 'cust-rider-app', 'RIDER', ['RIDER']);

    await handlers.placed(envelope(EventTypes.OrderPlaced, order()));
    const members = http.callsTo('user', `internal/tenants/${TENANT}/members`);
    expect(members[0]!.opts.query).toEqual({ roles: 'OWNER,MANAGER,CASHIER' });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('owner-phone', {
      title: 'New order #FG-1001',
      body: '3 item(s) · ₹640.00 · accept within 5 minutes',
      data: {
        orderId: 'ord_1',
        orderNumber: 'FG-1001',
        itemsCount: '3',
        total: '640.00',
        channel: 'orders',
      },
    });

    await handlers.accepted(envelope(EventTypes.OrderAccepted, order()));
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenLastCalledWith(
      'cust-phone',
      expect.objectContaining({
        title: 'Order confirmed ✅',
        body: 'Spice Route is preparing your food.',
        data: expect.objectContaining({ deepLink: 'foodgrid://orders/ord_1' }),
      }),
    );
    // counter orders are accepted in front of the customer: no push
    await handlers.accepted(envelope(EventTypes.OrderAccepted, order({ channel: 'POS' })));
    expect(push).toHaveBeenCalledTimes(2);

    const sent = await prisma.notification.findMany({
      where: { channel: 'PUSH' },
      orderBy: { createdAt: 'asc' },
    });
    expect(sent.map((n) => [n.userId, n.recipient, n.status, n.provider])).toEqual([
      ['owner_1', 'owner-phone', 'SENT', 'console'],
      ['cust_1', 'cust-phone', 'SENT', 'console'],
    ]);

    const list = await inbox('cust_1');
    expect(list.body.unread).toBe(2);
    expect(list.body.data.map((n: { title: string }) => n.title)).toEqual([
      'Order confirmed ✅',
      'Order placed',
    ]);
    expect((await inbox('cashier_1')).body.data.map((n: { title: string }) => n.title)).toEqual([
      'New order #FG-1001',
    ]);

    const [latest] = list.body.data;
    const foreign = await api()
      .post(`/api/v1/notifications/${latest.id}/read`)
      .set('Authorization', user('cust_2'))
      .expect(200);
    expect(foreign.body).toEqual({ count: 0 });
    const own = await api()
      .post(`/api/v1/notifications/${latest.id}/read`)
      .set('Authorization', user('cust_1'))
      .expect(200);
    expect(own.body).toEqual({ count: 1 });
    expect((await inbox('cust_1')).body.unread).toBe(1);
    await api()
      .post('/api/v1/notifications/read-all')
      .set('Authorization', user('cust_1'))
      .expect(200);
    const after = await inbox('cust_1');
    expect(after.body.unread).toBe(0);
    expect(after.body.data.every((n: { status: string }) => n.status === 'READ')).toBe(true);
    expect((await inbox('cashier_1')).body.unread).toBe(1);
  });

  it('alerts the kitchen roles of a business when stock runs low', async () => {
    http.on('GET', 'user', 'internal/tenants/:id/members', [{ userId: 'chef_1', role: 'CHEF' }]);
    await registerDevice('chef_1', 'chef-tablet', 'MERCHANT');
    await handlers.stockLow(
      envelope<StockLowEvent>(
        EventTypes.StockLow,
        {
          tenantId: TENANT,
          outletId: 'outlet_1',
          ingredientId: 'ing_paneer',
          ingredientName: 'Paneer',
          category: 'DAIRY',
          unit: 'kg',
          currentStock: '1.250',
          reorderLevel: '5.000',
          reorderQty: '10.000',
          marketplaceCategory: 'DAIRY',
        },
        'inventory',
      ),
    );
    expect(http.calls[0]!.opts.query).toEqual({ roles: 'OWNER,MANAGER,PROCUREMENT_MANAGER,CHEF' });
    expect(push).toHaveBeenCalledWith(
      'chef-tablet',
      expect.objectContaining({
        data: expect.objectContaining({ ingredient: 'Paneer', stock: '1.3', unit: 'kg' }),
      }),
    );
  });

  it('uses an admin template override until it is switched off', async () => {
    await registerDevice('cust_1', 'cust-phone', 'CUSTOMER');
    const override = {
      key: 'order.accepted',
      channel: 'PUSH',
      title: 'Cooking now',
      body: '{{outletName}} has started on #{{orderNumber}}',
    };
    await api()
      .put('/api/v1/admin/notification-templates')
      .set('Authorization', user('cust_1'))
      .send(override)
      .expect(403);
    await api()
      .put('/api/v1/admin/notification-templates')
      .set('Authorization', admin())
      .send({ ...override, channel: 'PIGEON' })
      .expect(400);
    await api()
      .put('/api/v1/admin/notification-templates')
      .set('Authorization', admin())
      .send(override)
      .expect(200);
    const list = await api()
      .get('/api/v1/admin/notification-templates')
      .set('Authorization', admin())
      .expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ key: 'order.accepted', locale: 'en', isActive: true }),
    ]);

    await handlers.accepted(envelope(EventTypes.OrderAccepted, order()));
    expect(push).toHaveBeenLastCalledWith(
      'cust-phone',
      expect.objectContaining({
        title: 'Cooking now',
        body: 'Spice Route has started on #FG-1001',
      }),
    );

    await api()
      .put('/api/v1/admin/notification-templates')
      .set('Authorization', admin())
      .send({ ...override, isActive: false })
      .expect(200);
    await handlers.accepted(envelope(EventTypes.OrderAccepted, order()));
    expect(push).toHaveBeenLastCalledWith(
      'cust-phone',
      expect.objectContaining({
        title: 'Order confirmed ✅',
        body: 'Spice Route is preparing your food.',
      }),
    );
  });

  it('sends a push campaign to the app audience, skipping opted-out users and dead tokens', async () => {
    await registerDevice('cust_1', 'c1', 'CUSTOMER');
    await registerDevice('cust_2', 'c2-uninstalled', 'CUSTOMER');
    await registerDevice('cust_3', 'c3', 'CUSTOMER');
    await registerDevice('rider_1', 'r1', 'RIDER', ['RIDER']);
    await api()
      .put('/api/v1/notifications/preferences')
      .set('Authorization', user('cust_3'))
      .send({ marketingEnabled: false })
      .expect(200);
    push.mockImplementation(async (token) =>
      token === 'c2-uninstalled'
        ? { ok: false, error: 'Requested entity was not found.', invalidToken: true }
        : { ok: true, providerMessageId: `msg-${token}` },
    );

    await api()
      .post('/api/v1/admin/push-campaigns')
      .set('Authorization', user('cust_1'))
      .send({ title: 'x', body: 'y', app: 'CUSTOMER' })
      .expect(403);
    await api()
      .post('/api/v1/admin/push-campaigns')
      .set('Authorization', admin())
      .send({ title: 'Weekend feast', body: 'Flat 40% off', app: 'TOASTER' })
      .expect(400);
    const created = await api()
      .post('/api/v1/admin/push-campaigns')
      .set('Authorization', admin())
      .send({
        title: 'Weekend feast',
        body: 'Flat 40% off tonight',
        app: 'CUSTOMER',
        deepLink: 'foodgrid://offers',
      })
      .expect(201);
    expect(created.body).toMatchObject({ status: 'DRAFT', createdBy: 'admin_1' });

    const sent = await api()
      .post(`/api/v1/admin/push-campaigns/${created.body.id}/send`)
      .set('Authorization', admin())
      .expect(200);
    expect(sent.body).toMatchObject({
      status: 'SENT',
      targetCount: 3,
      sentCount: 1,
      failedCount: 2,
    });
    expect(push.mock.calls.map(([token]) => token).sort()).toEqual(['c1', 'c2-uninstalled']);
    expect(push).toHaveBeenCalledWith('c1', {
      title: 'Weekend feast',
      body: 'Flat 40% off tonight',
      data: { deepLink: 'foodgrid://offers', campaignId: created.body.id, channel: 'marketing' },
    });
    // the uninstalled app's token is switched off so the next campaign skips it
    expect(
      await prisma.deviceToken.findUniqueOrThrow({ where: { token: 'c2-uninstalled' } }),
    ).toMatchObject({
      isActive: false,
    });
    const rows = await prisma.notification.findMany({
      where: { campaignId: created.body.id, channel: 'PUSH' },
    });
    expect(rows.map((n) => [n.userId, n.status]).sort()).toEqual([
      ['cust_1', 'SENT'],
      ['cust_2', 'FAILED'],
      ['cust_3', 'SKIPPED'],
    ]);

    await api()
      .post(`/api/v1/admin/push-campaigns/${created.body.id}/send`)
      .set('Authorization', admin())
      .expect(409);
    await api()
      .post(`/api/v1/admin/push-campaigns/${created.body.id}/cancel`)
      .set('Authorization', admin())
      .expect(409);
  });

  it('sends scheduled campaigns from the minute job and leaves future ones alone', async () => {
    await registerDevice('rider_1', 'r1', 'RIDER', ['RIDER']);
    const create = (title: string, scheduledAt: Date) =>
      api()
        .post('/api/v1/admin/push-campaigns')
        .set('Authorization', admin())
        .send({
          title,
          body: 'Peak-hour bonus is live',
          app: 'RIDER',
          scheduledAt: scheduledAt.toISOString(),
        })
        .expect(201);
    const due = await create('Rain bonus', new Date(Date.now() - 60_000));
    const later = await create('Weekend bonus', new Date(Date.now() + 86_400_000));
    expect(due.body.status).toBe('SCHEDULED');

    await app.get(NotificationJobsService).scheduled();

    const campaigns = await api()
      .get('/api/v1/admin/push-campaigns')
      .set('Authorization', admin())
      .expect(200);
    const status = Object.fromEntries(
      campaigns.body.map((c: { id: string; status: string }) => [c.id, c.status]),
    );
    expect(status).toEqual({ [due.body.id]: 'SENT', [later.body.id]: 'SCHEDULED' });
    expect(push).toHaveBeenCalledWith('r1', expect.objectContaining({ title: 'Rain bonus' }));

    await api()
      .post(`/api/v1/admin/push-campaigns/${later.body.id}/cancel`)
      .set('Authorization', admin())
      .expect(200);
    await app.get(NotificationJobsService).scheduled();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('sends login codes by SMS for other services only', async () => {
    const otp = {
      phone: '+919800000001',
      templateKey: 'auth.otp',
      data: { code: '482913', minutes: 5 },
    };
    await api().post('/api/v1/internal/notifications/sms').send(otp).expect(401);
    const res = await api()
      .post('/api/v1/internal/notifications/sms')
      .set('x-service-token', issueServiceToken('auth-service'))
      .send(otp)
      .expect(200);
    expect(res.body).toEqual({ status: 'SENT' });
    expect(sms).toHaveBeenCalledWith(
      '+919800000001',
      '482913 is your FoodGrid login code. It expires in 5 minutes. Do not share it with anyone.',
    );
    // a template with no SMS copy sends nothing
    const none = await api()
      .post('/api/v1/internal/notifications/sms')
      .set('x-service-token', issueServiceToken('auth-service'))
      .send({ ...otp, templateKey: 'order.accepted' })
      .expect(200);
    expect(none.body).toEqual({ status: 'SKIPPED' });
    expect(sms).toHaveBeenCalledTimes(1);
  });
});
