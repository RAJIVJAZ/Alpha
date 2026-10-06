import type { EventStream } from '@foodgrid/types';
import type { ServiceBootstrapOptions } from '@foodgrid/utils/server';

export const SERVICE_NAME = 'auth-service';

/** Event streams consumed by this service. */
export const SUBSCRIBED_STREAMS: EventStream[] = [];

export const SERVICE: ServiceBootstrapOptions = {
  name: SERVICE_NAME,
  title: 'FoodGrid Auth Service',
  description: 'OTP, Google and password login; JWT access/refresh token lifecycle; tenant switching; JWKS.',
  defaultPort: 4001,
};
