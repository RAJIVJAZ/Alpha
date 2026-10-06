import { signCheckout, verifyCheckoutSignature, verifyWebhookSignature } from './signature';
import { createHmac } from 'node:crypto';

describe('Razorpay signatures', () => {
  it('verifies checkout signatures', () => {
    const sig = signCheckout('secret', 'order_123', 'pay_456');
    expect(verifyCheckoutSignature('secret', 'order_123', 'pay_456', sig)).toBe(true);
    expect(verifyCheckoutSignature('secret', 'order_123', 'pay_457', sig)).toBe(false);
    expect(verifyCheckoutSignature('other', 'order_123', 'pay_456', sig)).toBe(false);
  });
  it('verifies webhook signatures over the raw body', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    const sig = createHmac('sha256', 'whsec').update(body).digest('hex');
    expect(verifyWebhookSignature('whsec', body, sig)).toBe(true);
    expect(verifyWebhookSignature('whsec', `${body} `, sig)).toBe(false);
  });
});
