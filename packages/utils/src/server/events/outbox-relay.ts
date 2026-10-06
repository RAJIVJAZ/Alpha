import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { EventEnvelope, EventStream } from '@foodgrid/types';
import { EVENTS_MODULE_OPTIONS } from './constants';
import { EventPublisher } from './event-publisher';
import type { EventsModuleOptions } from './events.options';

interface OutboxRow {
  id: string;
  source: string;
  stream: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  tenantId: string | null;
  payload: unknown;
  occurredAt: Date;
}

/**
 * Polls this service's unpublished outbox rows and relays them to Redis
 * Streams. Rows are locked with SKIP LOCKED so multiple replicas can relay
 * concurrently without double-processing a batch.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private lastCleanup = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: EventPublisher,
    @Inject(EVENTS_MODULE_OPTIONS) private readonly options: EventsModuleOptions,
  ) {}

  onApplicationBootstrap() {
    if (!this.options.relayEnabled) return;
    const tick = async () => {
      if (this.stopped) return;
      let published = 0;
      try {
        published = await this.flush();
        await this.cleanup();
      } catch (err) {
        this.logger.error(`Outbox relay failed: ${(err as Error).message}`);
      }
      // drain quickly while there is a backlog, otherwise poll at the interval
      this.timer = setTimeout(tick, published > 0 ? 10 : (this.options.relayIntervalMs ?? 500));
    };
    this.timer = setTimeout(tick, 100);
  }

  onApplicationShutdown() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** Publishes up to `limit` pending events. Returns the number relayed. */
  async flush(limit = 200): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>`
        SELECT "id", "source", "stream", "type", "aggregateType", "aggregateId", "tenantId", "payload", "occurredAt"
        FROM "platform"."OutboxEvent"
        WHERE "source" = ${this.options.serviceName} AND "publishedAt" IS NULL
        ORDER BY "occurredAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return 0;
      for (const row of rows) {
        const envelope: EventEnvelope = {
          id: row.id,
          type: row.type,
          source: row.source,
          stream: row.stream as EventStream,
          occurredAt: new Date(row.occurredAt).toISOString(),
          tenantId: row.tenantId,
          aggregateType: row.aggregateType,
          aggregateId: row.aggregateId,
          data: row.payload,
          version: 1,
        };
        await this.publisher.publish(envelope);
      }
      await tx.outboxEvent.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { publishedAt: new Date(), attempts: { increment: 1 } },
      });
      return rows.length;
    });
  }

  /** Removes relayed rows older than 7 days (hourly). */
  private async cleanup() {
    if (Date.now() - this.lastCleanup < 3_600_000) return;
    this.lastCleanup = Date.now();
    await this.prisma.outboxEvent.deleteMany({
      where: {
        source: this.options.serviceName,
        publishedAt: { lt: new Date(Date.now() - 7 * 86_400_000) },
      },
    });
  }
}
