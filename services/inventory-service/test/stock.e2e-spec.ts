import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import {
  EventTypes,
  type EventEnvelope,
  type OrderStatusChangedEvent,
  type PurchaseOrderReceivedEvent,
  type StockConsumedEvent,
} from '@foodgrid/types';
import { InternalHttpService } from '@foodgrid/utils/server';
import {
  createTestApp,
  FakeInternalHttp,
  issueTestToken,
  truncateSchemas,
} from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { InventoryEventHandlers } from '../src/events/inventory-event.handlers';
import { SERVICE } from '../src/service.config';

const TENANT = 'tnt_spice';
const OUTLET = 'outlet_kora';
const owner = (tenantId = TENANT) =>
  issueTestToken({
    sub: `owner_${tenantId}`,
    roles: ['CUSTOMER'],
    tenantId,
    tenantType: 'RESTAURANT',
    tenantRole: 'OWNER',
    outletIds: [],
  });

const envelope = <T>(type: string, data: T, aggregateId: string): EventEnvelope<string, T> => ({
  id: `evt_${Math.random()}`,
  type,
  source: 'test',
  stream: 'order',
  occurredAt: new Date().toISOString(),
  tenantId: TENANT,
  aggregateType: 'X',
  aggregateId,
  version: 1,
  data,
});

const accepted = (orderId: string, items: { menuItemId: string; quantity: number }[]) =>
  envelope<OrderStatusChangedEvent>(
    EventTypes.OrderAccepted,
    {
      orderId,
      orderNumber: `ORD-${orderId}`,
      tenantId: TENANT,
      outletId: OUTLET,
      items: items.map((i) => ({
        ...i,
        name: 'Paneer Butter Masala',
        unitPrice: '319.00',
        totalPrice: '319.00',
      })),
    } as unknown as OrderStatusChangedEvent,
    orderId,
  );

describe('inventory-service stock ledger (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let handlers: InventoryEventHandlers;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) =>
      b.overrideProvider(InternalHttpService).useValue(http),
    );
    prisma = app.get(PrismaService);
    handlers = app.get(InventoryEventHandlers);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['inventory', 'platform']);
    http.reset();
    http.on('GET', 'order', 'internal/outlets/:id', ({ params }) => ({
      id: params.id,
      tenantId: params.id === OUTLET ? TENANT : 'tnt_rival',
      name: 'Outlet',
    }));
    await prisma.ingredient.create({
      data: {
        id: 'ing_butter',
        tenantId: TENANT,
        outletId: OUTLET,
        name: 'Unsalted Butter',
        sku: 'BUT',
        category: 'DAIRY',
        unit: 'KG',
        reorderLevel: 1,
        shelfLifeDays: 60,
      },
    });
    // Paneer Butter Masala uses 40 g butter (recipe in grams, stock in kg)
    await prisma.recipe.create({
      data: {
        tenantId: TENANT,
        outletId: OUTLET,
        menuItemId: 'menu_pbm',
        name: 'Paneer Butter Masala',
        lines: { create: { ingredientId: 'ing_butter', quantity: 40, unit: 'G' } },
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const receive = (lines: object[]) =>
    api()
      .post('/api/v1/inventory/stock/receive')
      .set('Authorization', `Bearer ${owner()}`)
      .send({ outletId: OUTLET, lines });

  it('receives stock at weighted-average cost and consumes first-expiring batches first', async () => {
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const later = new Date(Date.now() + 30 * 86_400_000).toISOString();
    // the later-expiring batch arrives first, at a higher price
    await receive([
      { ingredientId: 'ing_butter', quantity: 2, unitCost: 500, expiresAt: later },
    ]).expect(201);
    await receive([
      { ingredientId: 'ing_butter', quantity: 1, unitCost: 440, expiresAt: soon },
    ]).expect(201);
    let ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: 'ing_butter' } });
    expect(Number(ing.currentStock)).toBe(3);
    expect(Number(ing.avgUnitCost)).toBe(480); // (2 x 500 + 1 x 440) / 3

    // 30 portions x 40 g = 1.2 kg: 1 kg from the soon-expiring batch (₹440) + 0.2 kg from the next (₹500)
    await handlers.consumeForOrder(accepted('ord_1', [{ menuItemId: 'menu_pbm', quantity: 30 }]));
    ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: 'ing_butter' } });
    expect(Number(ing.currentStock)).toBeCloseTo(1.8, 3);
    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { referenceType: 'ORDER', referenceId: 'ord_1' },
    });
    expect(Number(movement.quantity)).toBeCloseTo(-1.2, 3);
    expect(Number(movement.totalCost)).toBe(540); // 440 + 0.2 x 500
    const batches = await prisma.stockBatch.findMany({
      where: { ingredientId: 'ing_butter' },
      orderBy: { expiresAt: 'asc' },
    });
    expect(batches.map((b) => Number(b.remainingQty))).toEqual([0, 1.8]);

    const consumed = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: EventTypes.StockConsumed, aggregateId: 'ord_1' },
    });
    expect((consumed.payload as unknown as StockConsumedEvent).lines).toEqual([
      { ingredientId: 'ing_butter', quantity: '1.2', cost: '540.00' },
    ]);
    const day = await prisma.consumptionDaily.findFirstOrThrow({
      where: { ingredientId: 'ing_butter' },
    });
    expect(Number(day.consumedQty)).toBeCloseTo(1.2, 3);

    // redelivery of the same event is a no-op
    await handlers.consumeForOrder(accepted('ord_1', [{ menuItemId: 'menu_pbm', quantity: 30 }]));
    expect(await prisma.stockMovement.count({ where: { referenceType: 'ORDER' } })).toBe(1);
  });

  it('never blocks an order on missing stock: the shortfall is costed at average and flagged low', async () => {
    await receive([{ ingredientId: 'ing_butter', quantity: 0.5, unitCost: 480 }]).expect(201);
    await handlers.consumeForOrder(accepted('ord_2', [{ menuItemId: 'menu_pbm', quantity: 25 }])); // needs 1 kg
    const ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: 'ing_butter' } });
    expect(Number(ing.currentStock)).toBeCloseTo(-0.5, 3);
    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { referenceId: 'ord_2' },
    });
    expect(Number(movement.totalCost)).toBe(480); // 0.5 kg from the batch + 0.5 kg at the ₹480 average
    expect(
      await prisma.outboxEvent.count({
        where: { type: EventTypes.StockLow, aggregateId: 'ing_butter' },
      }),
    ).toBe(1);
  });

  it('books purchase-order receipts from procurement exactly once', async () => {
    const grn = envelope<PurchaseOrderReceivedEvent>(
      EventTypes.PurchaseOrderReceived,
      {
        purchaseOrderId: 'po_1',
        poNumber: 'PO-1',
        tenantId: TENANT,
        outletId: OUTLET,
        supplierTenantId: 'sup_cowberry',
        lines: [{ ingredientId: 'ing_butter', receivedQty: '14', unitPrice: '470.00', unit: 'KG' }],
      },
      'po_1',
    );
    await handlers.receivePurchaseOrder(grn);
    await handlers.receivePurchaseOrder(grn);
    const ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: 'ing_butter' } });
    expect(Number(ing.currentStock)).toBe(14);
    expect(Number(ing.lastPurchasePrice)).toBe(470);
    const batch = await prisma.stockBatch.findFirstOrThrow({
      where: { ingredientId: 'ing_butter' },
    });
    expect(batch).toMatchObject({ purchaseOrderId: 'po_1', supplierTenantId: 'sup_cowberry' });
    expect(
      await prisma.stockMovement.count({
        where: { referenceType: 'PURCHASE_ORDER', referenceId: 'po_1' },
      }),
    ).toBe(1);
  });

  it('pages the ingredient list up to 500 rows per page', async () => {
    await prisma.ingredient.createMany({
      data: ['Atta', 'Besan', 'Cumin'].map((name) => ({
        tenantId: TENANT,
        outletId: OUTLET,
        name,
        sku: name.toUpperCase(),
        category: 'SPICES' as const,
        unit: 'KG' as const,
      })),
    });
    const list = (query: object) =>
      api()
        .get('/api/v1/inventory/ingredients')
        .query({ outletId: OUTLET, ...query })
        .set('Authorization', `Bearer ${owner()}`);

    const all = await list({ pageSize: 500 }).expect(200);
    expect(all.body.meta).toMatchObject({ page: 1, pageSize: 500, total: 4 });
    expect(all.body.data).toHaveLength(4);
    const second = await list({ page: 2, pageSize: 3 }).expect(200);
    expect(second.body.meta).toMatchObject({ page: 2, pageSize: 3, total: 4, totalPages: 2 });
    expect(second.body.data).toHaveLength(1);
    expect((await list({}).expect(200)).body.meta.pageSize).toBe(20);
    for (const pageSize of [501, 0, 2.5]) await list({ pageSize }).expect(400);
  });

  it("keeps each tenant's stock private", async () => {
    const rival = owner('tnt_rival');
    await api()
      .get('/api/v1/inventory/ingredients/ing_butter')
      .set('Authorization', `Bearer ${owner()}`)
      .expect(200);
    await api()
      .get('/api/v1/inventory/ingredients/ing_butter')
      .set('Authorization', `Bearer ${rival}`)
      .expect(404);
    const list = await api()
      .get('/api/v1/inventory/ingredients')
      .set('Authorization', `Bearer ${rival}`)
      .expect(200);
    expect(list.body.data).toHaveLength(0);
    // and cannot receive stock into another tenant's outlet or ingredient
    await api()
      .post('/api/v1/inventory/stock/receive')
      .set('Authorization', `Bearer ${rival}`)
      .send({ outletId: OUTLET, lines: [{ ingredientId: 'ing_butter', quantity: 1, unitCost: 1 }] })
      .expect(404);
    expect(
      Number(
        (await prisma.ingredient.findUniqueOrThrow({ where: { id: 'ing_butter' } })).currentStock,
      ),
    ).toBe(0);
  });
});
