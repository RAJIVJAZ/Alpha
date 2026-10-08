import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '@foodgrid/database/nest';
import { InternalHttpService } from '@foodgrid/utils/server';
import {
  createTestApp,
  FakeInternalHttp,
  issueServiceToken,
  issueTestToken,
  truncateSchemas,
} from '@foodgrid/utils/testing';
import { AppModule } from '../src/app.module';
import { PaymentEventHandlers } from '../src/events/payment-event.handlers';
import { SANDBOX_SECRET } from '../src/gateways/sandbox.gateway';
import { SERVICE } from '../src/service.config';

const CUSTOMER = 'cust_pay_1';
const token = issueTestToken({
  sub: CUSTOMER,
  roles: ['CUSTOMER'],
  name: 'Asha',
  phone: '+919800000001',
});

describe('payment-service (e2e)', () => {
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
    // every order costs ₹120 and belongs to the test customer
    http.on('GET', 'order', 'internal/orders/:id/payable', ({ params }) => ({
      referenceId: params.id,
      amount: '120.00',
      userId: CUSTOMER,
      tenantId: 'tnt_kitchen',
      payable: true,
      description: `Order ${params.id}`,
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
      .set(
        'x-razorpay-signature',
        createHmac('sha256', opts.secret ?? SANDBOX_SECRET)
          .update(raw)
          .digest('hex'),
      )
      .send(raw);
  };

  const credit = (amount: number, idempotencyKey: string) =>
    api()
      .post('/api/v1/internal/payments/wallets/credit')
      .set('x-service-token', issueServiceToken('order-service'))
      .send({
        ownerType: 'CUSTOMER',
        ownerId: CUSTOMER,
        amount,
        reason: 'CASHBACK',
        idempotencyKey,
      });

  it('captures an online payment from a signed webhook, once, and emits payment.captured', async () => {
    const intent = await api()
      .post('/api/v1/payments/intents')
      .set('Authorization', `Bearer ${token}`)
      .send({ purpose: 'ORDER', referenceId: 'ord_1', method: 'UPI' })
      .expect(201);
    expect(intent.body).toMatchObject({
      state: 'CREATED',
      amount: '120.00',
      sandbox: true,
      checkout: { amount: 12000, currency: 'INR' },
    });
    const orderId = intent.body.checkout.order_id as string;

    const event = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_test_1', order_id: orderId, method: 'upi' } } },
    };
    const forged = await webhook(event, { eventId: 'evt_forged', secret: 'not-the-secret' }).expect(
      400,
    );
    expect(forged.body.code).toBe('SIGNATURE_INVALID');
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: intent.body.paymentId } })).state,
    ).toBe('CREATED');

    expect((await webhook(event, { eventId: 'evt_1' }).expect(200)).body).toEqual({
      status: 'processed',
    });
    expect((await webhook(event, { eventId: 'evt_1' }).expect(200)).body).toEqual({
      status: 'duplicate',
    });

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: intent.body.paymentId },
    });
    expect(payment).toMatchObject({
      state: 'CAPTURED',
      providerPaymentId: 'pay_test_1',
      method: 'UPI',
    });
    const events = await prisma.outboxEvent.findMany({
      where: { type: 'payment.captured', aggregateId: payment.id },
    });
    expect(events).toHaveLength(1);
    // both webhook deliveries are kept for audit; the forged one is flagged
    const stored = await prisma.paymentWebhookEvent.findMany({ orderBy: { receivedAt: 'asc' } });
    expect(stored.map((w) => [w.eventId, w.signatureValid])).toEqual([
      ['evt_forged', false],
      ['evt_1', true],
    ]);
  });

  it('never lets concurrent wallet payments overspend the balance', async () => {
    await credit(500, 'seed-500').expect(201);
    const pays = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        api()
          .post('/api/v1/payments/intents')
          .set('Authorization', `Bearer ${token}`)
          .send({ purpose: 'ORDER', referenceId: `ord_w${i}`, method: 'WALLET' }),
      ),
    );
    const ok = pays.filter((r) => r.status === 201);
    const rejected = pays.filter((r) => r.status !== 201);
    expect(ok.length).toBeGreaterThan(0);
    expect(ok.length).toBeLessThanOrEqual(4); // 4 x 120 = 480 <= 500 < 600
    for (const r of rejected)
      expect(['INSUFFICIENT_BALANCE', 'WALLET_CONTENTION']).toContain(r.body.code);

    const wallet = await prisma.wallet.findFirstOrThrow({
      where: { ownerType: 'CUSTOMER', ownerId: CUSTOMER },
    });
    expect(Number(wallet.balance)).toBe(500 - 120 * ok.length);
    expect(
      await prisma.walletTransaction.count({ where: { walletId: wallet.id, type: 'DEBIT' } }),
    ).toBe(ok.length);
    // a payment row exists only for debits that went through
    expect(await prisma.payment.count({ where: { provider: 'WALLET' } })).toBe(ok.length);

    const rec = await api()
      .get(`/api/v1/admin/wallets/${wallet.id}/reconcile`)
      .set('Authorization', `Bearer ${issueTestToken({ sub: 'admin', roles: ['ADMIN'] })}`)
      .expect(200);
    expect(rec.body).toMatchObject({ consistent: true, storedBalance: 500 - 120 * ok.length });
  });

  it('applies a ledger entry once when the same idempotency key arrives concurrently', async () => {
    const results = await Promise.all([
      credit(75, 'cashback-ord-9'),
      credit(75, 'cashback-ord-9'),
      credit(75, 'cashback-ord-9'),
    ]);
    for (const r of results) expect(r.status).toBe(201);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    const wallet = await prisma.wallet.findFirstOrThrow({
      where: { ownerType: 'CUSTOMER', ownerId: CUSTOMER },
    });
    expect(Number(wallet.balance)).toBe(75);
    expect(await prisma.walletTransaction.count()).toBe(1);
  });

  it("refuses to charge someone else's order", async () => {
    http.on('GET', 'order', 'internal/orders/:id/payable', ({ params }) => ({
      referenceId: params.id,
      amount: '99.00',
      userId: 'someone_else',
      tenantId: 't',
      payable: true,
      description: 'x',
    }));
    const res = await api()
      .post('/api/v1/payments/intents')
      .set('Authorization', `Bearer ${token}`)
      .send({ purpose: 'ORDER', referenceId: 'ord_x', method: 'UPI' })
      .expect(403);
    expect(res.body.code).toBe('NOT_YOUR_PAYMENT');
  });
  it('nets COD cash against rider pay and lets finance record the cash handed in', async () => {
    const RIDER = 'usr_rider_cod';
    const handlers = app.get(PaymentEventHandlers);
    const delivered = (id: string, earning: string, cod: string) =>
      handlers.riderEarnings({
        id: `evt_${id}`,
        type: 'delivery.delivered',
        data: {
          deliveryId: id,
          orderNumber: `ORD-${id}`,
          riderUserId: RIDER,
          riderEarning: earning,
          tipAmount: '0.00',
          isCod: Number(cod) > 0,
          codAmount: cod,
        },
      } as never);
    await delivered('d1', '60.00', '0.00');
    await delivered('d2', '50.00', '410.00');
    await delivered('d2', '50.00', '410.00'); // redelivered event is a no-op

    const admin = `Bearer ${issueTestToken({ sub: 'admin', roles: ['ADMIN'] })}`;
    const due = await api().get('/api/v1/admin/rider-cash').set('Authorization', admin).expect(200);
    expect(due.body).toEqual([expect.objectContaining({ ownerId: RIDER, cashDue: 300 })]);

    const deposit = (amount: number) =>
      api()
        .post(`/api/v1/admin/rider-cash/${RIDER}/deposits`)
        .set('Authorization', admin)
        .send({ amount, reference: 'HUB-42' });
    expect((await deposit(350).expect(409)).body.code).toBe('DEPOSIT_EXCEEDS_DUE');
    await deposit(300).expect(201);
    expect((await deposit(10).expect(409)).body.code).toBe('NO_CASH_DUE');

    const wallet = await prisma.wallet.findFirstOrThrow({
      where: { ownerType: 'RIDER', ownerId: RIDER },
    });
    expect(Number(wallet.balance)).toBe(0);
    expect(
      (await api().get('/api/v1/admin/rider-cash').set('Authorization', admin).expect(200)).body,
    ).toEqual([]);
    // finance staff only
    await api()
      .post(`/api/v1/admin/rider-cash/${RIDER}/deposits`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1 })
      .expect(403);
  });
  describe('concurrent finance actions move money once', () => {
    const finance = `Bearer ${issueTestToken({ sub: 'fin_1', roles: ['FINANCE'] })}`;
    const customerWallet = () =>
      prisma.wallet.findFirst({ where: { ownerType: 'CUSTOMER', ownerId: CUSTOMER } });

    it('refunds a captured payment at most once when admins refund it in parallel', async () => {
      const payment = await prisma.payment.create({
        data: {
          purpose: 'WALLET_TOPUP',
          referenceId: 'topup_race',
          userId: CUSTOMER,
          amount: 100,
          provider: 'RAZORPAY',
          state: 'CAPTURED',
          providerPaymentId: 'pay_race_1',
        },
      });
      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          api()
            .post(`/api/v1/admin/payments/${payment.id}/refunds`)
            .set('Authorization', finance)
            .send({ reason: 'race probe', toWallet: true }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      for (const r of results.filter((x) => x.status === 409))
        expect(['REFUND_EXCEEDS', 'NOT_REFUNDABLE']).toContain(r.body.code);

      const after = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(after).toMatchObject({ state: 'REFUNDED' });
      expect(Number(after.refundedAmount)).toBe(100);
      expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(1);
      expect(Number((await customerWallet())?.balance)).toBe(100);

      // a partial refund afterwards is still refused
      const more = await api()
        .post(`/api/v1/admin/payments/${payment.id}/refunds`)
        .set('Authorization', finance)
        .send({ reason: 'again', amount: 1, toWallet: true })
        .expect(409);
      expect(more.body.code).toBe('NOT_REFUNDABLE');
    });

    it('counts gateway refunds still in flight against the refundable amount', async () => {
      const payment = await prisma.payment.create({
        data: {
          purpose: 'ORDER',
          referenceId: 'ord_inflight',
          userId: CUSTOMER,
          amount: 100,
          provider: 'RAZORPAY',
          state: 'CAPTURED',
          providerPaymentId: 'pay_inflight',
        },
      });
      await prisma.refund.create({
        data: { paymentId: payment.id, amount: 70, reason: 'pending' },
      });
      const res = await api()
        .post(`/api/v1/admin/payments/${payment.id}/refunds`)
        .set('Authorization', finance)
        .send({ reason: 'more', amount: 50, toWallet: true })
        .expect(409);
      expect(res.body.code).toBe('REFUND_EXCEEDS');
    });

    it('lets only one of concurrent mark-paid / mark-failed finalise a payout', async () => {
      const RIDER = 'usr_rider_payout';
      await prisma.wallet.create({ data: { ownerType: 'RIDER', ownerId: RIDER, balance: 0 } });
      const wallet = await prisma.wallet.findFirstOrThrow({ where: { ownerId: RIDER } });
      const payout = await prisma.payout.create({
        data: {
          walletId: wallet.id,
          ownerType: 'RIDER',
          ownerId: RIDER,
          amount: 200,
          destination: {},
        },
      });
      const [paid, failedRes] = await Promise.all([
        api()
          .post(`/api/v1/admin/payouts/${payout.id}/mark-paid`)
          .set('Authorization', finance)
          .send({ utr: 'UTR1' }),
        api()
          .post(`/api/v1/admin/payouts/${payout.id}/mark-failed`)
          .set('Authorization', finance)
          .send({ reason: 'bounced' }),
      ]);
      expect([paid.status, failedRes.status].sort()).toEqual([201, 409]);
      const loser = paid.status === 409 ? paid : failedRes;
      expect(loser.body.code).toBe('PAYOUT_FINAL');
      const final = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } });
      const reversals = await prisma.walletTransaction.count({
        where: { walletId: wallet.id, reason: 'PAYOUT_REVERSAL' },
      });
      expect(reversals).toBe(final.status === 'FAILED' ? 1 : 0);
    });

    it('never records concurrent cash deposits beyond what the rider owes', async () => {
      const RIDER = 'usr_rider_cash_race';
      await prisma.wallet.create({ data: { ownerType: 'RIDER', ownerId: RIDER, balance: -300 } });
      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          api()
            .post(`/api/v1/admin/rider-cash/${RIDER}/deposits`)
            .set('Authorization', finance)
            .send({ amount: 300 }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      const wallet = await prisma.wallet.findFirstOrThrow({ where: { ownerId: RIDER } });
      expect(Number(wallet.balance)).toBe(0);
    });
  });
});
