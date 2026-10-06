import { Inject, Injectable, Logger } from '@nestjs/common';
import { signServiceToken } from '@foodgrid/auth';
import { AppError } from '../errors';
import { CORE_MODULE_OPTIONS, CoreModuleOptions } from './core.options';

export type ServiceName =
  | 'auth'
  | 'user'
  | 'order'
  | 'payment'
  | 'inventory'
  | 'procurement'
  | 'delivery'
  | 'supplier'
  | 'analytics'
  | 'ads'
  | 'notification'
  | 'ai';

const DEFAULT_PORTS: Record<ServiceName, number> = {
  auth: 4001,
  user: 4002,
  order: 4003,
  payment: 4004,
  inventory: 4005,
  procurement: 4006,
  delivery: 4007,
  supplier: 4008,
  analytics: 4009,
  ads: 4010,
  notification: 4011,
  ai: 4012,
};

export interface InternalRequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  tenantId?: string;
  onBehalfOf?: string;
  timeoutMs?: number;
  /** Retries on network errors / 5xx. Only use for idempotent calls. */
  retries?: number;
}

/**
 * Service-to-service HTTP client. Authenticates with short-lived HS256
 * service tokens and targets `/api/v1/internal/...` routes guarded by
 * @Internal().
 */
@Injectable()
export class InternalHttpService {
  private readonly logger = new Logger(InternalHttpService.name);

  constructor(@Inject(CORE_MODULE_OPTIONS) private readonly options: CoreModuleOptions) {}

  baseUrl(service: ServiceName): string {
    const envKey = `${service.toUpperCase()}_SERVICE_URL`;
    return process.env[envKey] ?? `http://localhost:${DEFAULT_PORTS[service]}`;
  }

  async request<T>(service: ServiceName, method: string, path: string, opts: InternalRequestOptions = {}): Promise<T> {
    const url = new URL(`/api/v1/${path.replace(/^\//, '')}`, this.baseUrl(service));
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const retries = opts.retries ?? (method === 'GET' ? 2 : 0);

    for (let attempt = 0; ; attempt++) {
      try {
        const token = signServiceToken(this.options.internalSecret, this.options.serviceName, {
          tenantId: opts.tenantId,
          onBehalfOf: opts.onBehalfOf,
        });
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-service-token': token,
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
        });
        const text = await res.text();
        const json = text ? JSON.parse(text) : undefined;
        if (res.ok) return json as T;
        if (res.status >= 500 && attempt < retries) throw new RetryableError(`HTTP ${res.status}`);
        throw new AppError(
          json?.code ?? 'UPSTREAM_ERROR',
          json?.message ?? `${service}-service responded ${res.status}`,
          res.status >= 500 ? 502 : res.status,
          { service, path },
        );
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (attempt >= retries) {
          this.logger.error(`${method} ${service}${url.pathname} failed: ${(err as Error).message}`);
          throw new AppError('UPSTREAM_UNAVAILABLE', `${service}-service is unavailable`, 503, { service, path });
        }
        await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      }
    }
  }

  get<T>(service: ServiceName, path: string, opts?: InternalRequestOptions) {
    return this.request<T>(service, 'GET', path, opts);
  }

  post<T>(service: ServiceName, path: string, body?: unknown, opts?: InternalRequestOptions) {
    return this.request<T>(service, 'POST', path, { ...opts, body });
  }
}

class RetryableError extends Error {}
