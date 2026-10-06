'use client';

/**
 * Browser API client. Requests go to the app's own /api/proxy/* route, which
 * attaches the httpOnly session cookie as a bearer token server-side and
 * refreshes it when needed — tokens are never exposed to page scripts.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | null | undefined | string[]>;

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export function buildPath(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.set(k, String(v));
  }
  const s = qs.toString();
  return `/api/proxy/${path.replace(/^\/+/, '')}${s ? `?${s}` : ''}`;
}

export async function apiFetch<T>(path: string, req: ApiRequest = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (req.body !== undefined) headers['Content-Type'] = 'application/json';
  if (req.idempotencyKey) headers['Idempotency-Key'] = req.idempotencyKey;
  const res = await fetch(buildPath(path, req.query), {
    method: req.method ?? 'GET',
    headers,
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
    credentials: 'same-origin',
    signal: req.signal,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text };
  }
  if (
    res.status === 401 &&
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/login')
  ) {
    window.location.assign(
      `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
  }
  if (!res.ok) {
    const body = (json ?? {}) as {
      code?: string;
      message?: string | string[];
      details?: { errors?: string[] };
    };
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : (body.details?.errors?.join(', ') ?? body.message ?? `Request failed (${res.status})`);
    throw new ApiError(res.status, body.code, message, body.details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => apiFetch<T>(path, { query }),
  post: <T>(path: string, body?: unknown, opts: Omit<ApiRequest, 'method' | 'body'> = {}) =>
    apiFetch<T>(path, { ...opts, method: 'POST', body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body ?? {} }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

export const newIdempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/** Paginated list envelope used by the services. */
export interface Paged<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
