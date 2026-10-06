import type { EventStream } from '@foodgrid/types';
import type { ServiceBootstrapOptions } from '@foodgrid/utils/server';

export const SERVICE_NAME = 'ai-service';

/** Event streams consumed by this service. */
export const SUBSCRIBED_STREAMS: EventStream[] = [];

export const SERVICE: ServiceBootstrapOptions = {
  name: SERVICE_NAME,
  title: 'FoodGrid AI Service',
  description: 'Demand forecasting, dynamic pricing, inventory optimisation, supplier recommendation, fraud detection, route optimisation, recommendations and outlet scoring.',
  defaultPort: 4012,
};
