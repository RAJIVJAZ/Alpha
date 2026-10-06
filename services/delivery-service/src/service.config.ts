import type { EventStream } from '@foodgrid/types';
import type { ServiceBootstrapOptions } from '@foodgrid/utils/server';

export const SERVICE_NAME = 'delivery-service';

/** Event streams consumed by this service. */
export const SUBSCRIBED_STREAMS: EventStream[] = ['order', 'identity'];

export const SERVICE: ServiceBootstrapOptions = {
  name: SERVICE_NAME,
  title: 'FoodGrid Delivery Service',
  description: 'Riders, dispatch & offers, live tracking, navigation routes, proof of delivery, attendance, earnings, incentives and heat maps.',
  defaultPort: 4007,
};
