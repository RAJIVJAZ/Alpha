import { SetMetadata } from '@nestjs/common';

export const DOMAIN_EVENT_HANDLER_KEY = 'events:domainEventHandler';

/**
 * Marks a provider method as a handler for one or more domain event types.
 * Handlers receive the full EventEnvelope and MUST be idempotent: delivery is
 * at-least-once, although the consumer de-duplicates per handler using
 * platform.ProcessedEvent.
 */
export const OnDomainEvent = (...types: string[]) => SetMetadata(DOMAIN_EVENT_HANDLER_KEY, types);
