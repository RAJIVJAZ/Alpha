export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
}

export interface GatewayPayment {
  id: string;
  orderId: string | null;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method: string | null;
  amount: number;
  errorCode?: string | null;
  errorDescription?: string | null;
}

export interface GatewayRefund {
  id: string;
  status: 'pending' | 'processed' | 'failed';
}

/** Abstraction over Razorpay so the sandbox can stand in locally and in tests. */
export interface PaymentGateway {
  readonly provider: 'RAZORPAY';
  readonly keyId: string;
  readonly sandbox: boolean;
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<GatewayOrder>;
  verifyCheckout(orderId: string, paymentId: string, signature: string): boolean;
  verifyWebhook(rawBody: Buffer | string, signature: string): boolean;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  capture(paymentId: string, amountPaise: number): Promise<GatewayPayment>;
  refund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<GatewayRefund>;
}

/** Maps a Razorpay method string to our PaymentMethod enum. */
export function mapMethod(method: string | null | undefined): 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET' | null {
  switch (method) {
    case 'upi':
      return 'UPI';
    case 'card':
    case 'emi':
      return 'CARD';
    case 'netbanking':
      return 'NETBANKING';
    case 'wallet':
      return 'WALLET';
    default:
      return null;
  }
}
