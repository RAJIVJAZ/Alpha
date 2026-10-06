import { randomUUID } from 'node:crypto';
import type { DbClient } from './client';
import { Prisma } from '../generated/client';

export interface OutboxMessage<T = unknown> {
  /** Logical stream, e.g. "order", "payment". Published to Redis as events:<stream>. */
  stream: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  tenantId?: string | null;
  payload: T;
}

/**
 * Writes a domain event to the transactional outbox. Call this inside the
 * same `$transaction` as the state change so that the event is published if
 * and only if the change commits.
 */
export async function enqueueOutbox<T>(
  db: DbClient,
  source: string,
  message: OutboxMessage<T>,
): Promise<string> {
  const id = randomUUID();
  await db.outboxEvent.create({
    data: {
      id,
      source,
      stream: message.stream,
      type: message.type,
      aggregateType: message.aggregateType,
      aggregateId: message.aggregateId,
      tenantId: message.tenantId ?? null,
      payload: JSON.parse(JSON.stringify(message.payload)) as Prisma.InputJsonValue,
    },
  });
  return id;
}
