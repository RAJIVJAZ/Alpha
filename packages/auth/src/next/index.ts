/**
 * Next.js (App Router) session helpers for the FoodGrid web apps.
 *
 * Tokens live in httpOnly cookies and never reach page scripts:
 *   app/api/auth/[action]/route.ts   -> export const { GET, POST } = createAuthRoutes({ ... })
 *   app/api/proxy/[...path]/route.ts -> export const { GET, POST, PUT, PATCH, DELETE } = createApiProxy()
 *   middleware.ts                    -> createAuthMiddleware from '@foodgrid/auth/next/middleware'
 *   server components                -> getSession() / serverApi()
 */
import { cookies, headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AccessTokenClaims } from '@foodgrid/types';
import { ACCESS_COOKIE, apiBase, clearSessionCookies, REFRESH_COOKIE, refreshTokens, writeSessionCookies, type AuthTokens } from './shared';

export { ACCESS_COOKIE, REFRESH_COOKIE, apiBase } from './shared';

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
function keySet() {
  jwks ??= createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL ?? `${new URL(apiBase()).origin}/.well-known/jwks.json`), { cacheMaxAge: 10 * 60_000 });
  return jwks;
}

/** Verified claims of the current request's access token, or null. */
export async function getSession(): Promise<{ claims: AccessTokenClaims; token: string } | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keySet(), {
      issuer: process.env.JWT_ISSUER || undefined,
      audience: process.env.JWT_AUDIENCE || undefined,
    });
    return { claims: payload as unknown as AccessTokenClaims, token };
  } catch {
    return null;
  }
}

/** Fetch the API from a server component / action as the signed-in user. */
export async function serverApi<T>(path: string, init: RequestInit & { query?: Record<string, string | number | undefined> } = {}): Promise<T> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const url = new URL(`${apiBase()}/${path.replace(/^\/+/, '')}`);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
    cache: init.cache ?? 'no-store',
  });
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return (await res.json()) as T;
}

export interface AuthRoutesOptions {
  /**
   * Who may use this app. Return true, or a message explaining why not — the
   * login is then refused and no cookies are set.
   */
  authorize?: (claims: AccessTokenClaims) => true | string;
}

const clientMeta = async () => {
  const h = await headers();
  return { ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null, userAgent: h.get('user-agent') };
};

async function forward(path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  const meta = await clientMeta();
  return fetch(`${apiBase()}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(meta.userAgent ? { 'user-agent': meta.userAgent } : {}), ...(meta.ip ? { 'x-forwarded-for': meta.ip } : {}), ...extraHeaders },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

const json = (status: number, body: unknown) => NextResponse.json(body, { status });

/** Login (OTP / password), logout, tenant switching and session lookup for one app. */
export function createAuthRoutes(opts: AuthRoutesOptions = {}) {
  async function finishLogin(res: Response) {
    const body = (await res.json().catch(() => ({}))) as { tokens?: AuthTokens; user?: unknown; isNewUser?: boolean };
    if (!res.ok || !body.tokens) return json(res.status, body);
    const claims = JSON.parse(Buffer.from(body.tokens.accessToken.split('.')[1]!, 'base64url').toString('utf8')) as AccessTokenClaims;
    const verdict = opts.authorize?.(claims) ?? true;
    if (verdict !== true) {
      // do not leave a live session behind for an account this app refuses
      await forward('auth/logout', { refreshToken: body.tokens.refreshToken }).catch(() => null);
      return json(403, { statusCode: 403, code: 'APP_ACCESS_DENIED', message: verdict });
    }
    writeSessionCookies(await cookies(), body.tokens);
    return json(200, { user: body.user, isNewUser: body.isNewUser ?? false });
  }

  async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
    const { action } = await ctx.params;
    const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const jar = await cookies();
    switch (action) {
      case 'otp-request': {
        const res = await forward('auth/otp/request', { phone: input.phone });
        return json(res.status, await res.json().catch(() => ({})));
      }
      case 'otp-verify':
        return finishLogin(await forward('auth/otp/verify', { phone: input.phone, code: input.code, referralCode: input.referralCode }));
      case 'password':
        return finishLogin(await forward('auth/password', { email: input.email, password: input.password }));
      case 'logout': {
        const refreshToken = jar.get(REFRESH_COOKIE)?.value;
        if (refreshToken) await forward('auth/logout', { refreshToken }).catch(() => null);
        clearSessionCookies(jar);
        return new NextResponse(null, { status: 204 });
      }
      case 'switch-tenant': {
        const token = jar.get(ACCESS_COOKIE)?.value;
        const res = await forward('auth/switch-tenant', { tenantId: input.tenantId ?? null }, token ? { authorization: `Bearer ${token}` } : {});
        return finishLogin(res);
      }
      default:
        return json(404, { statusCode: 404, code: 'NOT_FOUND', message: 'Unknown auth action' });
    }
  }

  async function GET(_req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
    const { action } = await ctx.params;
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (!token) return json(401, { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Not signed in' });
    if (action === 'session') {
      const res = await fetch(`${apiBase()}/auth/me`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      return json(res.status, await res.json().catch(() => ({})));
    }
    if (action === 'ws-token') {
      // short-lived bearer for the tracking socket only (same-origin JS)
      return json(200, { token });
    }
    return json(404, { statusCode: 404, code: 'NOT_FOUND', message: 'Unknown auth action' });
  }

  return { GET, POST };
}

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length', 'host']);

/**
 * Same-origin API proxy: forwards /api/proxy/<path> to the gateway with the
 * session bearer, refreshing the access token once on expiry.
 */
export function createApiProxy() {
  async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
    const { path } = await ctx.params;
    if (path[0] === 'internal') return json(404, { statusCode: 404, code: 'NOT_FOUND', message: 'Not found' });
    const jar = await cookies();
    const url = `${apiBase()}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
    const meta = await clientMeta();
    const send = (token: string | undefined) =>
      fetch(url, {
        method: req.method,
        headers: {
          accept: req.headers.get('accept') ?? 'application/json',
          ...(req.headers.get('content-type') ? { 'content-type': req.headers.get('content-type')! } : {}),
          ...(req.headers.get('idempotency-key') ? { 'idempotency-key': req.headers.get('idempotency-key')! } : {}),
          ...(req.headers.get('x-device-id') ? { 'x-device-id': req.headers.get('x-device-id')! } : {}),
          ...(meta.ip ? { 'x-forwarded-for': meta.ip } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body,
        cache: 'no-store',
        redirect: 'manual',
      });

    let res = await send(jar.get(ACCESS_COOKIE)?.value);
    let renewed: AuthTokens | null = null;
    const refreshToken = jar.get(REFRESH_COOKIE)?.value;
    if (res.status === 401 && refreshToken) {
      renewed = await refreshTokens(refreshToken, meta);
      if (renewed) res = await send(renewed.accessToken);
    }
    const out = new NextResponse(res.status === 204 ? null : await res.arrayBuffer(), { status: res.status });
    res.headers.forEach((v, k) => {
      if (!HOP_BY_HOP.has(k) && k !== 'set-cookie') out.headers.set(k, v);
    });
    if (renewed) writeSessionCookies(out.cookies, renewed);
    else if (res.status === 401 && refreshToken) clearSessionCookies(out.cookies);
    return out;
  }
  return { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle };
}
