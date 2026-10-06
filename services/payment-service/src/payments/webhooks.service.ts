import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { Prisma } from '@foodgrid/database';
import { AppError } from '@foodgrid/utils';
import { mapMethod, PAYMENT_GATEWAY, PaymentGateway } from '../gateways/payment-gateway';
import { PaymentsService } from './payments.service';

interface RazorpayWebhook {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string; method?: string; error_code?: string; error_description?: string } };
    refund?: { entity: { id: string; payment_id: string; status: string } };
  };
}

/**
 * Razorpay webhooks are the source of truth when the client never returns
 * from checkout. Every event is stored once (event id) for audit and replay.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  async handleRazorpay(rawBody: Buffer | undefined, signature: string | undefined, eventId: string | undefined) {
    if (!rawBody) throw new AppError('RAW_BODY_MISSING', 'Raw body required', 400);
    const valid = !!signature && this.gateway.verifyWebhook(rawBody, signature);
    const body = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhook;
    const id = eventId ?? `${body.event}:${body.payload.payment?.entity.id ?? body.payload.refund?.entity.id}`;

    try {
      await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: 'RAZORPAY',
          eventId: id,
          eventType: body.event,
          payload: body as unknown as Prisma.InputJsonValue,
          signatureValid: valid,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { status: 'duplicate' };
      throw err;
    }
    if (!valid) throw new AppError('SIGNATURE_INVALID', 'Invalid webhook signature', 400);

    try {
      await this.dispatch(body);
      await this.prisma.paymentWebhookEvent.update({ where: { eventId: id }, data: { processedAt: new Date() } });
    } catch (err) {
      await this.prisma.paymentWebhookEvent.update({ where: { eventId: id }, data: { error: (err as Error).message } });
      this.logger.error(`Webhook ${id} failed: ${(err as Error).message}`);
      throw err;
    }
    return { status: 'processed' };
  }

  private async dispatch(body: RazorpayWebhook) {
    const p = body.payload.payment?.entity;
    switch (body.event) {
      case 'payment.captured':
      case 'order.paid': {
        if (!p) return;
        const payment = await this.prisma.payment.findUnique({ where: { providerOrderId: p.order_id } });
        if (!payment) return;
        await this.prisma.$transaction((tx) => this.payments.markCaptured(tx, payment, p.id, mapMethod(p.method)));
        return;
      }
      case 'payment.failed': {
        if (!p) return;
        const payment = await this.prisma.payment.findUnique({ where: { providerOrderId: p.order_id } });
        if (payment) await this.payments.fail(payment.id, p.error_description ?? 'Payment failed', p.error_code);
        return;
      }
      case 'refund.processed': {
        const r = body.payload.refund?.entity;
        if (!r) return;
        const refund = await this.prisma.refund.findUnique({ where: { providerRefundId: r.id } });
        if (refund) await this.prisma.$transaction((tx) => this.payments.completeRefund(tx, refund.id, r.id));
        return;
      }
      case 'refund.failed': {
        const r = body.payload.refund?.entity;
        if (r) await this.prisma.refund.updateMany({ where: { providerRefundId: r.id }, data: { status: 'FAILED' } });
        return;
      }
      default:
        this.logger.debug(`Ignoring webhook ${body.event}`);
    }
  }
}
