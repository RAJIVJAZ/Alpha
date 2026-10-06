import { Injectable, Logger } from '@nestjs/common';
import { InternalHttpService } from '@foodgrid/utils/server';

type Kind = 'outlets' | 'tenants' | 'riders';
export interface Named {
  id: string;
  name: string;
  [key: string]: unknown;
}

const SOURCE: Record<Kind, { service: 'order' | 'user' | 'delivery'; path: string }> = {
  outlets: { service: 'order', path: 'internal/outlets/batch' },
  tenants: { service: 'user', path: 'internal/tenants/batch' },
  riders: { service: 'delivery', path: 'internal/riders/batch' },
};
const TTL_MS = 10 * 60_000;

/**
 * Names for the ids in analytics read models, fetched in batches from the
 * owning services and cached briefly. Reports degrade to ids alone if an
 * owner is unreachable — names are a convenience, never a reason to fail.
 */
@Injectable()
export class DirectoryService {
  private readonly logger = new Logger(DirectoryService.name);
  private readonly cache = new Map<string, { value: Named | null; at: number }>();

  constructor(private readonly internal: InternalHttpService) {}

  async lookup(kind: Kind, ids: string[]): Promise<Map<string, Named>> {
    const now = Date.now();
    const unique = [...new Set(ids.filter(Boolean))];
    const missing = unique.filter((id) => {
      const hit = this.cache.get(`${kind}:${id}`);
      return !hit || now - hit.at > TTL_MS;
    });
    if (missing.length) {
      try {
        const rows = await this.internal.post<Named[]>(SOURCE[kind].service, SOURCE[kind].path, { ids: missing.slice(0, 500) });
        const found = new Map(rows.map((r) => [r.id, r]));
        for (const id of missing) this.cache.set(`${kind}:${id}`, { value: found.get(id) ?? null, at: now });
      } catch (err) {
        this.logger.warn(`name lookup for ${kind} failed: ${(err as Error).message}`);
      }
    }
    const out = new Map<string, Named>();
    for (const id of unique) {
      const v = this.cache.get(`${kind}:${id}`)?.value;
      if (v) out.set(id, v);
    }
    return out;
  }
}
