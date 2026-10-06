import type { EventStream } from '@foodgrid/types';
import type { ServiceBootstrapOptions } from '@foodgrid/utils/server';

export const SERVICE_NAME = 'inventory-service';

/** Event streams consumed by this service. */
export const SUBSCRIBED_STREAMS: EventStream[] = ['order', 'procurement'];

export const SERVICE: ServiceBootstrapOptions = {
  name: SERVICE_NAME,
  title: 'FoodGrid Inventory Service',
  description: 'Ingredients, FEFO stock batches, stock ledger, consumption tracking, recipes, costing and production planning.',
  defaultPort: 4005,
};
