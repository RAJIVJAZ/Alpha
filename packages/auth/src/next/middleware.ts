/**
 * Edge middleware: keeps pages behind a session, refreshing an expired access
 * token before the page renders (server components then see fresh cookies).
 *
 *   export default createAuthMiddleware({ publicPaths: ['/login'] });
 *   export const config = { matcher: ['/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|webp|ico)$).*)'] };
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_COOKIE,
  decodeClaims,
  isExpired,
  REFRESH_COOKIE,
  refreshTokens,
  writeSessionCookies,
} from './shared';

export interface AuthMiddlewareOptions {
  /** Paths (exact or prefix with trailing *) that need no session. */
  publicPaths?: string[];
  loginPath?: string;
  /**
   * Extra gate on decoded claims: true lets the request through, false sends
   * the user to the login page, and a path sends them there instead (e.g. a
   * sign-up page, which must then be allowed itself).
   */
  allow?: (claims: Record<string, unknown>, path: string) => boolean | string;
}

/**
 * `allow` for a business dashboard: an approved business of one of `types`
 * uses the app; any other signed-in account may only register one, or follow
 * its application, at /apply.
 */
export const approvedBusiness =
  (...types: string[]) =>
  (claims: Record<string, unknown>, path: string) =>
    path === '/apply' ||
    (types.includes(String(claims.tenantType)) && claims.tenantStatus === 'ACTIVE') ||
    '/apply';

const matches = (path: string, pattern: string) =>
  pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern;

export function createAuthMiddleware(opts: AuthMiddlewareOptions = {}) {
  const loginPath = opts.loginPath ?? '/login';
  const publicPaths = [loginPath, '/api/auth/*', ...(opts.publicPaths ?? [])];

  return async function middleware(req: NextRequest) {
    const path = req.nextUrl.pathname;
    // the API proxy answers 401 itself and refreshes on demand
    if (path.startsWith('/api/proxy/') || publicPaths.some((p) => matches(path, p)))
      return NextResponse.next();

    let access = req.cookies.get(ACCESS_COOKIE)?.value;
    const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
    let renewed: Awaited<ReturnType<typeof refreshTokens>> = null;
    if ((!access || isExpired(access)) && refresh) {
      renewed = await refreshTokens(refresh, {
        ip: req.headers.get('x-forwarded-for'),
        userAgent: req.headers.get('user-agent'),
        origin: req.nextUrl.origin,
      });
      access = renewed?.accessToken;
    }
    const claims = access && !isExpired(access, 0) ? decodeClaims(access) : null;
    const verdict = claims ? (opts.allow?.(claims, path) ?? true) : false;
    if (typeof verdict === 'string') {
      const url = req.nextUrl.clone();
      url.pathname = verdict;
      url.search = '';
      const res = NextResponse.redirect(url);
      if (renewed) writeSessionCookies(res.cookies, renewed);
      return res;
    }
    if (!claims || !verdict) {
      const url = req.nextUrl.clone();
      url.pathname = loginPath;
      url.search = `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
      const res = NextResponse.redirect(url);
      if (!claims) {
        res.cookies.delete(ACCESS_COOKIE);
        if (refresh && !renewed) res.cookies.delete(REFRESH_COOKIE);
      }
      return res;
    }
    if (!renewed) return NextResponse.next();
    // forward the fresh token to this request's server components and persist it
    const headers = new Headers(req.headers);
    const cookie = req.cookies
      .getAll()
      .filter((c) => c.name !== ACCESS_COOKIE && c.name !== REFRESH_COOKIE)
      .map((c) => `${c.name}=${c.value}`)
      .concat(
        `${ACCESS_COOKIE}=${renewed.accessToken}`,
        `${REFRESH_COOKIE}=${renewed.refreshToken}`,
      )
      .join('; ');
    headers.set('cookie', cookie);
    const res = NextResponse.next({ request: { headers } });
    writeSessionCookies(res.cookies, renewed);
    return res;
  };
}
