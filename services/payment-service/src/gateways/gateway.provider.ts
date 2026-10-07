import { Logger, Provider } from '@nestjs/common';
import { PAYMENT_GATEWAY, PaymentGateway } from './payment-gateway';
import { RazorpayGateway } from './razorpay.gateway';
import { SandboxGateway } from './sandbox.gateway';

export const paymentGatewayProvider: Provider = {
  provide: PAYMENT_GATEWAY,
  useFactory: (): PaymentGateway => {
    const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, NODE_ENV } = process.env;
    if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
      return new RazorpayGateway(
        RAZORPAY_KEY_ID,
        RAZORPAY_KEY_SECRET,
        RAZORPAY_WEBHOOK_SECRET ?? '',
      );
    }
    if (NODE_ENV === 'production')
      throw new Error('Razorpay credentials are required in production');
    new Logger('PaymentGateway').warn('Razorpay keys not set — using the sandbox gateway');
    return new SandboxGateway();
  },
};
