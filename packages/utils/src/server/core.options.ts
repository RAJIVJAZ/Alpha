import type { EventStream } from '@foodgrid/types';

export const CORE_MODULE_OPTIONS = Symbol('CORE_MODULE_OPTIONS');

export interface CoreModuleOptions {
  serviceName: string;
  internalSecret: string;
  subscribe: EventStream[];
}
