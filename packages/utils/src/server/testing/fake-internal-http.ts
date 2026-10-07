import { AppError } from '../../errors';
import type { InternalRequestOptions, ServiceName } from '../internal-http.service';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface FakeRequest {
  service: ServiceName;
  method: Method;
  path: string;
  params: Record<string, string>;
  body: unknown;
  opts: InternalRequestOptions;
}

type Responder =
  ((req: FakeRequest) => unknown) | object | unknown[] | string | number | boolean | null;

interface Route {
  service: ServiceName;
  method: Method;
  pattern: RegExp;
  keys: string[];
  respond: Responder;
}

/**
 * In-process stand-in for InternalHttpService in integration tests.
 *
 *   const http = new FakeInternalHttp()
 *     .on('GET', 'order', 'internal/outlets/:id', ({ params }) => outlets[params.id]);
 *   Test.createTestingModule(...).overrideProvider(InternalHttpService).useValue(http)
 *
 * Responses are JSON round-tripped (Dates become strings, like on the wire).
 * Unregistered routes fail with UPSTREAM_UNAVAILABLE, exactly like a down
 * service, so a test never silently depends on something it did not stub.
 */
export class FakeInternalHttp {
  readonly calls: FakeRequest[] = [];
  private routes: Route[] = [];

  on(method: Method, service: ServiceName, path: string, respond: Responder): this {
    const keys: string[] = [];
    const source = path
      .replace(/^\//, '')
      .split('/')
      .map((seg) => {
        if (!seg.startsWith(':')) return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        keys.push(seg.slice(1));
        return '([^/]+)';
      })
      .join('/');
    // later registrations win, so a test can override a suite-level default
    this.routes.unshift({ service, method, pattern: new RegExp(`^${source}$`), keys, respond });
    return this;
  }

  /** Calls made to a service (optionally filtered by path prefix). */
  callsTo(service: ServiceName, pathPrefix = ''): FakeRequest[] {
    return this.calls.filter((c) => c.service === service && c.path.startsWith(pathPrefix));
  }

  reset(): void {
    this.calls.length = 0;
    this.routes = [];
  }

  baseUrl(service: ServiceName): string {
    return `fake://${service}`;
  }

  async request<T>(
    service: ServiceName,
    method: string,
    path: string,
    opts: InternalRequestOptions = {},
  ): Promise<T> {
    const clean = path.replace(/^\//, '').split('?')[0]!;
    for (const route of this.routes) {
      if (route.service !== service || route.method !== method) continue;
      const m = route.pattern.exec(clean);
      if (!m) continue;
      const params = Object.fromEntries(
        route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]),
      );
      const req: FakeRequest = {
        service,
        method: method as Method,
        path: clean,
        params,
        body: opts.body,
        opts,
      };
      this.calls.push(req);
      const result =
        typeof route.respond === 'function'
          ? await (route.respond as (r: FakeRequest) => unknown)(req)
          : route.respond;
      return (result === undefined ? undefined : JSON.parse(JSON.stringify(result))) as T;
    }
    this.calls.push({
      service,
      method: method as Method,
      path: clean,
      params: {},
      body: opts.body,
      opts,
    });
    throw new AppError(
      'UPSTREAM_UNAVAILABLE',
      `${service}-service is unavailable (no fake route for ${method} ${clean})`,
      503,
      { service, path: clean },
    );
  }

  get<T>(service: ServiceName, path: string, opts?: InternalRequestOptions) {
    return this.request<T>(service, 'GET', path, opts);
  }

  post<T>(service: ServiceName, path: string, body?: unknown, opts?: InternalRequestOptions) {
    return this.request<T>(service, 'POST', path, { ...opts, body });
  }
}
