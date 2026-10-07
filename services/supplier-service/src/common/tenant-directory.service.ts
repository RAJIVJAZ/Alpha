import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { InternalHttpService, REDIS } from '@foodgrid/utils/server';
import { notFound } from '@foodgrid/utils';

export interface TenantInfo {
  id: string;
  name: string;
  legalName: string | null;
  type: string;
  status: string;
  gstin: string | null;
  stateCode: string | null;
  city: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
}

/** Read-through cache of tenant profiles owned by user-service. */
@Injectable()
export class TenantDirectory {
  constructor(
    private readonly internal: InternalHttpService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async get(tenantId: string): Promise<TenantInfo> {
    const key = `tenant-dir:${tenantId}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as TenantInfo;
    const t = await this.internal
      .get<TenantInfo>('user', `internal/tenants/${tenantId}`)
      .catch(() => null);
    if (!t) throw notFound('Business', tenantId);
    const slim: TenantInfo = {
      id: t.id,
      name: t.name,
      legalName: t.legalName,
      type: t.type,
      status: t.status,
      gstin: t.gstin,
      stateCode: t.stateCode,
      city: t.city,
      pincode: t.pincode,
      lat: t.lat,
      lng: t.lng,
    };
    await this.redis.set(key, JSON.stringify(slim), 'EX', 600);
    return slim;
  }

  invalidate(tenantId: string) {
    return this.redis.del(`tenant-dir:${tenantId}`);
  }
}
