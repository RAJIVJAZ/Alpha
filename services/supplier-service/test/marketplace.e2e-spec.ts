import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import { EventTypes, type EventEnvelope, type PurchaseOrderEvent } from '@foodgrid/types';
import { InternalHttpService } from '@foodgrid/utils/server';
import {
  createTestApp,
  FakeInternalHttp,
  issueServiceToken,
  issueTestToken,
  truncateSchemas,
} from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { SupplierEventHandlers } from '../src/events/supplier-event.handlers';
import { SERVICE } from '../src/service.config';

const BHARAT = 'tnt_bharat'; // wholesaler
const ANNAPURNA = 'tnt_annapurna'; // supplier
const LAKSHMI = 'tnt_lakshmi'; // retailer, NET_15 dealer of Bharat
const SPICE = 'tnt_spice'; // restaurant, 10% dealer of Annapurna
const CAFE = 'tnt_cafe'; // restaurant, not a dealer anywhere

const TENANTS: Record<string, { type: string; name: string }> = {
  [BHARAT]: { type: 'WHOLESALER', name: 'Bharat Wholesale' },
  [ANNAPURNA]: { type: 'SUPPLIER', name: 'Annapurna Foods' },
  [LAKSHMI]: { type: 'RETAILER', name: 'Sri Lakshmi Kirana' },
  [SPICE]: { type: 'RESTAURANT', name: 'Spice Garden' },
  [CAFE]: { type: 'RESTAURANT', name: 'Corner Cafe' },
};

const owner = (tenantId: string) =>
  issueTestToken({
    sub: `owner_${tenantId}`,
    roles: ['CUSTOMER'],
    tenantId,
    tenantType: TENANTS[tenantId]!.type as never,
    tenantRole: 'OWNER' as never,
    outletIds: [],
  });

const ADDRESS = { line1: 'Jayanagar 4th Block', city: 'Bengaluru', state: 'KA', pincode: '560041' };

describe('supplier-service marketplace (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());
  const as = (tenantId: string) => ({ Authorization: `Bearer ${owner(tenantId)}` });
  let categoryId: string;

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) =>
      b.overrideProvider(InternalHttpService).useValue(http),
    );
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['marketplace', 'platform']);
    http.reset();
    http.on('GET', 'user', 'internal/tenants/:id', ({ params }) => ({
      id: params.id,
      legalName: null,
      status: 'ACTIVE',
      gstin: null,
      stateCode: '29',
      city: 'Bengaluru',
      pincode: '560001',
      lat: null,
      lng: null,
      ...TENANTS[params.id],
    }));
    categoryId = (
      await prisma.productCategory.create({ data: { code: 'GRAINS', name: 'Grains', slug: 'g' } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const product = (tenantId: string, sku: string, price: number, tiers: object[] = []) =>
    prisma.product.create({
      data: {
        tenantId,
        sellerType: TENANTS[tenantId]!.type === 'SUPPLIER' ? 'SUPPLIER' : 'WHOLESALER',
        categoryId,
        name: sku,
        slug: sku.toLowerCase(),
        sku,
        unit: 'KG',
        price,
        gstRate: 5,
        stockQty: 1000,
        priceTiers: { create: tiers as never },
      },
    });
  const outstanding = async (id: string) =>
    Number((await prisma.dealer.findUniqueOrThrow({ where: { id } })).outstanding);
  const order = (buyer: string, body: object) =>
    api()
      .post('/api/v1/marketplace/orders')
      .set(as(buyer))
      .send({ sellerTenantId: BHARAT, deliveryAddress: ADDRESS, ...body });

  it('caps dealer credit at the agreed terms and the cumulative invoiced limit', async () => {
    // ₹200,000 line with ₹38,450 already outstanding, agreed NET_15, 2% dealer discount
    const dealer = await prisma.dealer.create({
      data: {
        tenantId: BHARAT,
        dealerTenantId: LAKSHMI,
        name: 'Sri Lakshmi Kirana Stores',
        phone: '+919900077001',
        city: 'Bengaluru',
        status: 'ACTIVE',
        creditLimit: 200_000,
        outstanding: 38_450,
        paymentTerms: 'NET_15',
        discountPct: 2,
      },
    });
    // one pack invoices at 3960 x 0.98 x 1.05 = 4074.84
    const chana = await product(BHARAT, 'KABULI-30', 3960);
    const items = (quantity: number) => [{ productId: chana.id, quantity }];

    // longer terms than agreed are refused
    const net30 = await order(LAKSHMI, { items: items(1), paymentTerms: 'NET_30' }).expect(403);
    expect(net30.body.code).toBe('TERMS_NOT_ALLOWED');
    // the limit is checked on the invoiced total (162,993.60), not the pre-tax gross (158,400)
    const big = await order(LAKSHMI, { items: items(40), paymentTerms: 'NET_15' }).expect(422);
    expect(big.body.code).toBe('CREDIT_LIMIT');
    expect(await outstanding(dealer.id)).toBe(38_450);

    // placed credit orders use up the line
    const first = await order(LAKSHMI, { items: items(20), paymentTerms: 'NET_15' }).expect(201);
    expect(Number(first.body.total)).toBe(81_496.8);
    expect(await outstanding(dealer.id)).toBe(119_946.8);
    // so orders cannot be stacked past the limit, even concurrently (80,053.20 left, 2 x 40,748.40)
    const racing = await Promise.all([
      order(LAKSHMI, { items: items(10), paymentTerms: 'NET_15' }),
      order(LAKSHMI, { items: items(10), paymentTerms: 'NET_15' }),
    ]);
    expect(racing.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(await outstanding(dealer.id)).toBe(160_695.2);
    // prepaid orders are not credit
    await order(LAKSHMI, { items: items(20), paymentTerms: 'PREPAID' }).expect(201);
    expect(await outstanding(dealer.id)).toBe(160_695.2);

    // cancel (buyer) and reject (seller) give the credit back
    await api()
      .post(`/api/v1/marketplace/orders/${first.body.id}/cancel`)
      .set(as(LAKSHMI))
      .send({ reason: 'test' })
      .expect(200);
    const winner = racing.find((r) => r.status === 201)!.body.id as string;
    await api()
      .post(`/api/v1/seller/orders/${winner}/reject`)
      .set(as(BHARAT))
      .send({ reason: 'test' })
      .expect(200);
    expect(await outstanding(dealer.id)).toBe(38_450);

    // a partial confirmation re-bills and releases the difference; payment releases the rest
    const third = await order(LAKSHMI, { items: items(10), paymentTerms: 'NET_15' }).expect(201);
    expect(await outstanding(dealer.id)).toBe(79_198.4);
    await api()
      .post(`/api/v1/seller/orders/${third.body.id}/confirm`)
      .set(as(BHARAT))
      .send({ lines: [{ productId: chana.id, confirmedQty: 5 }] })
      .expect(200);
    expect(await outstanding(dealer.id)).toBe(58_824.2);
    const handlers = app.get(SupplierEventHandlers);
    const paid = {
      type: EventTypes.PaymentCaptured,
      data: { purpose: 'B2B_ORDER', referenceId: third.body.id },
    } as unknown as EventEnvelope<string, never>;
    await handlers.onPaymentCaptured(paid);
    await handlers.onPaymentCaptured(paid); // redelivery is a no-op
    expect(await outstanding(dealer.id)).toBe(38_450);
    expect(
      (await prisma.b2bOrder.findUniqueOrThrow({ where: { id: third.body.id } })).paymentStatus,
    ).toBe('PAID');

    // buyers without a dealer agreement get no credit at all
    const cafe = await order(CAFE, { items: items(1), paymentTerms: 'NET_7' }).expect(403);
    expect(cafe.body.code).toBe('CREDIT_NOT_ALLOWED');
  });

  it('bills purchase orders at the catalogue price and applies the dealer discount once', async () => {
    await prisma.dealer.create({
      data: {
        tenantId: ANNAPURNA,
        dealerTenantId: SPICE,
        name: 'Spice Garden',
        phone: '+919900010001',
        city: 'Bengaluru',
        status: 'ACTIVE',
        paymentTerms: 'PREPAID',
        discountPct: 10,
      },
    });
    const oil = await product(ANNAPURNA, 'OIL-15L', 1950, [{ minQty: 10, unitPrice: 1900 }]);
    const flour = await product(ANNAPURNA, 'FLOUR-00', 680, [
      { minQty: 1, unitPrice: 400, validTo: new Date('2026-01-31T23:59:59Z') }, // expired promo
      { minQty: 1, maxQty: 2, unitPrice: 450 }, // trial price for up to 2 packs
      { minQty: 1, unitPrice: 500, segment: 'RETAILER' },
      { minQty: 3, unitPrice: 620 },
    ]);

    // procurement asks the supplier what this buyer would pay (no re-implemented tier logic)
    const price = async (productId: string, buyer: string, quantity: number) =>
      (
        await api()
          .get(`/api/v1/internal/marketplace/products/${productId}`)
          .query({ buyerTenantId: buyer, quantity })
          .set('x-service-token', issueServiceToken('procurement-service'))
          .expect(200)
      ).body.buyerUnitPrice;
    expect(await price(flour.id, SPICE, 4)).toBe(620);
    expect(await price(flour.id, CAFE, 2)).toBe(450);
    expect(await price(flour.id, LAKSHMI, 2)).toBe(500);
    expect(await price(oil.id, SPICE, 1)).toBe(1950);

    // an approved PO carrying a dealer-net price (auto-PO) and an expired promo price (manual PO)
    const po: EventEnvelope<string, PurchaseOrderEvent> = {
      id: 'evt_po',
      type: EventTypes.PurchaseOrderApproved,
      source: 'procurement-service',
      stream: 'procurement',
      occurredAt: new Date().toISOString(),
      tenantId: SPICE,
      aggregateType: 'PurchaseOrder',
      aggregateId: 'po_1',
      version: 1,
      data: {
        purchaseOrderId: 'po_1',
        poNumber: 'PO-1',
        tenantId: SPICE,
        buyerName: 'Spice Garden',
        outletId: 'outlet_kora',
        supplierTenantId: ANNAPURNA,
        status: 'SENT_TO_SUPPLIER',
        total: '0',
        paymentTerms: 'PREPAID',
        expectedDeliveryAt: null,
        deliveryAddress: { ...ADDRESS, lat: 12.93, lng: 77.58 },
        items: [
          { productId: oil.id, quantity: '1', unitPrice: '1755.00' },
          { productId: flour.id, quantity: '4', unitPrice: '400.00' },
        ].map((l) => ({ ...l, ingredientId: null, name: 'x', sku: 'x', unit: 'x', gstRate: '5' })),
      },
    };
    await app.get(SupplierEventHandlers).onPoApproved(po);
    const so = await prisma.b2bOrder.findUniqueOrThrow({
      where: { sourcePurchaseOrderId: 'po_1' },
      include: { items: true },
    });
    const unit = Object.fromEntries(so.items.map((i) => [i.productId, Number(i.unitPrice)]));
    expect(unit).toEqual({ [oil.id]: 1950, [flour.id]: 620 });
    expect(Number(so.subtotal)).toBe(4430); // 1950 + 4 x 620
    expect(Number(so.discount)).toBe(443); // 10% once: taxable 3987, not 1950 x 0.81 + ...
  });

  it("keeps a seller's dealers inside its own territories", async () => {
    const foreign = await prisma.territory.create({
      data: { tenantId: BHARAT, name: 'Bengaluru South' },
    });
    const own = await prisma.territory.create({ data: { tenantId: ANNAPURNA, name: 'Central' } });
    const dealer = await prisma.dealer.create({
      data: { tenantId: ANNAPURNA, name: 'ZZ dealer', phone: '+910000099917', city: 'Bengaluru' },
    });
    const patch = (territoryId: string | null) =>
      api().patch(`/api/v1/seller/dealers/${dealer.id}`).set(as(ANNAPURNA)).send({ territoryId });

    expect((await patch(foreign.id).expect(400)).body.code).toBe('INVALID_TERRITORY');
    expect((await prisma.dealer.findUniqueOrThrow({ where: { id: dealer.id } })).territoryId).toBe(
      null,
    );
    const territories = await api().get('/api/v1/seller/territories').set(as(BHARAT)).expect(200);
    expect(territories.body[0]._count.dealers).toBe(0);

    expect((await patch(own.id).expect(200)).body.territoryId).toBe(own.id);
    expect((await patch(null).expect(200)).body.territoryId).toBe(null);
    // another seller's dealer stays out of reach
    await api()
      .patch(`/api/v1/seller/dealers/${dealer.id}`)
      .set(as(BHARAT))
      .send({ name: 'hijacked' })
      .expect(404);
  });
});
