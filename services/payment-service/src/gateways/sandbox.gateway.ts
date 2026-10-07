import { randomBytes } from 'node:crypto';
import { signCheckout, verifyCheckoutSignature, verifyWebhookSignature } from '../domain/signature';
import { GatewayOrder, GatewayPayment, GatewayRefund, PaymentGateway } from './payment-gateway';

export const SANDBOX_SECRET = 'sandbox_key_secret';

/**
 * Deterministic in-process gateway used when Razorpay keys are not configured
 * (local development, CI). Mirrors Razorpay's signature scheme so the exact
 * same verification code path runs.
 */
export class SandboxGateway implements PaymentGateway {
  readonly provider = 'RAZORPAY' as const;
  readonly keyId = 'rzp_test_sandbox';
  readonly sandbox = true;
  private readonly payments = new Map<string, GatewayPayment>();

  async createOrder(input: { amountPaise: number }): Promise<GatewayOrder> {
    return {
      id: `order_sbx_${randomBytes(7).toString('hex')}`,
      amount: input.amountPaise,
      currency: 'INR',
    };
  }

  /** Simulates the customer completing checkout. */
  simulate(orderId: string, amountPaise: number, success: boolean, method = 'upi') {
    const paymentId = `pay_sbx_${randomBytes(7).toString('hex')}`;
    this.payments.set(paymentId, {
      id: paymentId,
      orderId,
      status: success ? 'captured' : 'failed',
      method,
      amount: amountPaise,
      errorCode: success ? null : 'BAD_REQUEST_ERROR',
      errorDescription: success ? null : 'Payment declined by sandbox',
    });
    return { paymentId, signature: signCheckout(SANDBOX_SECRET, orderId, paymentId) };
  }

  verifyCheckout(orderId: string, paymentId: string, signature: string): boolean {
    return verifyCheckoutSignature(SANDBOX_SECRET, orderId, paymentId, signature);
  }

  verifyWebhook(rawBody: Buffer | string, signature: string): boolean {
    return verifyWebhookSignature(SANDBOX_SECRET, rawBody, signature);
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    return (
      this.payments.get(paymentId) ?? {
        id: paymentId,
        orderId: null,
        status: 'captured',
        method: 'upi',
        amount: 0,
      }
    );
  }

  async capture(paymentId: string): Promise<GatewayPayment> {
    const p = await this.fetchPayment(paymentId);
    p.status = 'captured';
    return p;
  }

  async refund(): Promise<GatewayRefund> {
    return { id: `rfnd_sbx_${randomBytes(7).toString('hex')}`, status: 'processed' };
  }
}
