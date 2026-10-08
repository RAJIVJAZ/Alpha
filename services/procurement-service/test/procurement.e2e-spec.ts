import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import {
  EventTypes,
  type B2bOrderEvent,
  type EventEnvelope,
  type PurchaseOrderReceivedEvent,
} from '@foodgrid/types';
import { InternalHttpService, REDIS } from '@foodgrid/utils/server';
import {
  createTestApp,
  FakeInternalHttp,
  issueTestToken,
  truncateSchemas,
} from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import type { Offer, StockStatus } from '../src/clients/clients.service';
import { ProcurementEventHandlers } from '../src/events/procurement-event.handlers';
import { SERVICE } from '../src/service.config';

const TENANT = 'tnt_spice';
const OUTLET = 'outlet_kora';
const member = (role: string, tenantId = TENANT, outletIds: string[] = []) =>
  issueTestToken({
    sub: `${role.toLowerCase()}_${tenantId}`,
    roles: ['CUSTOMER'],
    tenantId,
    tenantType: 'RESTAURANT',
    tenantRole: role as never,
    outletIds,
  });

const ingredient = (over: Partial<StockStatus>): StockStatus => ({
  id: 'ing',
  tenantId: TENANT,
  outletId: OUTLET,
  name: 'Ingredient',
  sku: 'ING',
  category: 'DAIRY',
  unit: 'KG',
  marketplaceCategory: 'DAIRY',
  preferredSupplierId: null,
  currentStock: 0,
  reorderLevel: 0,
  reorderQty: 0,
  safetyStock: 0,
  maxStock: null,
  leadTimeDays: 1,
  avgUnitCost: 0,
  shelfLifeDays: null,
  avgDailyUsage: 0,
  stdDailyUsage: 0,
  ...over,
});
const BUTTER = ingredient({
  id: 'ing_butter',
  name: 'Unsalted Butter',
  sku: 'BUT',
  currentStock: 1,
  reorderLevel: 4,
  reorderQty: 10,
  safetyStock: 1,
  maxStock: 14,
  avgDailyUsage: 2,
  stdDailyUsage: 0.4,
  avgUnitCost: 470,
});
const SUGAR = ingredient({
  id: 'ing_sugar',
  name: 'Sugar',
  sku: 'SUG',
  category: 'SUGAR',
  marketplaceCategory: 'SUGAR',
  currentStock: 60,
  reorderLevel: 8,
  reorderQty: 25,
  maxStock: 80,
  avgDailyUsage: 1.5,
  stdDailyUsage: 0.2,
  avgUnitCost: 44,
});

const offer = (o: Partial<Offer>): Offer => ({
  productId: 'p',
  supplierTenantId: 's',
  supplierName: 'S',
  productName: 'P',
  brand: null,
  sku: 'SKU',
  unitPrice: 0,
  baseQtyPerPack: 1,
  moq: 1,
  stepQty: 1,
  gstRate: 5,
  deliveryCharge: 0,
  freeDeliveryAbove: null,
  leadTimeHours: 24,
  rating: 4.5,
  ratingCount: 10,
  onTimeRate: 0.95,
  fillRate: 0.98,
  stockQty: 1000,
  ...o,
});
const BUTTER_OFFERS = [
  offer({
    productId: 'prod_cow_butter',
    supplierTenantId: 'sup_cowberry',
    supplierName: 'Cowberry Dairy',
    productName: 'Unsalted Butter 500 g',
    sku: 'COW-BUT',
    unitPrice: 235,
    baseQtyPerPack: 0.5,
    deliveryCharge: 60,
    freeDeliveryAbove: 2000,
    leadTimeHours: 12,
    rating: 4.6,
  }),
  offer({
    productId: 'prod_bh_butter',
    supplierTenantId: 'sup_bharat',
    supplierName: 'Bharat Wholesale',
    productName: 'Butter 1 kg',
    sku: 'BH-BUT',
    unitPrice: 470,
    baseQtyPerPack: 1,
    moq: 5,
    deliveryCharge: 250,
    leadTimeHours: 48,
    rating: 4.0,
  }),
];

/** Deterministic stand-in for ai-service supplier ranking: cheapest landed cost wins. */
function rank(body: { offers: Offer[]; quantity: number }) {
  const options = body.offers
    .map((o) => {
      const packs = Math.max(o.moq, Math.ceil(body.quantity / o.baseQtyPerPack));
      const subtotal = packs * o.unitPrice;
      const tax = Math.round(subtotal * o.gstRate) / 100;
      const deliveryCharge =
        o.freeDeliveryAbove !== null && subtotal >= o.freeDeliveryAbove ? 0 : o.deliveryCharge;
      return {
        productId: o.productId,
        supplierTenantId: o.supplierTenantId,
        supplierName: o.supplierName,
        productName: o.productName,
        brand: o.brand,
        unitPrice: o.unitPrice,
        packSize: o.baseQtyPerPack,
        packs,
        quantity: packs * o.baseQtyPerPack,
        subtotal,
        tax,
        deliveryCharge,
        landedCost: subtotal + tax + deliveryCharge,
        costPerBaseUnit: (subtotal + tax + deliveryCharge) / (packs * o.baseQtyPerPack),
        leadTimeHours: o.leadTimeHours,
        rating: o.rating,
        onTimeRate: o.onTimeRate,
        fillRate: o.fillRate,
        moqSatisfied: true,
        feasible: o.stockQty >= packs,
        score: 0,
        rank: 0,
      };
    })
    .sort((a, b) => a.landedCost - b.landedCost)
    .map((o, i, all) => ({
      ...o,
      rank: i + 1,
      score: Math.round((all[0]!.landedCost / o.landedCost) * 100) / 100,
    }));
  return { options, best: { BALANCED: options[0] ?? null, LOWEST_COST: options[0] ?? null } };
}

describe('procurement-service smart procurement flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) =>
      b.overrideProvider(InternalHttpService).useValue(http),
    );
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['procurement', 'platform']);
    await redis.flushdb();
    http.reset();
    const stock = [BUTTER, SUGAR];
    http
      .on('GET', 'inventory', 'internal/inventory/stock-status', ({ opts }) =>
        stock.filter((s) => s.tenantId === opts.query?.tenantId),
      )
      .on('GET', 'inventory', 'internal/inventory/ingredients/:id', ({ params }) =>
        stock.find((s) => s.id === params.id),
      )
      .on('GET', 'order', 'internal/outlets/:id', ({ params }) => ({
        id: params.id,
        tenantId: TENANT,
        name: 'Spice Garden - Koramangala',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560034',
        addressLine1: '80 Feet Road',
        lat: 12.9372,
        lng: 77.6235,
        phone: '+919900010001',
      }))
      .on('POST', 'supplier', 'internal/marketplace/quotes', ({ body }) =>
        (body as { category: string }).category === 'DAIRY' ? BUTTER_OFFERS : [],
      )
      .on('POST', 'ai', 'internal/ai/suppliers/rank', ({ body }) =>
        rank(body as { offers: Offer[]; quantity: number }),
      );
    await prisma.procurementSettings.create({
      data: { tenantId: TENANT, autoApproveBelow: 1000, defaultStrategy: 'BALANCED' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const supplierEvent = (
    type: string,
    data: Partial<B2bOrderEvent>,
  ): EventEnvelope<string, B2bOrderEvent> => ({
    id: `evt_${type}_${Math.random()}`,
    type,
    source: 'supplier-service',
    stream: 'marketplace',
    occurredAt: new Date().toISOString(),
    tenantId: 'sup_cowberry',
    aggregateType: 'B2bOrder',
    aggregateId: 'b2b_1',
    version: 1,
    data: {
      b2bOrderId: 'b2b_1',
      orderNumber: 'SO-1',
      buyerTenantId: TENANT,
      sellerTenantId: 'sup_cowberry',
      sourcePurchaseOrderId: null,
      status: 'PLACED',
      total: '0',
      ...data,
    },
  });

  it('turns low stock into an approved purchase order, syncs supplier billing and receives goods in stock units', async () => {
    const owner = member('OWNER');

    // 1. depletion check raises an alert only for the ingredient that will run out
    const scan = await api()
      .post('/api/v1/procurement/alerts/scan')
      .set(as(owner))
      .send({})
      .expect(200);
    expect(scan.body).toMatchObject({ scanned: 2, opened: 1 });
    const alerts = (await api().get('/api/v1/procurement/alerts').set(as(owner)).expect(200)).body;
    expect(alerts).toHaveLength(1);
    const [alert] = alerts;
    expect(alert).toMatchObject({ ingredientId: 'ing_butter', status: 'OPEN' });
    expect(Number(alert.suggestedQty)).toBeGreaterThan(0);

    // 2. auto-PO picks the best supplier and, above the limit, waits for the owner
    const auto = await api()
      .post('/api/v1/procurement/purchase-orders/auto')
      .set(as(owner))
      .send({})
      .expect(201);
    expect(auto.body.skipped).toEqual([]);
    expect(auto.body.created).toHaveLength(1);
    const created = auto.body.created[0];
    expect(created).toMatchObject({ supplierName: 'Cowberry Dairy', status: 'PENDING_APPROVAL' });
    const poId = created.id as string;
    let po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: poId },
      include: { items: true },
    });
    expect(po.items[0]).toMatchObject({
      ingredientId: 'ing_butter',
      productId: 'prod_cow_butter',
      ingredientUnit: 'KG',
    });
    expect(Number(po.items[0]!.baseQtyPerPack)).toBe(0.5);
    expect((await prisma.reorderAlert.findFirstOrThrow({ where: { id: alert.id } })).status).toBe(
      'PO_CREATED',
    );
    // the comparison behind the decision is kept for audit
    expect(await prisma.supplierQuote.count({ where: { ingredientId: 'ing_butter' } })).toBe(2);
    // an in-flight PO suppresses duplicate alerts
    expect(
      (await api().post('/api/v1/procurement/alerts/scan').set(as(owner)).send({}).expect(200)).body
        .opened,
    ).toBe(0);

    // 3. only roles with procurement:approve may approve
    await api()
      .post(`/api/v1/procurement/purchase-orders/${poId}/approve`)
      .set(as(member('MANAGER')))
      .send({})
      .expect(403);
    const approved = await api()
      .post(`/api/v1/procurement/purchase-orders/${poId}/approve`)
      .set(as(owner))
      .send({ comment: 'ok' })
      .expect(200);
    expect(approved.body.status).toBe('SENT_TO_SUPPLIER');
    const sent = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: poId, type: EventTypes.PurchaseOrderApproved },
    });
    expect((sent.payload as { items: unknown[] }).items).toHaveLength(1);

    // 4. supplier-side events: the billed amounts (freight GST) become the PO's amounts
    const handlers = app.get(ProcurementEventHandlers);
    const packs = Number(po.items[0]!.quantity);
    const goods = packs * 235;
    const freight = goods >= 2000 ? 0 : 60;
    const tax = Math.round(goods * 5) / 100 + Math.round(freight * 18) / 100;
    await handlers.onSupplierUpdate(
      supplierEvent(EventTypes.B2bOrderPlaced, {
        sourcePurchaseOrderId: poId,
        status: 'PLACED',
        subtotal: goods.toFixed(2),
        discount: '0.00',
        taxTotal: tax.toFixed(2),
        deliveryCharge: freight.toFixed(2),
        total: (goods + freight + tax).toFixed(2),
        paymentTerms: 'PREPAID',
      }),
    );
    po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: poId },
      include: { items: true },
    });
    expect(po.supplierOrderId).toBe('b2b_1');
    expect(Number(po.total)).toBeCloseTo(goods + freight + tax, 2);
    expect(Number(po.deliveryCharge)).toBe(freight);

    const confirmedPacks = packs - 2; // supplier is short by two packs
    await handlers.onSupplierUpdate(
      supplierEvent(EventTypes.B2bOrderConfirmed, {
        sourcePurchaseOrderId: poId,
        status: 'PARTIALLY_CONFIRMED',
        total: '0',
        confirmedLines: [{ productId: 'prod_cow_butter', confirmedQty: String(confirmedPacks) }],
      }),
    );
    await handlers.onSupplierUpdate(
      supplierEvent(EventTypes.B2bOrderDispatched, {
        sourcePurchaseOrderId: poId,
        status: 'DISPATCHED',
        total: '0',
        trackingInfo: { vehicleNumber: 'KA-01-AB-1234', lat: 12.95, lng: 77.6 },
      }),
    );
    await handlers.onSupplierUpdate(
      supplierEvent(EventTypes.B2bOrderDelivered, {
        sourcePurchaseOrderId: poId,
        status: 'DELIVERED',
        total: '0',
      }),
    );
    po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: poId },
      include: { items: true, events: { orderBy: { createdAt: 'asc' } } },
    });
    expect(po.status).toBe('DELIVERED');
    expect(Number(po.items[0]!.confirmedQty)).toBe(confirmedPacks);
    expect(po.trackingInfo).toMatchObject({ vehicleNumber: 'KA-01-AB-1234' });

    // 5. goods receipt in packs -> stock-unit quantities and per-unit cost for inventory
    const item = po.items[0]!;
    const received = await api()
      .post(`/api/v1/procurement/purchase-orders/${poId}/receive`)
      .set(as(owner))
      .send({ lines: [{ itemId: item.id, receivedQty: confirmedPacks }] })
      .expect(200);
    expect(received.body.status).toBe('RECEIVED');
    const grn = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: poId, type: EventTypes.PurchaseOrderReceived },
    });
    const { lines } = grn.payload as unknown as PurchaseOrderReceivedEvent;
    expect(lines).toEqual([
      {
        ingredientId: 'ing_butter',
        receivedQty: String(confirmedPacks * 0.5),
        unitPrice: '470.00',
        unit: 'KG',
      },
    ]);
    expect((await prisma.reorderAlert.findFirstOrThrow({ where: { id: alert.id } })).status).toBe(
      'RESOLVED',
    );
  });

  it('sends small auto-POs straight to the supplier', async () => {
    await prisma.procurementSettings.update({
      where: { tenantId: TENANT },
      data: { autoApproveBelow: 100_000 },
    });
    await api()
      .post('/api/v1/procurement/alerts/scan')
      .set(as(member('OWNER')))
      .send({})
      .expect(200);
    const auto = await api()
      .post('/api/v1/procurement/purchase-orders/auto')
      .set(as(member('PROCUREMENT_MANAGER')))
      .send({})
      .expect(201);
    expect(auto.body.created[0].status).toBe('SENT_TO_SUPPLIER');
    const events = await prisma.purchaseOrderEvent.findMany({
      where: { purchaseOrderId: auto.body.created[0].id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.status)).toEqual(['DRAFT', 'APPROVED', 'SENT_TO_SUPPLIER']);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: auto.body.created[0].id, type: EventTypes.PurchaseOrderApproved },
      }),
    ).toBe(1);
  });

  it('keeps purchase orders private to the buying tenant', async () => {
    await api()
      .post('/api/v1/procurement/alerts/scan')
      .set(as(member('OWNER')))
      .send({})
      .expect(200);
    const { body } = await api()
      .post('/api/v1/procurement/purchase-orders/auto')
      .set(as(member('OWNER')))
      .send({})
      .expect(201);
    const poId = body.created[0].id as string;
    const intruder = member('OWNER', 'tnt_rival');
    await api().get(`/api/v1/procurement/purchase-orders/${poId}`).set(as(intruder)).expect(404);
    await api()
      .post(`/api/v1/procurement/purchase-orders/${poId}/approve`)
      .set(as(intruder))
      .send({})
      .expect(404);
    const list = await api()
      .get('/api/v1/procurement/purchase-orders')
      .set(as(intruder))
      .expect(200);
    expect(list.body.data).toHaveLength(0);
  });

  it('confines outlet-scoped staff to their own outlets', async () => {
    const owner = member('OWNER');
    await api().post('/api/v1/procurement/alerts/scan').set(as(owner)).send({}).expect(200);
    const { body } = await api()
      .post('/api/v1/procurement/purchase-orders/auto')
      .set(as(owner))
      .send({})
      .expect(201);
    const poId = body.created[0].id as string; // delivers to OUTLET (Koramangala)
    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: poId },
      include: { items: true },
    });

    const elsewhere = member('PROCUREMENT_MANAGER', TENANT, ['outlet_indira']);
    const elsewhereOwner = member('OWNER', TENANT, ['outlet_indira']);
    const forbidden = async (req: request.Test) =>
      expect((await req.expect(403)).body.code).toBe('OUTLET_FORBIDDEN');
    await forbidden(api().get(`/api/v1/procurement/purchase-orders/${poId}`).set(as(elsewhere)));
    for (const action of ['submit', 'cancel'])
      await forbidden(
        api()
          .post(`/api/v1/procurement/purchase-orders/${poId}/${action}`)
          .set(as(elsewhere))
          .send({}),
      );
    for (const action of ['approve', 'reject'])
      await forbidden(
        api()
          .post(`/api/v1/procurement/purchase-orders/${poId}/${action}`)
          .set(as(elsewhereOwner))
          .send({}),
      );
    await forbidden(
      api()
        .post(`/api/v1/procurement/purchase-orders/${poId}/receive`)
        .set(as(elsewhere))
        .send({ lines: [{ itemId: po.items[0]!.id, receivedQty: 1 }] }),
    );
    await forbidden(
      api()
        .post('/api/v1/procurement/purchase-orders')
        .set(as(elsewhere))
        .send({
          outletId: OUTLET,
          supplierTenantId: 'sup_cowberry',
          items: [{ productId: 'prod_cow_butter', quantity: 4 }],
        }),
    );
    await forbidden(
      api()
        .get('/api/v1/procurement/purchase-orders')
        .query({ outletId: OUTLET })
        .set(as(elsewhere)),
    );
    await forbidden(
      api().post('/api/v1/procurement/alerts/scan').query({ outletId: OUTLET }).set(as(elsewhere)),
    );
    await forbidden(
      api()
        .get('/api/v1/procurement/recommendations')
        .query({ ingredientId: 'ing_butter' })
        .set(as(elsewhere)),
    );
    await forbidden(api().get('/api/v1/procurement/forecasts/ing_butter').set(as(elsewhere)));

    // unfiltered lists default to the staffer's outlets instead of the whole tenant
    const list = await api()
      .get('/api/v1/procurement/purchase-orders')
      .set(as(elsewhere))
      .expect(200);
    expect(list.body.data).toHaveLength(0);
    const dash = await api().get('/api/v1/procurement/dashboard').set(as(elsewhere)).expect(200);
    expect(dash.body.pendingApproval).toBe(0);
    expect(
      (await api().post('/api/v1/procurement/alerts/scan').set(as(elsewhere)).send({}).expect(200))
        .body.scanned,
    ).toBe(0);

    // staff assigned to the PO's outlet keep full access
    const here = member('PROCUREMENT_MANAGER', TENANT, [OUTLET]);
    await api().get(`/api/v1/procurement/purchase-orders/${poId}`).set(as(here)).expect(200);
    expect(
      (await api().get('/api/v1/procurement/purchase-orders').set(as(here)).expect(200)).body.data,
    ).toHaveLength(1);
    expect(
      (await api().get('/api/v1/procurement/dashboard').set(as(here)).expect(200)).body
        .pendingApproval,
    ).toBe(1);
  });

  it("prices manual POs with the supplier's catalogue price for this buyer", async () => {
    http.on('GET', 'supplier', 'internal/marketplace/products/:id', ({ params, opts }) => ({
      id: params.id,
      tenantId: 'sup_cowberry',
      name: 'Pizza Flour Type 00',
      sku: 'FLOUR-00',
      unit: 'KG',
      packSize: '10',
      price: '680',
      gstRate: '5',
      deliveryTimeHours: 24,
      priceTiers: [
        { minQty: '1', unitPrice: '650', segment: 'RESTAURANT' },
        // an expired bulk promo the PO must not pick up on its own
        { minQty: '4', unitPrice: '400', segment: 'ALL', validTo: '2026-01-31T23:59:59Z' },
      ],
      ...(opts.query?.buyerTenantId === TENANT && Number(opts.query?.quantity) === 4
        ? { buyerUnitPrice: 650 }
        : {}),
    }));
    const created = await api()
      .post('/api/v1/procurement/purchase-orders')
      .set(as(member('PROCUREMENT_MANAGER')))
      .send({
        outletId: OUTLET,
        supplierTenantId: 'sup_cowberry',
        items: [{ productId: 'prod_flour', quantity: 4 }],
      })
      .expect(201);
    expect(Number(created.body.items[0].unitPrice)).toBe(650);
    expect(Number(created.body.subtotal)).toBe(2600);
  });
});
