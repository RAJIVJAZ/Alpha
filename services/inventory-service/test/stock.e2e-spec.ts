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
const OUTLET_2 = 'outlet_indira';
const owner = (tenantId = TENANT) =>
  issueTestToken({
    sub: `owner_${tenantId}`,
    roles: ['CUSTOMER'],
    tenantId,
    tenantType: 'RESTAURANT',
    tenantRole: 'OWNER',
    outletIds: [],
  });
const staff = (tenantRole: 'CHEF' | 'STAFF' | 'PROCUREMENT_MANAGER', outletIds: string[] = []) =>
  issueTestToken({
    sub: `${tenantRole.toLowerCase()}_${TENANT}`,
    roles: ['CUSTOMER'],
    tenantId: TENANT,
    tenantType: 'RESTAURANT',
    tenantRole,
    outletIds,
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
      tenantId: [OUTLET, OUTLET_2].includes(params.id) ? TENANT : 'tnt_rival',
      name: 'Outlet',
    }));
    http.on('GET', 'order', 'internal/outlets/:id/menu-prices', ({ params }) =>
      params.id === OUTLET
        ? [{ id: 'menu_dal', name: 'Dal Makhani', price: '250.00', isAvailable: true }]
        : [],
    );
    http.on('GET', 'order', 'internal/outlets/:id/item-sales', () => []);
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

  it('keeps batches in line with stock on hand after stock went negative', async () => {
    const remaining = async () =>
      (await prisma.stockBatch.findMany({ where: { ingredientId: 'ing_butter' } })).reduce(
        (s, b) => s + Number(b.remainingQty),
        0,
      );
    await receive([{ ingredientId: 'ing_butter', quantity: 0.5, unitCost: 480 }]).expect(201);
    await handlers.consumeForOrder(accepted('ord_3', [{ menuItemId: 'menu_pbm', quantity: 25 }])); // -0.5 kg
    await receive([{ ingredientId: 'ing_butter', quantity: 2, unitCost: 480 }]).expect(201);
    const ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: 'ing_butter' } });
    expect(Number(ing.currentStock)).toBeCloseTo(1.5, 3);
    expect(await remaining()).toBeCloseTo(1.5, 3);

    // rows that drifted before this fix are re-based by a stock count, even with no variance
    await prisma.stockBatch.updateMany({
      where: { ingredientId: 'ing_butter' },
      data: { remainingQty: 2 },
    });
    await api()
      .post('/api/v1/inventory/stock/adjust')
      .set('Authorization', `Bearer ${owner()}`)
      .send({ ingredientId: 'ing_butter', countedQuantity: 1.5, reason: 'Weekly count' })
      .expect(201)
      .expect(({ body }) => expect(body.variance).toBe(0));
    expect(await remaining()).toBeCloseTo(1.5, 3);
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

  it('books every partial goods receipt of a purchase order once', async () => {
    const receipt = (qty: string) =>
      envelope<PurchaseOrderReceivedEvent>(
        EventTypes.PurchaseOrderReceived,
        {
          purchaseOrderId: 'po_2',
          poNumber: 'PO-2',
          tenantId: TENANT,
          outletId: OUTLET,
          supplierTenantId: 'sup_cowberry',
          lines: [
            { ingredientId: 'ing_butter', receivedQty: qty, unitPrice: '470.00', unit: 'KG' },
          ],
        },
        'po_2',
      );
    const first = receipt('14');
    const second = receipt('6');
    await handlers.receivePurchaseOrder(first);
    await handlers.receivePurchaseOrder(second);
    await handlers.receivePurchaseOrder(second); // redelivered
    const ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: 'ing_butter' } });
    expect(Number(ing.currentStock)).toBe(20);
    expect(
      await prisma.stockMovement.count({
        where: { referenceType: 'PURCHASE_ORDER', referenceId: 'po_2' },
      }),
    ).toBe(2);
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

  it('sets up a new ingredient and recipe from scratch, costed before the first delivery', async () => {
    const auth = `Bearer ${owner()}`;
    const create = (body: object) =>
      api()
        .post('/api/v1/inventory/ingredients')
        .set('Authorization', auth)
        .send({ outletId: OUTLET, category: 'DAIRY', unit: 'L', ...body });

    const ghee = (
      await create({
        name: 'Desi Ghee',
        sku: 'GHEE',
        reorderLevel: 2,
        maxStock: 10,
        openingUnitCost: 600,
      }).expect(201)
    ).body;
    expect(ghee).toMatchObject({ currentStock: '0', avgUnitCost: '600', leadTimeDays: 2 });
    await create({ name: 'Ghee again', sku: 'GHEE' }).expect(409);
    const milk = (
      await create({ name: 'Milk', sku: 'MILK', openingStock: 5, openingUnitCost: 60 }).expect(201)
    ).body;
    expect(milk).toMatchObject({ currentStock: '5', avgUnitCost: '60' });
    expect(
      await prisma.stockMovement.count({ where: { ingredientId: milk.id, type: 'OPENING' } }),
    ).toBe(1);

    const patched = await api()
      .patch(`/api/v1/inventory/ingredients/${ghee.id}`)
      .set('Authorization', auth)
      .send({ reorderLevel: 3, maxStock: null, leadTimeDays: 4 })
      .expect(200);
    expect(patched.body).toMatchObject({ reorderLevel: '3', maxStock: null, leadTimeDays: 4 });
    // the unit is fixed: stock, batches and recipes are counted in it
    await api()
      .patch(`/api/v1/inventory/ingredients/${ghee.id}`)
      .set('Authorization', auth)
      .send({ unit: 'KG' })
      .expect(400);

    // 100 ml ghee (+10% wastage) and 200 ml milk make 2 portions
    await api()
      .put('/api/v1/inventory/recipes')
      .set('Authorization', auth)
      .send({
        outletId: OUTLET,
        menuItemId: 'menu_dal',
        name: 'Dal Makhani',
        yieldQty: 2,
        lines: [
          { ingredientId: ghee.id, quantity: 100, unit: 'ML', wastagePct: 10 },
          { ingredientId: milk.id, quantity: 200, unit: 'ML' },
        ],
      })
      .expect(200);
    const cost = await api()
      .get('/api/v1/inventory/recipes/menu_dal/cost')
      .set('Authorization', auth)
      .expect(200);
    expect(cost.body.perPortion).toBe(39); // (0.11 L x 600 + 0.2 L x 60) / 2

    await api().delete('/api/v1/inventory/recipes/menu_dal').set('Authorization', auth).expect(204);
    await api().get('/api/v1/inventory/recipes/menu_dal').set('Authorization', auth).expect(404);
  });

  it('confines outlet-limited staff to their own outlets', async () => {
    await prisma.ingredient.create({
      data: {
        id: 'ing_milk_2',
        tenantId: TENANT,
        outletId: OUTLET_2,
        name: 'Milk',
        sku: 'MILK',
        category: 'DAIRY',
        unit: 'L',
        reorderLevel: 1,
      },
    });
    const auth = `Bearer ${staff('PROCUREMENT_MANAGER', [OUTLET])}`;
    const list = await api()
      .get('/api/v1/inventory/ingredients')
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.data.map((i: { id: string }) => i.id)).toEqual(['ing_butter']);
    const summary = await api()
      .get('/api/v1/inventory/summary')
      .set('Authorization', auth)
      .expect(200);
    expect(summary.body.totalItems).toBe(1);
    const denied = (req: request.Test) =>
      req
        .set('Authorization', auth)
        .expect(403)
        .expect(({ body }) => expect(body.code).toBe('OUTLET_FORBIDDEN'));
    await denied(api().get(`/api/v1/inventory/ingredients?outletId=${OUTLET_2}`));
    await denied(api().get('/api/v1/inventory/ingredients/ing_milk_2'));
    await denied(
      api()
        .post('/api/v1/inventory/stock/adjust')
        .send({ ingredientId: 'ing_milk_2', countedQuantity: 0, reason: 'count' }),
    );
    await denied(
      api()
        .post('/api/v1/inventory/stock/receive')
        .send({
          outletId: OUTLET_2,
          lines: [{ ingredientId: 'ing_milk_2', quantity: 1, unitCost: 1 }],
        }),
    );
    // an ingredient of another outlet cannot be received under this one
    await api()
      .post('/api/v1/inventory/stock/receive')
      .set('Authorization', auth)
      .send({ outletId: OUTLET, lines: [{ ingredientId: 'ing_milk_2', quantity: 1, unitCost: 1 }] })
      .expect(400);
    const chef = `Bearer ${staff('CHEF', [OUTLET])}`;
    await api()
      .post('/api/v1/inventory/production-plans/generate')
      .set('Authorization', chef)
      .send({ outletId: OUTLET_2, date: '2026-10-12' })
      .expect(403);
    await api()
      .put('/api/v1/inventory/recipes')
      .set('Authorization', chef)
      .send({
        outletId: OUTLET_2,
        menuItemId: 'menu_dal',
        name: 'Dal',
        yieldQty: 1,
        lines: [{ ingredientId: 'ing_milk_2', quantity: 100, unit: 'ML' }],
      })
      .expect(403);
    expect(
      Number(
        (await prisma.ingredient.findUniqueOrThrow({ where: { id: 'ing_milk_2' } })).currentStock,
      ),
    ).toBe(0);
  });

  it("refuses another business's outlet for production plans and its dishes for recipes", async () => {
    const rival = `Bearer ${owner('tnt_rival')}`;
    // the rival's own plan for our outlet would read our sales and replace our plan
    await prisma.productionPlan.create({
      data: {
        tenantId: TENANT,
        outletId: OUTLET,
        planDate: new Date('2026-10-12'),
        createdBy: 'u1',
      },
    });
    await api()
      .post('/api/v1/inventory/production-plans/generate')
      .set('Authorization', rival)
      .send({ outletId: OUTLET, date: '2026-10-12' })
      .expect(404);
    expect(http.calls.some((c) => c.path.endsWith('/item-sales'))).toBe(false);
    expect(await prisma.productionPlan.count({ where: { tenantId: TENANT } })).toBe(1);

    // our dish on someone else's outlet: the rival cannot claim menu_dal for a recipe
    await prisma.ingredient.create({
      data: {
        id: 'ing_rival',
        tenantId: 'tnt_rival',
        outletId: 'outlet_rival',
        name: 'Ghee',
        sku: 'GHEE',
        category: 'DAIRY',
        unit: 'L',
        reorderLevel: 1,
      },
    });
    await api()
      .put('/api/v1/inventory/recipes')
      .set('Authorization', rival)
      .send({
        outletId: 'outlet_rival',
        menuItemId: 'menu_dal',
        name: 'Dal',
        yieldQty: 1,
        lines: [{ ingredientId: 'ing_rival', quantity: 100, unit: 'ML' }],
      })
      .expect(404);
    expect(await prisma.recipe.count({ where: { menuItemId: 'menu_dal' } })).toBe(0);
  });

  it('lets kitchen staff open the costing screen that holds the recipe editor', async () => {
    await api()
      .get(`/api/v1/inventory/costing?outletId=${OUTLET}`)
      .set('Authorization', `Bearer ${staff('CHEF')}`)
      .expect(200)
      .expect(({ body }) => expect(body.items[0]).toMatchObject({ menuItemId: 'menu_dal' }));
    await api()
      .get(`/api/v1/inventory/costing?outletId=${OUTLET}`)
      .set('Authorization', `Bearer ${staff('STAFF')}`)
      .expect(403);
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
