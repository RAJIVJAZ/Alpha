import type { EventStream } from '@foodgrid/types';
import type { ServiceBootstrapOptions } from '@foodgrid/utils/server';

export const SERVICE_NAME = 'procurement-service';

/** Event streams consumed by this service. */
export const SUBSCRIBED_STREAMS: EventStream[] = ['inventory', 'marketplace'];

export const SERVICE: ServiceBootstrapOptions = {
  name: SERVICE_NAME,
  title: 'FoodGrid Procurement Service',
  description: 'Smart procurement engine: demand forecasts, depletion prediction, reorder alerts, supplier comparison, auto purchase orders, approvals and PO tracking.',
  defaultPort: 4006,
};
