import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PrismaService } from '@foodgrid/database/nest';
import { Prisma } from '@foodgrid/database';
import { EventEnvelope, streamKey } from '@foodgrid/types';
import Redis from 'ioredis';
import { hostname } from 'node:os';
import { REDIS } from '../redis.module';
import { eventsProcessed } from '../metrics';
import { DEAD_LETTER_STREAM, EVENTS_MODULE_OPTIONS, MAX_DELIVERIES } from './constants';
import { DOMAIN_EVENT_HANDLER_KEY } from './on-domain-event.decorator';
import type { EventsModuleOptions } from './events.options';

interface RegisteredHandler {
  name: string;
  invoke: (envelope: EventEnvelope) => Promise<unknown>;
}

type StreamEntry = [id: string, fields: string[]];

/**
 * Redis Streams consumer-group worker. One consumer group per service; each
 * replica is a separate consumer. Failed messages stay pending and are
 * re-claimed after 30s; after MAX_DELIVERIES attempts they are moved to the
 * dead-letter stream.
 */
@Injectable()
export class EventConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EventConsumer.name);
  private readonly handlers = new Map<string, RegisteredHandler[]>();
  private readonly consumerName = `${hostname()}-${process.pid}`;
  private blocking?: Redis;
  private running = false;
  private reclaimTimer?: NodeJS.Timeout;
  private loopPromise?: Promise<void>;

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(EVENTS_MODULE_OPTIONS) private readonly options: EventsModuleOptions,
  ) {}

  get group() {
    return this.options.serviceName;
  }

  private get keys() {
    return this.options.subscribe.map(streamKey);
  }

  registeredTypes(): string[] {
    return [...this.handlers.keys()];
  }

  async onApplicationBootstrap() {
    this.discoverHandlers();
    if (!this.options.consumerEnabled || !this.keys.length) return;
    for (const key of this.keys) {
      try {
        await this.redis.xgroup('CREATE', key, this.group, '0', 'MKSTREAM');
      } catch (err) {
        if (!String((err as Error).message).includes('BUSYGROUP')) throw err;
      }
    }
    this.blocking = this.redis.duplicate();
    this.running = true;
    this.loopPromise = this.loop();
    this.reclaimTimer = setInterval(() => void this.reclaim(), 15_000);
    this.logger.log(
      `Consuming ${this.keys.join(', ')} as ${this.group}/${this.consumerName} (${this.handlers.size} event types)`,
    );
  }

  async onApplicationShutdown() {
    this.running = false;
    if (this.reclaimTimer) clearInterval(this.reclaimTimer);
    this.blocking?.disconnect();
    await this.loopPromise?.catch(() => undefined);
  }

  private discoverHandlers() {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      if (!instance || typeof instance !== 'object') continue;
      const proto = Object.getPrototypeOf(instance);
      for (const method of this.scanner.getAllMethodNames(proto)) {
        const types = this.reflector.get<string[] | undefined>(DOMAIN_EVENT_HANDLER_KEY, proto[method]);
        if (!types?.length) continue;
        const name = `${proto.constructor.name}.${method}`;
        for (const type of types) {
          const list = this.handlers.get(type) ?? [];
          list.push({ name, invoke: (env) => (instance[method] as (e: EventEnvelope) => Promise<unknown>).call(instance, env) });
          this.handlers.set(type, list);
        }
      }
    }
  }

  private async loop() {
    while (this.running && this.blocking) {
      try {
        const res = (await this.blocking.xreadgroup(
          'GROUP',
          this.group,
          this.consumerName,
          'COUNT',
          50,
          'BLOCK',
          2000,
          'STREAMS',
          ...this.keys,
          ...this.keys.map(() => '>'),
        )) as [string, StreamEntry[]][] | null;
        if (!res) continue;
        for (const [key, entries] of res) {
          for (const entry of entries) await this.process(key, entry);
        }
      } catch (err) {
        if (!this.running) break;
        this.logger.error(`Consumer loop error: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private async process(key: string, [entryId, fields]: StreamEntry) {
    const raw = fieldValue(fields, 'envelope');
    if (!raw) {
      await this.redis.xack(key, this.group, entryId);
      return;
    }
    try {
      await this.dispatch(JSON.parse(raw) as EventEnvelope);
      await this.redis.xack(key, this.group, entryId);
    } catch (err) {
      this.logger.warn(`Event ${entryId} on ${key} failed: ${(err as Error).message}`);
    }
  }

  /**
   * Runs every handler registered for the envelope's type, skipping handlers
   * that already processed this event id. Public so tests can drive it.
   */
  async dispatch(envelope: EventEnvelope): Promise<void> {
    const handlers = this.handlers.get(envelope.type) ?? [];
    for (const handler of handlers) {
      const consumer = `${this.group}:${handler.name}`;
      const already = await this.prisma.processedEvent.findUnique({
        where: { consumer_eventId: { consumer, eventId: envelope.id } },
      });
      if (already) continue;
      try {
        await handler.invoke(envelope);
        eventsProcessed.inc({ type: envelope.type, outcome: 'success' });
      } catch (err) {
        eventsProcessed.inc({ type: envelope.type, outcome: 'error' });
        throw err;
      }
      await this.prisma.processedEvent
        .create({ data: { consumer, eventId: envelope.id, eventType: envelope.type } })
        .catch((err: unknown) => {
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
        });
    }
  }

  private async reclaim() {
    for (const key of this.keys) {
      try {
        const pending = (await this.redis.xpending(key, this.group, 'IDLE', 30_000, '-', '+', 50)) as [
          string,
          string,
          number,
          number,
        ][];
        for (const [id, , , deliveries] of pending) {
          const claimed = (await this.redis.xclaim(key, this.group, this.consumerName, 30_000, id)) as StreamEntry[];
          const entry = claimed[0];
          if (!entry) continue;
          if (deliveries >= MAX_DELIVERIES) {
            await this.redis.xadd(DEAD_LETTER_STREAM, '*', 'stream', key, 'group', this.group, 'entryId', id, ...entry[1]);
            await this.redis.xack(key, this.group, id);
            this.logger.error(`Moved ${id} from ${key} to dead-letter after ${deliveries} attempts`);
            continue;
          }
          await this.process(key, entry);
        }
      } catch (err) {
        this.logger.error(`Reclaim failed for ${key}: ${(err as Error).message}`);
      }
    }
  }
}

function fieldValue(fields: string[], name: string): string | undefined {
  for (let i = 0; i < fields.length; i += 2) if (fields[i] === name) return fields[i + 1];
  return undefined;
}
