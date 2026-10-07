import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '@foodgrid/utils/server';

const GEO_KEY = 'riders:geo';
const lastKey = (riderId: string) => `riders:last:${riderId}`;

export interface LivePosition {
  lat: number;
  lng: number;
  heading?: number | null;
  speedKmph?: number | null;
  at: string;
}

/** Hot rider positions in Redis GEO (dispatch radius search, live tracking). */
@Injectable()
export class GeoStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async update(riderId: string, pos: LivePosition) {
    await this.redis
      .multi()
      .geoadd(GEO_KEY, pos.lng, pos.lat, riderId)
      .set(lastKey(riderId), JSON.stringify(pos), 'EX', 600)
      .exec();
  }

  async remove(riderId: string) {
    await this.redis.multi().zrem(GEO_KEY, riderId).del(lastKey(riderId)).exec();
  }

  async last(riderId: string): Promise<LivePosition | null> {
    const raw = await this.redis.get(lastKey(riderId));
    return raw ? (JSON.parse(raw) as LivePosition) : null;
  }

  /** Riders within radius, nearest first: [{ riderId, distanceKm }]. */
  async nearby(lat: number, lng: number, radiusKm: number, count = 50) {
    const res = (await this.redis.call(
      'GEOSEARCH',
      GEO_KEY,
      'FROMLONLAT',
      String(lng),
      String(lat),
      'BYRADIUS',
      String(radiusKm),
      'km',
      'ASC',
      'COUNT',
      String(count),
      'WITHDIST',
    )) as [string, string][];
    return res.map(([riderId, dist]) => ({ riderId, distanceKm: Number(dist) }));
  }

  /** Throttles persistent GPS pings to one per `seconds` per rider. */
  async shouldPersist(riderId: string, seconds = 30): Promise<boolean> {
    return (
      (await this.redis.set(`riders:ping-throttle:${riderId}`, '1', 'EX', seconds, 'NX')) === 'OK'
    );
  }

  /** Online-session bookkeeping for attendance (online minutes). */
  async startSession(riderId: string, at: Date) {
    await this.redis.set(`riders:session:${riderId}`, at.toISOString(), 'EX', 24 * 3600, 'NX');
  }

  async endSession(riderId: string): Promise<Date | null> {
    const raw = await this.redis.getdel(`riders:session:${riderId}`);
    return raw ? new Date(raw) : null;
  }
}
