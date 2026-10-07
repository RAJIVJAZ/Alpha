import Razorpay from 'razorpay';
import { verifyCheckoutSignature, verifyWebhookSignature } from '../domain/signature';
import { GatewayOrder, GatewayPayment, GatewayRefund, PaymentGateway } from './payment-gateway';

interface RazorpayPaymentEntity {
  id: string;
  order_id?: string | null;
  status: GatewayPayment['status'];
  method?: string | null;
  amount: number | string;
  error_code?: string | null;
  error_description?: string | null;
}

/** Razorpay Orders API + Checkout (UPI, cards, netbanking, wallets). */
export class RazorpayGateway implements PaymentGateway {
  readonly provider = 'RAZORPAY' as const;
  readonly sandbox = false;
  private readonly client: Razorpay;

  constructor(
    readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createOrder(input: {
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<GatewayOrder> {
    const order = await this.client.orders.create({
      amount: input.amountPaise,
      currency: 'INR',
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
      payment_capture: true,
    } as never);
    return { id: order.id, amount: Number(order.amount), currency: order.currency };
  }

  verifyCheckout(orderId: string, paymentId: string, signature: string): boolean {
    return verifyCheckoutSignature(this.keySecret, orderId, paymentId, signature);
  }

  verifyWebhook(rawBody: Buffer | string, signature: string): boolean {
    return !!this.webhookSecret && verifyWebhookSignature(this.webhookSecret, rawBody, signature);
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    return this.map(
      (await this.client.payments.fetch(paymentId)) as unknown as RazorpayPaymentEntity,
    );
  }

  async capture(paymentId: string, amountPaise: number): Promise<GatewayPayment> {
    return this.map(
      (await this.client.payments.capture(
        paymentId,
        amountPaise,
        'INR',
      )) as unknown as RazorpayPaymentEntity,
    );
  }

  async refund(
    paymentId: string,
    amountPaise: number,
    notes: Record<string, string>,
  ): Promise<GatewayRefund> {
    const r = (await this.client.payments.refund(paymentId, {
      amount: amountPaise,
      notes,
      speed: 'optimum',
    } as never)) as {
      id: string;
      status: GatewayRefund['status'];
    };
    return { id: r.id, status: r.status };
  }

  private map(p: RazorpayPaymentEntity): GatewayPayment {
    return {
      id: p.id,
      orderId: p.order_id ?? null,
      status: p.status,
      method: p.method ?? null,
      amount: Number(p.amount),
      errorCode: p.error_code,
      errorDescription: p.error_description,
    };
  }
}
