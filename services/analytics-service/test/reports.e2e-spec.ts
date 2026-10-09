import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import { createTestApp, issueTestToken, truncateSchemas } from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { SERVICE } from '../src/service.config';

const TENANT = 'tnt_spice';
const KORA = 'outlet_kora';
const INDI = 'outlet_indi';
const member = (role: string, outletIds: string[] = []) =>
  issueTestToken({
    sub: `${role.toLowerCase()}_${outletIds.join('_')}`,
    roles: ['CUSTOMER'],
    tenantId: TENANT,
    tenantType: 'RESTAURANT',
    tenantRole: role as never,
    outletIds,
  });

describe('analytics-service merchant reports honour outlet scope (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const scoped = member('ACCOUNTANT', [KORA]);
  const owner = member('OWNER');

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['analytics']);
    const date = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    for (const [outletId, netSales] of [
      [KORA, 1000],
      [INDI, 5000],
    ] as const) {
      await prisma.dailyOutletStats.create({
        data: { date, tenantId: TENANT, outletId, orders: 1, gmv: netSales, netSales },
      });
      await prisma.orderFact.create({
        data: {
          orderId: `ord_${outletId}`,
          orderNumber: `FG-${outletId}`,
          date,
          hour: 13,
          tenantId: TENANT,
          outletId,
          outletType: 'RESTAURANT',
          channel: 'APP',
          orderType: 'DELIVERY',
          status: 'DELIVERED',
          itemsCount: 1,
          gmv: netSales,
          subtotal: netSales,
          discount: 0,
          deliveryFee: 0,
          tax: 0,
          placedAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    await truncateSchemas(prisma, ['analytics']);
    await app.close();
  });

  it('refuses another outlet of the same tenant to outlet-scoped staff', async () => {
    for (const path of ['outlet/sales', 'outlet/profitability']) {
      const res = await api().get(`/api/v1/analytics/${path}?outletId=${INDI}`).set(as(scoped));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('OUTLET_FORBIDDEN');
    }
  });

  it('limits unfiltered reports to the outlets the member is scoped to', async () => {
    const sales = await api().get('/api/v1/analytics/outlet/sales').set(as(scoped)).expect(200);
    expect(sales.body.kpis).toMatchObject({ orders: 1, gmv: 1000 });
    expect(sales.body.byChannel).toEqual([{ channel: 'APP', orders: 1, gmv: 1000 }]);
    expect(sales.body.heatmap.reduce((s: number, h: { orders: number }) => s + h.orders, 0)).toBe(
      1,
    );

    const profit = await api()
      .get('/api/v1/analytics/outlet/profitability')
      .set(as(scoped))
      .expect(200);
    expect(profit.body.totals.netSales).toBe(1000);
    expect(profit.body.byOutlet.map((o: { outletId: string }) => o.outletId)).toEqual([KORA]);

    await api().get(`/api/v1/analytics/outlet/sales?outletId=${KORA}`).set(as(scoped)).expect(200);
  });

  it('still shows every outlet to unscoped members', async () => {
    const profit = await api()
      .get('/api/v1/analytics/outlet/profitability')
      .set(as(owner))
      .expect(200);
    expect(profit.body.totals.netSales).toBe(6000);
    expect(profit.body.byOutlet.map((o: { outletId: string }) => o.outletId)).toEqual([INDI, KORA]);
    const sales = await api()
      .get(`/api/v1/analytics/outlet/sales?outletId=${INDI}`)
      .set(as(owner))
      .expect(200);
    expect(sales.body.kpis.gmv).toBe(5000);
  });
});
