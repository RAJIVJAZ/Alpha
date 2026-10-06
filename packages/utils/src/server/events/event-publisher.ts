import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { EventEnvelope, streamKey } from '@foodgrid/types';
import { REDIS } from '../redis.module';
import { eventsPublished } from '../metrics';
import { STREAM_MAX_LEN } from './constants';

/** Low-level publisher. Prefer OutboxService for anything tied to a DB change. */
@Injectable()
export class EventPublisher {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async publish(envelope: EventEnvelope): Promise<string> {
    const id = await this.redis.xadd(
      streamKey(envelope.stream),
      'MAXLEN',
      '~',
      String(STREAM_MAX_LEN),
      '*',
      'type',
      envelope.type,
      'envelope',
      JSON.stringify(envelope),
    );
    eventsPublished.inc({ type: envelope.type });
    return id ?? '';
  }
}
