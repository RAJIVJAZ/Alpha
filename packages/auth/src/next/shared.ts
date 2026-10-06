/** Shared by the route handlers (Node) and middleware (Edge): no Node-only imports. */
export const ACCESS_COOKIE = 'fg_at';
export const REFRESH_COOKIE = 'fg_rt';
const REFRESH_TTL_SECONDS = 30 * 24 * 3600;

/** Server-side API base (gateway). API_URL wins so containers can use the internal hostname. */
export function apiBase(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:8080/api/v1'
  ).replace(/\/+$/, '');
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface CookieWriter {
  set(name: string, value: string, options: Record<string, unknown>): unknown;
  delete(name: string): unknown;
}

const secure = () => process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false';

export function writeSessionCookies(jar: CookieWriter, tokens: AuthTokens) {
  jar.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: secure(),
    sameSite: 'lax',
    path: '/',
    maxAge: tokens.expiresIn,
  });
  jar.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: secure(),
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TTL_SECONDS,
  });
}

export function clearSessionCookies(jar: CookieWriter) {
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** Calls auth-service to rotate the refresh token. Returns null when the session is gone. */
export async function refreshTokens(
  refreshToken: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<AuthTokens | null> {
  const res = await fetch(`${apiBase()}/auth/refresh`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(meta.userAgent ? { 'user-agent': meta.userAgent } : {}),
      ...(meta.ip ? { 'x-forwarded-for': meta.ip } : {}),
    },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json()) as { tokens: AuthTokens };
  return body.tokens;
}

/** Decodes (does not verify) a JWT payload — for expiry checks in middleware. */
export function decodeClaims<T = Record<string, unknown>>(
  token: string,
): (T & { exp?: number }) | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(
      part
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(part.length / 4) * 4, '='),
    );
    return JSON.parse(json) as T & { exp?: number };
  } catch {
    return null;
  }
}

export const isExpired = (token: string, skewSeconds = 30) => {
  const exp = decodeClaims(token)?.exp;
  return !exp || exp * 1000 <= Date.now() + skewSeconds * 1000;
};
