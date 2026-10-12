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
  const orderEvent = (status: string, n: number, amounts: object = {}) =>
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
        ...amounts,
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
    expect(overview.body.kpis).toMatchObject({
      gmv: 1103,
      revenue: 165,
      orders: 1,
      activeCustomers: 1,
    });

    const profit = await api()
      .get('/api/v1/analytics/outlet/profitability')
      .query(range)
      .set('Authorization', owner)
      .expect(200);
    expect(profit.body.totals).toMatchObject({ netSales: 1000, commission: 120 });
    expect(profit.body.commissionPct).toBe(12);
  });

  it("reports a merchant's net sales the way settlement charges them", async () => {
    // a ₹100 platform-funded coupon is not the merchant's; ₹20 packaging is their sale
    const amounts = { discount: '100.00', merchantDiscount: '0.00', packagingCharge: '20.00' };
    await orderEvent('PLACED', 1, amounts);
    await orderEvent('DELIVERED', 2, amounts);
    await commission({ ...charged, commissionRate: '15.00', commissionAmount: '153.00' });
    const profit = await api()
      .get('/api/v1/analytics/outlet/profitability')
      .query(range)
      .set('Authorization', owner)
      .expect(200);
    // settlement's merchant gross: 1000 + 20 - 0 = 1020, and 15% of it is 153
    expect(profit.body.totals).toMatchObject({ netSales: 1020, commission: 153, grossProfit: 867 });
    expect(profit.body.commissionPct).toBe(15);
  });

  it('counts B2B GMV at the confirmed total and drops rejected or cancelled orders', async () => {
    const placedOn = new Date(Date.now() - 86_400_000).toISOString();
    const b2b = (type: string, n: number, data: object) =>
      (handlers as unknown as Record<string, (e: unknown) => Promise<void>>)[type]!({
        id: `evt_b2b_${n}`,
        type,
        occurredAt: new Date().toISOString(),
        data: { sellerTenantId: 'sup_1', buyerTenantId: TENANT, placedAt: placedOn, ...data },
      });
    await b2b('b2bPlaced', 1, { b2bOrderId: 'b1', total: '1000.00' });
    await b2b('b2bConfirmed', 2, { b2bOrderId: 'b1', total: '600.00', previousTotal: '1000.00' });
    await b2b('b2bPlaced', 3, { b2bOrderId: 'b2', total: '500.00' });
    await b2b('b2bRejected', 4, { b2bOrderId: 'b2', total: '500.00' });
    const supplier = await prisma.dailySupplierStats.findMany({ where: { tenantId: 'sup_1' } });
    expect(supplier.reduce((s, d) => s + Number(d.gmv), 0)).toBe(600);
    expect(supplier.reduce((s, d) => s + d.orders, 0)).toBe(2);
    const platform = await prisma.dailyPlatformStats.findMany();
    expect(platform.reduce((s, d) => s + Number(d.b2bGmv), 0)).toBe(600);
  });

  it('counts a delivery once when its handler is retried', async () => {
    const delivered = {
      id: 'evt_delivered_1',
      type: 'delivery.delivered',
      occurredAt: new Date().toISOString(),
      data: {
        riderId: 'rider_1',
        occurredAt: new Date().toISOString(),
        riderEarning: '42.00',
        tipAmount: '10.00',
        distanceKm: 3,
        deliveryMins: 28,
      },
    } as never;
    await handlers.delivered(delivered);
    await handlers.delivered(delivered); // replayed after a crash before it was recorded
    const [day] = await prisma.dailyRiderStats.findMany({ where: { riderId: 'rider_1' } });
    expect(day).toMatchObject({ deliveries: 1 });
    expect(Number(day!.earnings)).toBe(52);
  });

  it('retries a commission that arrives before the order is projected', async () => {
    await expect(commission({ ...charged, orderId: 'ord_unknown' })).rejects.toThrow(
      /No order fact/,
    );
  });

  it('retries a food cost that arrives before the order is projected', async () => {
    const consumed = (orderId: string) =>
      handlers.foodCost({
        id: `evt_sc_${orderId}`,
        type: 'inventory.stock.consumed',
        data: { tenantId: TENANT, outletId: OUTLET, orderId, lines: [], foodCost: '300.00' },
      } as never);
    await expect(consumed('ord_over')).rejects.toThrow(/No order fact/);
    await orderEvent('PLACED', 1);
    await orderEvent('DELIVERED', 2);
    await consumed('ord_over'); // the redelivery, once the order is projected
    const fact = await prisma.orderFact.findUniqueOrThrow({ where: { orderId: 'ord_over' } });
    expect(Number(fact.foodCost)).toBe(300);
  });

  it('never moves an order back to an earlier status when events arrive out of order', async () => {
    await orderEvent('PLACED', 1);
    await orderEvent('DELIVERED', 3);
    await orderEvent('READY', 2); // reclaimed late, or processed by the other replica
    expect(
      (await prisma.orderFact.findUniqueOrThrow({ where: { orderId: 'ord_over' } })).status,
    ).toBe('DELIVERED');
    const overview = await api()
      .get('/api/v1/analytics/platform/overview')
      .query(range)
      .set('Authorization', admin)
      .expect(200);
    expect(overview.body.kpis).toMatchObject({ orders: 1, gmv: 1103 });
  });
});
