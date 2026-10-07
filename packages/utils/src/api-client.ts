import type { ApiErrorBody } from '@foodgrid/types';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Partial<ApiErrorBody> | null,
  ) {
    const msg = body?.message;
    super(Array.isArray(msg) ? msg.join(', ') : (msg ?? `Request failed with status ${status}`));
    this.name = 'ApiClientError';
  }
  get code() {
    return this.body?.code;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  onUnauthorized?: () => void | Promise<void>;
  defaultHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Next.js fetch cache hints */
  next?: { revalidate?: number | false; tags?: string[] };
  cache?: RequestCache;
}

/** Minimal isomorphic JSON client shared by web apps and scripts. */
export class ApiClient {
  constructor(private readonly opts: ApiClientOptions) {}

  private buildUrl(path: string, query?: RequestOptions['query']) {
    const url = new URL(
      path.replace(/^\//, ''),
      this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`,
    );
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const token = await this.opts.getToken?.();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.opts.defaultHeaders,
      ...options.headers,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 20_000);
    options.signal?.addEventListener('abort', () => controller.abort());
    try {
      const init: RequestInit & { next?: RequestOptions['next'] } = {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        cache: options.cache,
      };
      if (options.next) init.next = options.next;
      const res = await (this.opts.fetchImpl ?? fetch)(this.buildUrl(path, options.query), init);
      if (res.status === 401) await this.opts.onUnauthorized?.();
      const text = await res.text();
      const json = text ? safeJson(text) : null;
      if (!res.ok) throw new ApiClientError(res.status, (json as Partial<ApiErrorBody>) ?? null);
      return json as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>('GET', path, options);
  }
  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('POST', path, { ...options, body });
  }
  put<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PUT', path, { ...options, body });
  }
  patch<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PATCH', path, { ...options, body });
  }
  delete<T>(path: string, options?: RequestOptions) {
    return this.request<T>('DELETE', path, options);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
