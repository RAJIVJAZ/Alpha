import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import type { CommissionAccruedEvent } from '@foodgrid/types';
import { createTestApp, issueTestToken, truncateSchemas } from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { AnalyticsEventHandlers } from '../src/events/analytics-event.handlers';
import { SERVICE } from '../src/service.config';

const TENANT = 'tnt_override_kitchen';
const OUTLET = 'outlet_override';
const admin = `Bearer ${issueTestToken({ sub: 'adm', roles: ['ADMIN'] })}`;
const owner = `Bearer ${issueTestToken({
  sub: 'owner_1',
  roles: ['CUSTOMER'],
  tenantId: TENANT,
  tenantType: 'RESTAURANT',
  tenantRole: 'OWNER',
})}`;

describe('analytics-service revenue uses the commission payment-service charged (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let handlers: AnalyticsEventHandlers;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE);
    prisma = app.get(PrismaService);
    handlers = app.get(AnalyticsEventHandlers);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['analytics']);
  });

  afterAll(async () => {
    await truncateSchemas(prisma, ['analytics']);
    await app.close();
  });

  const placedAt = new Date().toISOString();
  /** A ₹1,000 prepaid app order (₹40 delivery, ₹5 platform fee) moving to `status`. */
  const orderEvent = (status: string, n: number) =>
    handlers.order({
      id: `evt_order_${n}`,
      type: `order.${status.toLowerCase()}`,
      data: {
        orderId: 'ord_over',
        orderNumber: 'FG-1',
        tenantId: TENANT,
        outletId: OUTLET,
        outletType: 'RESTAURANT',
        outletCity: 'Bengaluru',
        customerId: 'cust_1',
        channel: 'APP',
        type: 'DELIVERY',
        status,
        paymentMethod: 'UPI',
        subtotal: '1000.00',
        discount: '0.00',
        merchantDiscount: '0.00',
        packagingCharge: '0.00',
        deliveryFee: '40.00',
        platformFee: '5.00',
        taxTotal: '58.10',
        total: '1103.00',
        commissionRate: null,
        commissionAmount: null,
        items: [{ menuItemId: 'mi_1', name: 'Thali', quantity: 2 }],
        placedAt,
      },
    } as never);
  // the payload payment-service publishes for a business with a 12% override
  const charged: CommissionAccruedEvent = {
    orderId: 'ord_over',
    tenantId: TENANT,
    outletId: OUTLET,
    commissionRate: '12.00',
    commissionAmount: '120.00',
  };
  const commission = (data: CommissionAccruedEvent) =>
    handlers.commission({ id: 'evt_comm', type: 'payment.commission.accrued', data } as never);

  const ist = (days: number) =>
    new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
  const range = { from: ist(-1), to: ist(1) };

  it('counts the charged commission in platform revenue and merchant profitability, never a default', async () => {
    await orderEvent('PLACED', 1);
    await orderEvent('DELIVERED', 2);
    let fact = await prisma.orderFact.findUniqueOrThrow({ where: { orderId: 'ord_over' } });
    // nothing is assumed before the order settles
    expect(Number(fact.commission)).toBe(0);
    expect(Number(fact.platformRevenue)).toBe(45);

    await commission(charged);
    await orderEvent('DELIVERED', 3); // a late or redelivered status event keeps it
    fact = await prisma.orderFact.findUniqueOrThrow({ where: { orderId: 'ord_over' } });
    expect(Number(fact.commission)).toBe(120);
    expect(Number(fact.platformRevenue)).toBe(165);

    const overview = await api()
      .get('/api/v1/analytics/platform/overview')
      .query(range)
      .set('Authorization', admin)
      .expect(200);
    expect(overview.body.kpis).toMatchObject({ gmv: 1103, revenue: 165, orders: 1 });

    const profit = await api()
      .get('/api/v1/analytics/outlet/profitability')
      .query(range)
      .set('Authorization', owner)
      .expect(200);
    expect(profit.body.totals).toMatchObject({ netSales: 1000, commission: 120 });
    expect(profit.body.commissionPct).toBe(12);
  });

  it('retries a commission that arrives before the order is projected', async () => {
    await expect(commission({ ...charged, orderId: 'ord_unknown' })).rejects.toThrow(
      /No order fact/,
    );
  });
});
