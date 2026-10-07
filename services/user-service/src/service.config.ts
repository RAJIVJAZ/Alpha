import type { EventStream } from '@foodgrid/types';
import type { ServiceBootstrapOptions } from '@foodgrid/utils/server';

export const SERVICE_NAME = 'user-service';

/** Event streams consumed by this service. */
export const SUBSCRIBED_STREAMS: EventStream[] = [];

export const SERVICE: ServiceBootstrapOptions = {
  name: SERVICE_NAME,
  title: 'FoodGrid User Service',
  description:
    'Profiles, addresses, business tenants & staff, admin user management, approvals, CMS, media uploads.',
  defaultPort: 4002,
};
