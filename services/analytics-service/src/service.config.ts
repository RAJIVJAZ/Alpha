import type { EventStream } from '@foodgrid/types';
import type { ServiceBootstrapOptions } from '@foodgrid/utils/server';

export const SERVICE_NAME = 'analytics-service';

/** Event streams consumed by this service. */
export const SUBSCRIBED_STREAMS: EventStream[] = [
  'order',
  'delivery',
  'marketplace',
  'inventory',
  'identity',
];

export const SERVICE: ServiceBootstrapOptions = {
  name: SERVICE_NAME,
  title: 'FoodGrid Analytics Service',
  description:
    'Event-sourced analytics: GMV, revenue, orders, retention cohorts, restaurant profitability, supplier sales and rider performance.',
  defaultPort: 4009,
};
