import { DynamicModule, Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { EVENTS_MODULE_OPTIONS } from './constants';
import { EventConsumer } from './event-consumer';
import { EventPublisher } from './event-publisher';
import type { EventsModuleOptions } from './events.options';
import { OutboxRelay } from './outbox-relay';
import { OutboxService } from './outbox.service';

@Global()
@Module({})
export class EventsModule {
  static forRoot(options: EventsModuleOptions): DynamicModule {
    return {
      module: EventsModule,
      imports: [DiscoveryModule],
      providers: [
        { provide: EVENTS_MODULE_OPTIONS, useValue: options },
        EventPublisher,
        OutboxService,
        OutboxRelay,
        EventConsumer,
      ],
      exports: [EventPublisher, OutboxService, OutboxRelay, EventConsumer, EVENTS_MODULE_OPTIONS],
    };
  }
}
