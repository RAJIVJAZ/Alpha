import type { EventStream } from '@foodgrid/types';

export interface EventsModuleOptions {
  serviceName: string;
  /** Streams this service consumes. */
  subscribe: EventStream[];
  consumerEnabled: boolean;
  relayEnabled: boolean;
  relayIntervalMs?: number;
}
