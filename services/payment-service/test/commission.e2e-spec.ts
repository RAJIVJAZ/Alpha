import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import type { CommissionAccruedEvent } from '@foodgrid/types';
import { InternalHttpService } from '@foodgrid/utils/server';
import {
  createTestApp,
  FakeInternalHttp,
  issueTestToken,
  truncateSchemas,
} from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { PaymentEventHandlers } from '../src/events/payment-event.handlers';
import { SERVICE } from '../src/service.config';

const OVERRIDDEN = 'tnt_override_kitchen';
const STANDARD = 'tnt_standard_kitchen';
const admin = `Bearer ${issueTestToken({ sub: 'fin_1', roles: ['FINANCE'] })}`;
const ops = `Bearer ${issueTestToken({ sub: 'ops_1', roles: ['OPS'] })}`;

describe('payment-service commission (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) =>
      b.overrideProvider(InternalHttpService).useValue(http),
    );
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['payments', 'platform']);
    http.reset();
    http.on('GET', 'user', 'internal/tenants/:id', ({ params }) => ({
      id: params.id,
      name: params.id,
      legalName: null,
      gstin: null,
      stateCode: '29',
    }));
    http.on('POST', 'user', 'internal/tenants/batch', []);
    http.on('POST', 'user', 'internal/audit-logs', ({ body }) => body);
  });

  afterAll(async () => {
    await app.close();
  });

  /** order.delivered for a ₹1,000 prepaid app order (₹40 delivery, ₹5 platform fee). */
  const delivered = (orderId: string, tenantId: string, extra: object = {}) =>
    app.get(PaymentEventHandlers).accrue({
      id: `evt_${orderId}`,
      type: 'order.delivered',
      data: {
        orderId,
        orderNumber: `FG-${orderId}`,
        tenantId,
        outletId: `${tenantId}_outlet`,
        outletType: 'RESTAURANT',
        channel: 'APP',
        paymentMethod: 'UPI',
        customerName: 'Asha',
        subtotal: '1000.00',
        packagingCharge: '0.00',
        merchantDiscount: '0.00',
        discount: '0.00',
        deliveryFee: '40.00',
        platformFee: '5.00',
        taxTotal: '58.10',
        total: '1103.00',
        placedAt: new Date().toISOString(),
        ...extra,
      },
    } as never);

  const commissionEvent = async (orderId: string) => {
    const row = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: 'payment.commission.accrued', aggregateId: orderId },
    });
    return row.payload as unknown as CommissionAccruedEvent;
  };

  it('charges an overridden business its own rate on the order, its settlement and the commission invoice', async () => {
    await api()
      .post('/api/v1/admin/commission-rules')
      .set('Authorization', admin)
      .send({ name: 'Restaurants - standard', tenantType: 'RESTAURANT', ratePct: 18 })
      .expect(201);
    // what the Businesses screen saves as the override; operations staff may not set it
    const override = { name: 'Business override', tenantId: OVERRIDDEN, ratePct: 12 };
    await api()
      .post('/api/v1/admin/commission-rules')
      .set('Authorization', ops)
      .send(override)
      .expect(403);
    const created = await api()
      .post('/api/v1/admin/commission-rules')
      .set('Authorization', admin)
      .send({ ...override, ratePct: 14 })
      .expect(201);
    await api()
      .patch(`/api/v1/admin/commission-rules/${created.body.id}`)
      .set('Authorization', admin)
      .send({ ratePct: 12 })
      .expect(200);
    // who changed a business's commission is in the admin audit log (user-service)
    expect(http.callsTo('user', 'internal/audit-logs').map((c) => c.body)).toEqual([
      expect.objectContaining({ actorId: 'fin_1', action: 'commission_rule.create' }),
      {
        actorId: 'fin_1',
        tenantId: OVERRIDDEN,
        action: 'commission_rule.create',
        entityType: 'CommissionRule',
        changes: { ...override, ratePct: 14 },
      },
      {
        actorId: 'fin_1',
        tenantId: OVERRIDDEN,
        action: 'commission_rule.update',
        entityType: 'CommissionRule',
        entityId: created.body.id,
        changes: { ratePct: 12 },
      },
    ]);

    await delivered('ord_over', OVERRIDDEN);
    await delivered('ord_over', OVERRIDDEN); // redelivered: accrued and published once
    await delivered('ord_std', STANDARD);
    await delivered('ord_pos', OVERRIDDEN, { channel: 'POS', paymentMethod: 'CASH' });

    // the order (via order-service) and analytics receive what was charged
    expect(await commissionEvent('ord_over')).toEqual({
      orderId: 'ord_over',
      tenantId: OVERRIDDEN,
      outletId: `${OVERRIDDEN}_outlet`,
      commissionRate: '12.00',
      commissionAmount: '120.00',
    });
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'payment.commission.accrued', aggregateId: 'ord_over' },
      }),
    ).toBe(1);
    expect(await commissionEvent('ord_std')).toMatchObject({
      commissionRate: '18.00',
      commissionAmount: '180.00',
    });
    // counter sales are not settled and carry no commission
    expect(await commissionEvent('ord_pos')).toMatchObject({
      commissionRate: '0.00',
      commissionAmount: '0.00',
    });
    expect(await prisma.settlementLine.count({ where: { orderId: 'ord_pos' } })).toBe(0);

    const line = await prisma.settlementLine.findUniqueOrThrow({ where: { orderId: 'ord_over' } });
    expect(line).toMatchObject({ tenantId: OVERRIDDEN });
    expect(Number(line.commission)).toBe(120);
    expect(Number(line.commissionGst)).toBe(21.6);
    expect(Number(line.netAmount)).toBe(857.4); // 1000 - 120 - 21.60 GST - 1.00 TDS

    const ist = (days: number) =>
      new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
    await api()
      .post('/api/v1/admin/settlements/run')
      .set('Authorization', admin)
      .send({ periodStart: ist(0), periodEnd: ist(1) })
      .expect(201);
    const settlement = await prisma.settlement.findFirstOrThrow({
      where: { tenantId: OVERRIDDEN },
    });
    expect(Number(settlement.commission)).toBe(120);
    expect(Number(settlement.commissionGst)).toBe(21.6);
    expect(Number(settlement.netPayable)).toBe(857.4);
    const invoice = await prisma.gstInvoice.findFirstOrThrow({
      where: { type: 'COMMISSION', tenantId: OVERRIDDEN },
    });
    expect(Number(invoice.taxableValue)).toBe(120);
    expect(Number(invoice.total)).toBe(141.6);
  });
});
