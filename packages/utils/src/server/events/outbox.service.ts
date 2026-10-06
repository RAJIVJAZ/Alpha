import { Inject, Injectable } from '@nestjs/common';
import { DbClient, enqueueOutbox } from '@foodgrid/database';
import type { EventStream } from '@foodgrid/types';
import { EVENTS_MODULE_OPTIONS } from './constants';
import type { EventsModuleOptions } from './events.options';

export interface DomainEventInput<T> {
  stream: EventStream;
  type: string;
  aggregateType: string;
  aggregateId: string;
  tenantId?: string | null;
  data: T;
}

/** Enqueues events into the transactional outbox, stamped with this service as source. */
@Injectable()
export class OutboxService {
  constructor(@Inject(EVENTS_MODULE_OPTIONS) private readonly options: EventsModuleOptions) {}

  enqueue<T>(db: DbClient, event: DomainEventInput<T>): Promise<string> {
    return enqueueOutbox(db, this.options.serviceName, {
      stream: event.stream,
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      tenantId: event.tenantId,
      payload: event.data,
    });
  }
}
