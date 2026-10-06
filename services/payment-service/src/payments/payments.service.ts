import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { Prisma } from '@foodgrid/database';
import type { Payment, PaymentMethod } from '@foodgrid/database';
import { AccessTokenClaims, EventTypes, PaymentEvent, RefundProcessedEvent } from '@foodgrid/types';
import { AppError, conflict, forbidden, money, normalizePage, notFound, paginate, round2 } from '@foodgrid/utils';
import { businessCounter, OutboxService } from '@foodgrid/utils/server';
import { toPaise } from '../domain/signature';
import { mapMethod, PAYMENT_GATEWAY, PaymentGateway } from '../gateways/payment-gateway';
import { SandboxGateway } from '../gateways/sandbox.gateway';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';
import { CreatePaymentIntentDto, ListPaymentsDto, RefundDto, VerifyPaymentDto } from './dto/payment.dto';
import { PayableResolver } from './payable.resolver';

type Tx = Prisma.TransactionClient;

const captured = businessCounter('payments_captured_total', 'Captured payments', ['purpose', 'method']);
const failed = businessCounter('payments_failed_total', 'Failed payments', ['purpose']);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
    private readonly payables: PayableResolver,
    private readonly outbox: OutboxService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  /**
   * Starts a payment. WALLET payments settle immediately; online methods
   * return Razorpay Checkout options for the client SDK (web / Flutter).
   */
  async createIntent(user: AccessTokenClaims, dto: CreatePaymentIntentDto, idempotencyKey?: string) {
    let amount: number;
    let referenceId: string;
    let tenantId: string | null = null;
    let description: string;

    if (dto.purpose === 'WALLET_TOPUP') {
      if (dto.method === 'WALLET') throw conflict('Cannot top up the wallet from the wallet', 'INVALID_METHOD');
      if (!dto.amount) throw conflict('amount is required for a wallet top-up', 'AMOUNT_REQUIRED');
      amount = round2(dto.amount);
      referenceId = user.sub;
      description = 'Wallet top-up';
    } else {
      const payable = await this.payables.resolve(dto.purpose, dto.referenceId, user.sub);
      amount = Number(payable.amount);
      referenceId = payable.referenceId;
      tenantId = payable.tenantId;
      description = payable.description;
    }

    // Re-use an open intent for the same reference instead of creating duplicates.
    const open = await this.prisma.payment.findFirst({
      where: { purpose: dto.purpose, referenceId, userId: user.sub, state: 'CREATED', provider: 'RAZORPAY' },
      orderBy: { createdAt: 'desc' },
    });
    if (open && dto.method !== 'WALLET' && Number(open.amount) === amount) return this.checkoutResponse(open, user, description);

    if (dto.method === 'WALLET') return this.payFromWallet(user, dto, referenceId, tenantId, amount, idempotencyKey);

    const payment = await this.prisma.payment.create({
      data: {
        purpose: dto.purpose,
        referenceId,
        userId: user.sub,
        tenantId,
        amount,
        method: dto.method as PaymentMethod,
        provider: 'RAZORPAY',
        idempotencyKey: idempotencyKey ? `${user.sub}:${idempotencyKey}` : undefined,
        metadata: { description },
      },
    });
    const order = await this.gateway.createOrder({
      amountPaise: toPaise(amount),
      receipt: payment.id,
      notes: { paymentId: payment.id, purpose: dto.purpose, referenceId },
    });
    const updated = await this.prisma.payment.update({ where: { id: payment.id }, data: { providerOrderId: order.id } });
    return this.checkoutResponse(updated, user, description);
  }

  private checkoutResponse(payment: Payment, user: AccessTokenClaims, description: string) {
    return {
      paymentId: payment.id,
      state: payment.state,
      provider: payment.provider,
      amount: money(payment.amount.toString()),
      sandbox: this.gateway.sandbox,
      checkout: {
        key: this.gateway.keyId,
        order_id: payment.providerOrderId,
        amount: toPaise(payment.amount.toString()),
        currency: 'INR',
        name: 'FoodGrid',
        description,
        prefill: { contact: user.phone, name: user.name },
        method: payment.method ? { [payment.method.toLowerCase()]: true } : undefined,
        notes: { paymentId: payment.id },
        theme: { color: '#F97316' },
      },
    };
  }

  private async payFromWallet(
    user: AccessTokenClaims,
    dto: CreatePaymentIntentDto,
    referenceId: string,
    tenantId: string | null,
    amount: number,
    idempotencyKey?: string,
  ) {
    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          purpose: dto.purpose,
          referenceId,
          userId: user.sub,
          tenantId,
          amount,
          method: 'WALLET',
          provider: 'WALLET',
          idempotencyKey: idempotencyKey ? `${user.sub}:${idempotencyKey}` : undefined,
        },
      });
      await this.ledger.debit(
        {
          ownerType: 'CUSTOMER',
          ownerId: user.sub,
          amount,
          reason:
            dto.purpose === 'MEMBERSHIP' ? 'MEMBERSHIP_PURCHASE' : dto.purpose === 'MEAL_SUBSCRIPTION' ? 'SUBSCRIPTION_PURCHASE' : 'ORDER_PAYMENT',
          idempotencyKey: `pay:${p.id}`,
          referenceType: dto.purpose,
          referenceId,
          description: `Payment for ${dto.purpose.toLowerCase().replace('_', ' ')}`,
        },
        tx,
      );
      return this.markCaptured(tx, p, null, 'WALLET');
    });
    return { paymentId: payment.id, state: payment.state, provider: 'WALLET', amount: money(amount), checkout: null };
  }

  /** Client-side confirmation after Razorpay Checkout succeeds. */
  async verify(user: AccessTokenClaims, dto: VerifyPaymentDto) {
    const payment = await this.prisma.payment.findUnique({ where: { id: dto.paymentId } });
    if (!payment || payment.userId !== user.sub) throw notFound('Payment', dto.paymentId);
    if (payment.providerOrderId !== dto.razorpayOrderId) throw new AppError('ORDER_MISMATCH', 'Payment does not match the order', 400);
    if (!this.gateway.verifyCheckout(dto.razorpayOrderId, dto.razorpayPaymentId, dto.razorpaySignature)) {
      throw new AppError('SIGNATURE_INVALID', 'Payment signature verification failed', 400);
    }
    if (payment.state === 'CAPTURED') return payment;
    const remote = await this.gateway.fetchPayment(dto.razorpayPaymentId);
    if (remote.status === 'failed') return this.fail(payment.id, remote.errorDescription ?? 'Payment failed', remote.errorCode);
    if (remote.status === 'authorized') await this.gateway.capture(remote.id, toPaise(payment.amount.toString()));
    return this.prisma.$transaction((tx) =>
      this.markCaptured(tx, payment, dto.razorpayPaymentId, mapMethod(remote.method) ?? payment.method, dto.razorpaySignature),
    );
  }

  /** Dev/test only: completes a sandbox checkout end-to-end. */
  async sandboxComplete(user: AccessTokenClaims, paymentId: string, success: boolean, method = 'upi') {
    if (!(this.gateway instanceof SandboxGateway)) throw forbidden('Sandbox is disabled', 'SANDBOX_DISABLED');
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.userId !== user.sub || !payment.providerOrderId) throw notFound('Payment', paymentId);
    const sim = this.gateway.simulate(payment.providerOrderId, toPaise(payment.amount.toString()), success, method);
    return this.verify(user, {
      paymentId,
      razorpayOrderId: payment.providerOrderId,
      razorpayPaymentId: sim.paymentId,
      razorpaySignature: sim.signature,
    });
  }

  async markCaptured(tx: Tx, payment: Payment, providerPaymentId: string | null, method: PaymentMethod | null, signature?: string) {
    const res = await tx.payment.updateMany({
      where: { id: payment.id, state: { in: ['CREATED', 'AUTHORIZED', 'FAILED'] } },
      data: { state: 'CAPTURED', capturedAt: new Date(), providerPaymentId, providerSignature: signature, method: method ?? undefined },
    });
    const updated = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (res.count === 0) return updated; // already captured (webhook vs client race)

    if (payment.purpose === 'WALLET_TOPUP') {
      await this.ledger.credit(
        {
          ownerType: 'CUSTOMER',
          ownerId: payment.userId!,
          amount: Number(payment.amount),
          reason: 'TOPUP',
          idempotencyKey: `topup:${payment.id}`,
          referenceType: 'PAYMENT',
          referenceId: payment.id,
          description: 'Wallet top-up',
        },
        tx,
      );
    }
    await this.outbox.enqueue<PaymentEvent>(tx, {
      stream: 'payment',
      type: EventTypes.PaymentCaptured,
      aggregateType: 'Payment',
      aggregateId: payment.id,
      tenantId: payment.tenantId,
      data: this.eventData(updated),
    });
    captured.inc({ purpose: payment.purpose, method: updated.method ?? 'UNKNOWN' });
    return updated;
  }

  async fail(paymentId: string, reason: string, code?: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.payment.updateMany({
        where: { id: paymentId, state: { in: ['CREATED', 'AUTHORIZED'] } },
        data: { state: 'FAILED', failureReason: reason, failureCode: code },
      });
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (res.count) {
        await this.outbox.enqueue<PaymentEvent>(tx, {
          stream: 'payment',
          type: EventTypes.PaymentFailed,
          aggregateType: 'Payment',
          aggregateId: paymentId,
          tenantId: payment.tenantId,
          data: { ...this.eventData(payment), reason },
        });
        failed.inc({ purpose: payment.purpose });
      }
      return payment;
    });
  }

  /**
   * Refunds to the original instrument (Razorpay) or instantly to the wallet.
   * Wallet-funded payments always refund to the wallet.
   */
  async refund(paymentId: string, dto: RefundDto, initiatedBy: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw notFound('Payment', paymentId);
    if (!['CAPTURED', 'PARTIALLY_REFUNDED'].includes(payment.state)) throw conflict('Payment is not refundable', 'NOT_REFUNDABLE');
    const refundable = round2(Number(payment.amount) - Number(payment.refundedAmount));
    const amount = round2(dto.amount ?? refundable);
    if (amount <= 0 || amount > refundable) throw conflict(`At most ₹${refundable} can be refunded`, 'REFUND_EXCEEDS');
    const toWallet = payment.provider === 'WALLET' || !!dto.toWallet;

    const refund = await this.prisma.refund.create({
      data: { paymentId, amount, reason: dto.reason, toWallet, initiatedBy },
    });
    if (toWallet) {
      if (!payment.userId) throw conflict('Payment has no wallet owner', 'NO_WALLET');
      return this.prisma.$transaction(async (tx) => {
        await this.ledger.credit(
          {
            ownerType: 'CUSTOMER',
            ownerId: payment.userId!,
            amount,
            reason: 'ORDER_REFUND',
            idempotencyKey: `refund:${refund.id}`,
            referenceType: payment.purpose,
            referenceId: payment.referenceId,
            description: dto.reason,
          },
          tx,
        );
        return this.completeRefund(tx, refund.id, null);
      });
    }
    try {
      const remote = await this.gateway.refund(payment.providerPaymentId!, Math.round(amount * 100), {
        refundId: refund.id,
        reason: dto.reason.slice(0, 200),
      });
      await this.prisma.refund.update({ where: { id: refund.id }, data: { providerRefundId: remote.id } });
      if (remote.status === 'processed') return this.prisma.$transaction((tx) => this.completeRefund(tx, refund.id, remote.id));
      return this.prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    } catch (err) {
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } });
      this.logger.error(`Refund ${refund.id} failed: ${(err as Error).message}`);
      throw new AppError('REFUND_FAILED', 'The refund could not be initiated', 502);
    }
  }

  /** Marks a refund processed and updates the payment totals (idempotent). */
  async completeRefund(tx: Tx, refundId: string, providerRefundId: string | null) {
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
    if (refund.status === 'PROCESSED') return refund;
    await tx.refund.update({
      where: { id: refundId },
      data: { status: 'PROCESSED', processedAt: new Date(), providerRefundId: providerRefundId ?? refund.providerRefundId },
    });
    const refundedAmount = round2(Number(refund.payment.refundedAmount) + Number(refund.amount));
    const payment = await tx.payment.update({
      where: { id: refund.paymentId },
      data: {
        refundedAmount,
        state: refundedAmount >= Number(refund.payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      },
    });
    await this.outbox.enqueue<RefundProcessedEvent>(tx, {
      stream: 'payment',
      type: EventTypes.RefundProcessed,
      aggregateType: 'Refund',
      aggregateId: refundId,
      tenantId: payment.tenantId,
      data: {
        refundId,
        paymentId: payment.id,
        purpose: payment.purpose,
        referenceId: payment.referenceId,
        amount: money(refund.amount.toString()),
        toWallet: refund.toWallet,
      },
    });
    return tx.refund.findUniqueOrThrow({ where: { id: refundId } });
  }

  /** Full refund of every captured payment for a reference (order cancellations). */
  async refundAllFor(purpose: Payment['purpose'], referenceId: string, reason: string) {
    const payments = await this.prisma.payment.findMany({
      where: { purpose, referenceId, state: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } },
    });
    for (const p of payments) await this.refund(p.id, { reason }, 'system');
    return payments.length;
  }

  async listMine(userId: string, q: ListPaymentsDto) {
    const { page, pageSize, skip, take } = normalizePage(q);
    const where: Prisma.PaymentWhereInput = { userId, purpose: q.purpose, referenceId: q.referenceId };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { refunds: true } }),
      this.prisma.payment.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }

  async listAdmin(q: ListPaymentsDto) {
    const { page, pageSize, skip, take } = normalizePage(q);
    const where: Prisma.PaymentWhereInput = {
      purpose: q.purpose,
      referenceId: q.referenceId,
      state: q.state as Prisma.PaymentWhereInput['state'],
    };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { refunds: true } }),
      this.prisma.payment.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }

  async get(user: AccessTokenClaims, id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { refunds: true } });
    if (!payment || (payment.userId !== user.sub && !user.roles.some((r) => ['ADMIN', 'FINANCE', 'SUPPORT'].includes(r)))) {
      throw notFound('Payment', id);
    }
    return payment;
  }

  private eventData(p: Payment): PaymentEvent {
    return {
      paymentId: p.id,
      purpose: p.purpose,
      referenceId: p.referenceId,
      userId: p.userId,
      tenantId: p.tenantId,
      amount: money(p.amount.toString()),
      method: p.method,
    };
  }
}
