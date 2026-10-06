import type { EventStream } from '@foodgrid/types';
import type { ServiceBootstrapOptions } from '@foodgrid/utils/server';

export const SERVICE_NAME = 'notification-service';

/** Event streams consumed by this service. */
export const SUBSCRIBED_STREAMS: EventStream[] = ['order', 'payment', 'delivery', 'inventory', 'procurement', 'marketplace', 'identity'];

export const SERVICE: ServiceBootstrapOptions = {
  name: SERVICE_NAME,
  title: 'FoodGrid Notification Service',
  description: 'Push (FCM), SMS, email and in-app notifications, templates, device tokens, push campaigns.',
  defaultPort: 4011,
};
