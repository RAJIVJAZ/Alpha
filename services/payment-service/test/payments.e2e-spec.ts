import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import { InternalHttpService } from '@foodgrid/utils/server';
import { createTestApp, FakeInternalHttp, issueServiceToken, issueTestToken, truncateSchemas } from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { PaymentEventHandlers } from '../src/events/payment-event.handlers';
import { SANDBOX_SECRET } from '../src/gateways/sandbox.gateway';
import { SERVICE } from '../src/service.config';

const CUSTOMER = 'cust_pay_1';
const token = issueTestToken({ sub: CUSTOMER, roles: ['CUSTOMER'], name: 'Asha', phone: '+919800000001' });

describe('payment-service (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = new FakeInternalHttp();
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(AppModule, SERVICE, (b) => b.overrideProvider(InternalHttpService).useValue(http));
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateSchemas(prisma, ['payments', 'platform']);
    http.reset();
    // every order costs ₹120 and belongs to the test customer
    http.on('GET', 'order', 'internal/orders/:id/payable', ({ params }) => ({
      referenceId: params.id, amount: '120.00', userId: CUSTOMER, tenantId: 'tnt_kitchen', payable: true, description: `Order ${params.id}`,
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  const webhook = (body: object, opts: { eventId: string; secret?: string }) => {
    const raw = JSON.stringify(body);
    return api()
      .post('/api/v1/payments/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-event-id', opts.eventId)
      .set('x-razorpay-signature', createHmac('sha256', opts.secret ?? SANDBOX_SECRET).update(raw).digest('hex'))
      .send(raw);
  };

  const credit = (amount: number, idempotencyKey: string) =>
    api()
      .post('/api/v1/internal/payments/wallets/credit')
      .set('x-service-token', issueServiceToken('order-service'))
      .send({ ownerType: 'CUSTOMER', ownerId: CUSTOMER, amount, reason: 'CASHBACK', idempotencyKey });

  it('captures an online payment from a signed webhook, once, and emits payment.captured', async () => {
    const intent = await api().post('/api/v1/payments/intents').set('Authorization', `Bearer ${token}`).send({ purpose: 'ORDER', referenceId: 'ord_1', method: 'UPI' }).expect(201);
    expect(intent.body).toMatchObject({ state: 'CREATED', amount: '120.00', sandbox: true, checkout: { amount: 12000, currency: 'INR' } });
    const orderId = intent.body.checkout.order_id as string;

    const event = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test_1', order_id: orderId, method: 'upi' } } } };
    const forged = await webhook(event, { eventId: 'evt_forged', secret: 'not-the-secret' }).expect(400);
    expect(forged.body.code).toBe('SIGNATURE_INVALID');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: intent.body.paymentId } })).state).toBe('CREATED');

    expect((await webhook(event, { eventId: 'evt_1' }).expect(200)).body).toEqual({ status: 'processed' });
    expect((await webhook(event, { eventId: 'evt_1' }).expect(200)).body).toEqual({ status: 'duplicate' });

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: intent.body.paymentId } });
    expect(payment).toMatchObject({ state: 'CAPTURED', providerPaymentId: 'pay_test_1', method: 'UPI' });
    const events = await prisma.outboxEvent.findMany({ where: { type: 'payment.captured', aggregateId: payment.id } });
    expect(events).toHaveLength(1);
    // both webhook deliveries are kept for audit; the forged one is flagged
    const stored = await prisma.paymentWebhookEvent.findMany({ orderBy: { receivedAt: 'asc' } });
    expect(stored.map((w) => [w.eventId, w.signatureValid])).toEqual([['evt_forged', false], ['evt_1', true]]);
  });

  it('never lets concurrent wallet payments overspend the balance', async () => {
    await credit(500, 'seed-500').expect(201);
    const pays = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        api().post('/api/v1/payments/intents').set('Authorization', `Bearer ${token}`).send({ purpose: 'ORDER', referenceId: `ord_w${i}`, method: 'WALLET' }),
      ),
    );
    const ok = pays.filter((r) => r.status === 201);
    const rejected = pays.filter((r) => r.status !== 201);
    expect(ok.length).toBeGreaterThan(0);
    expect(ok.length).toBeLessThanOrEqual(4); // 4 x 120 = 480 <= 500 < 600
    for (const r of rejected) expect(['INSUFFICIENT_BALANCE', 'WALLET_CONTENTION']).toContain(r.body.code);

    const wallet = await prisma.wallet.findFirstOrThrow({ where: { ownerType: 'CUSTOMER', ownerId: CUSTOMER } });
    expect(Number(wallet.balance)).toBe(500 - 120 * ok.length);
    expect(await prisma.walletTransaction.count({ where: { walletId: wallet.id, type: 'DEBIT' } })).toBe(ok.length);
    // a payment row exists only for debits that went through
    expect(await prisma.payment.count({ where: { provider: 'WALLET' } })).toBe(ok.length);

    const rec = await api().get(`/api/v1/admin/wallets/${wallet.id}/reconcile`).set('Authorization', `Bearer ${issueTestToken({ sub: 'admin', roles: ['ADMIN'] })}`).expect(200);
    expect(rec.body).toMatchObject({ consistent: true, storedBalance: 500 - 120 * ok.length });
  });

  it('applies a ledger entry once when the same idempotency key arrives concurrently', async () => {
    const results = await Promise.all([credit(75, 'cashback-ord-9'), credit(75, 'cashback-ord-9'), credit(75, 'cashback-ord-9')]);
    for (const r of results) expect(r.status).toBe(201);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    const wallet = await prisma.wallet.findFirstOrThrow({ where: { ownerType: 'CUSTOMER', ownerId: CUSTOMER } });
    expect(Number(wallet.balance)).toBe(75);
    expect(await prisma.walletTransaction.count()).toBe(1);
  });

  it('refuses to charge someone else\'s order', async () => {
    http.on('GET', 'order', 'internal/orders/:id/payable', ({ params }) => ({ referenceId: params.id, amount: '99.00', userId: 'someone_else', tenantId: 't', payable: true, description: 'x' }));
    const res = await api().post('/api/v1/payments/intents').set('Authorization', `Bearer ${token}`).send({ purpose: 'ORDER', referenceId: 'ord_x', method: 'UPI' }).expect(403);
    expect(res.body.code).toBe('NOT_YOUR_PAYMENT');
  });
  it('nets COD cash against rider pay and lets finance record the cash handed in', async () => {
    const RIDER = 'usr_rider_cod';
    const handlers = app.get(PaymentEventHandlers);
    const delivered = (id: string, earning: string, cod: string) =>
      handlers.riderEarnings({
        id: `evt_${id}`,
        type: 'delivery.delivered',
        data: { deliveryId: id, orderNumber: `ORD-${id}`, riderUserId: RIDER, riderEarning: earning, tipAmount: '0.00', isCod: Number(cod) > 0, codAmount: cod },
      } as never);
    await delivered('d1', '60.00', '0.00');
    await delivered('d2', '50.00', '410.00');
    await delivered('d2', '50.00', '410.00'); // redelivered event is a no-op

    const admin = `Bearer ${issueTestToken({ sub: 'admin', roles: ['ADMIN'] })}`;
    const due = await api().get('/api/v1/admin/rider-cash').set('Authorization', admin).expect(200);
    expect(due.body).toEqual([expect.objectContaining({ ownerId: RIDER, cashDue: 300 })]);

    const deposit = (amount: number) => api().post(`/api/v1/admin/rider-cash/${RIDER}/deposits`).set('Authorization', admin).send({ amount, reference: 'HUB-42' });
    expect((await deposit(350).expect(409)).body.code).toBe('DEPOSIT_EXCEEDS_DUE');
    await deposit(300).expect(201);
    expect((await deposit(10).expect(409)).body.code).toBe('NO_CASH_DUE');

    const wallet = await prisma.wallet.findFirstOrThrow({ where: { ownerType: 'RIDER', ownerId: RIDER } });
    expect(Number(wallet.balance)).toBe(0);
    expect((await api().get('/api/v1/admin/rider-cash').set('Authorization', admin).expect(200)).body).toEqual([]);
    // finance staff only
    await api().post(`/api/v1/admin/rider-cash/${RIDER}/deposits`).set('Authorization', `Bearer ${token}`).send({ amount: 1 }).expect(403);
  });
});
