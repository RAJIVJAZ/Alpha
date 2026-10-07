import type { EventStream } from '@foodgrid/types';
import type { ServiceBootstrapOptions } from '@foodgrid/utils/server';

export const SERVICE_NAME = 'order-service';

/** Event streams consumed by this service. */
export const SUBSCRIBED_STREAMS: EventStream[] = ['payment', 'delivery', 'identity'];

export const SERVICE: ServiceBootstrapOptions = {
  name: SERVICE_NAME,
  title: 'FoodGrid Order Service',
  description:
    'Outlets, menus, search, cart, checkout, order lifecycle, KDS, POS, QR ordering, coupons, reviews, meal subscriptions, memberships.',
  defaultPort: 4003,
};
