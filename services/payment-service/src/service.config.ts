import type { EventStream } from '@foodgrid/types';
import type { ServiceBootstrapOptions } from '@foodgrid/utils/server';

export const SERVICE_NAME = 'payment-service';

/** Event streams consumed by this service. */
export const SUBSCRIBED_STREAMS: EventStream[] = ['order', 'delivery', 'marketplace'];

export const SERVICE: ServiceBootstrapOptions = {
  name: SERVICE_NAME,
  title: 'FoodGrid Payment Service',
  description: 'Razorpay/UPI/card payments, wallets & ledger, refunds, commissions, settlements, payouts, GST invoices & reports.',
  defaultPort: 4004,
};
