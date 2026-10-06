import type { EventStream } from '@foodgrid/types';
import type { ServiceBootstrapOptions } from '@foodgrid/utils/server';

export const SERVICE_NAME = 'supplier-service';

/** Event streams consumed by this service. */
export const SUBSCRIBED_STREAMS: EventStream[] = ['procurement', 'identity'];

export const SERVICE: ServiceBootstrapOptions = {
  name: SERVICE_NAME,
  title: 'FoodGrid Supplier Service',
  description: 'B2B marketplace for suppliers, wholesalers and retailers: catalog, bulk pricing, MOQ, zones, slots, territories, dealers and B2B orders.',
  defaultPort: 4008,
};
