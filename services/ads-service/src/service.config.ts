import type { EventStream } from '@foodgrid/types';
import type { ServiceBootstrapOptions } from '@foodgrid/utils/server';

export const SERVICE_NAME = 'ads-service';

/** Event streams consumed by this service. */
export const SUBSCRIBED_STREAMS: EventStream[] = ['order', 'identity'];

export const SERVICE: ServiceBootstrapOptions = {
  name: SERVICE_NAME,
  title: 'FoodGrid Ads Service',
  description:
    'Sponsored listings: campaigns, auctions, budget pacing, impression/click/conversion tracking.',
  defaultPort: 4010,
};
