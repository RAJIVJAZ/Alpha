import { createHmac, timingSafeEqual } from 'node:crypto';

const hmac = (secret: string, payload: string | Buffer) =>
  createHmac('sha256', secret).update(payload).digest('hex');

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Razorpay Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(
  secret: string,
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  return safeEq(hmac(secret, `${orderId}|${paymentId}`), signature);
}

export function signCheckout(secret: string, orderId: string, paymentId: string): string {
  return hmac(secret, `${orderId}|${paymentId}`);
}

/** Razorpay webhook signature: HMAC_SHA256(raw request body, webhook_secret). */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string | Buffer,
  signature: string,
): boolean {
  return safeEq(hmac(secret, rawBody), signature);
}

export const toPaise = (amount: number | string) => Math.round(Number(amount) * 100);
