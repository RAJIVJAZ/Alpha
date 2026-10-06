import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/client';
import { TenantScopedClient, withTenantScope } from '../tenant-scope';

export const PRISMA_MODULE_OPTIONS = Symbol('PRISMA_MODULE_OPTIONS');

export interface PrismaModuleOptions {
  url?: string;
  /** Log every query (development only). */
  logQueries?: boolean;
  /** Max cached tenant-scoped clients. */
  scopedClientCacheSize?: number;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly scopedClients = new Map<string, TenantScopedClient>();
  private readonly cacheSize: number;

  constructor(@Optional() @Inject(PRISMA_MODULE_OPTIONS) options?: PrismaModuleOptions) {
    super({
      datasourceUrl: options?.url,
      log: options?.logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
    this.cacheSize = options?.scopedClientCacheSize ?? 1000;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Returns a client whose queries are restricted to `tenantId`. */
  forTenant(tenantId: string): TenantScopedClient {
    const cached = this.scopedClients.get(tenantId);
    if (cached) return cached;
    const scoped = withTenantScope(this, tenantId);
    if (this.scopedClients.size >= this.cacheSize) {
      const oldest = this.scopedClients.keys().next().value;
      if (oldest !== undefined) this.scopedClients.delete(oldest);
    }
    this.scopedClients.set(tenantId, scoped);
    return scoped;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
