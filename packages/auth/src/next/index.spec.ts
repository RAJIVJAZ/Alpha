import type { NextRequest } from 'next/server';
import { createAuthRoutes } from './index';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './shared';

const mockJar = new Map<string, string>();
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (mockJar.has(name) ? { name, value: mockJar.get(name) } : undefined),
    set: (name: string, value: string) => mockJar.set(name, value),
    delete: (name: string) => mockJar.delete(name),
  }),
  headers: async () => new Headers({ 'user-agent': 'jest' }),
}));
// ESM-only and only needed by getSession()
jest.mock('jose', () => ({ createRemoteJWKSet: jest.fn(), jwtVerify: jest.fn() }));

const jwt = (claims: Record<string, unknown>, ttl = 900) =>
  [
    'eyJhbGciOiJSUzI1NiJ9',
    Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttl, ...claims })).toString(
      'base64url',
    ),
    'sig',
  ].join('.');

const restaurant = (tenantId: string) => ({
  sub: 'u1',
  roles: ['CUSTOMER'],
  tenantId,
  tenantType: 'RESTAURANT',
});

interface Call {
  path: string;
  body: Record<string, unknown>;
  authorization?: string;
}

/** Fake gateway: each auth route answers from a queue of replies. */
function gateway(replies: Record<string, Array<{ status?: number; body: unknown }>>) {
  const calls: Call[] = [];
  global.fetch = jest.fn(async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace(/^.*\/api\/v1\//, '');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      path,
      body: JSON.parse(String(init?.body ?? '{}')),
      authorization: headers.authorization,
    });
    const reply = replies[path]?.shift();
    if (!reply) throw new Error(`unexpected call to ${path}`);
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

const session = (accessToken: string, refreshToken: string) => ({
  tokens: { accessToken, refreshToken, expiresIn: 900, tokenType: 'Bearer' },
  user: { id: 'u1' },
});

async function switchTo(routes: ReturnType<typeof createAuthRoutes>, tenantId: string | null) {
  const req = { json: async () => ({ tenantId }) } as unknown as NextRequest;
  const res = await routes.POST(req, { params: Promise.resolve({ action: 'switch-tenant' }) });
  return { status: res.status, body: await res.json() };
}

describe('auth route handler: switch-tenant', () => {
  const restaurantOnly = createAuthRoutes({
    authorize: (c) => (c.tenantType === 'RESTAURANT' ? true : 'Restaurants only.'),
  });
  const original = global.fetch;

  beforeEach(() => {
    mockJar.clear();
    process.env.API_URL = 'http://gw.test/api/v1';
  });
  afterAll(() => {
    global.fetch = original;
  });

  it('stores the rotated tokens when the app accepts the new business', async () => {
    const before = jwt(restaurant('t1'));
    const after = jwt(restaurant('t2'));
    mockJar.set(ACCESS_COOKIE, before).set(REFRESH_COOKIE, 'rt1');
    const calls = gateway({ 'auth/switch-tenant': [{ body: session(after, 'rt2') }] });

    const res = await switchTo(restaurantOnly, 't2');

    expect(res).toEqual({ status: 200, body: { user: { id: 'u1' } } });
    expect(calls).toEqual([
      { path: 'auth/switch-tenant', body: { tenantId: 't2' }, authorization: `Bearer ${before}` },
    ]);
    expect(mockJar.get(ACCESS_COOKIE)).toBe(after);
    expect(mockJar.get(REFRESH_COOKIE)).toBe('rt2');
  });

  it('switches to consumer mode in an app without an authorize rule', async () => {
    const consumer = jwt({ sub: 'u1', roles: ['CUSTOMER'] });
    mockJar.set(ACCESS_COOKIE, jwt(restaurant('t1'))).set(REFRESH_COOKIE, 'rt1');
    const calls = gateway({ 'auth/switch-tenant': [{ body: session(consumer, 'rt2') }] });

    const res = await switchTo(createAuthRoutes(), null);

    expect(res.status).toBe(200);
    expect(calls[0]!.body).toEqual({ tenantId: null });
    expect(mockJar.get(ACCESS_COOKIE)).toBe(consumer);
    expect(mockJar.get(REFRESH_COOKIE)).toBe('rt2');
  });

  it('refuses a business the app does not serve and switches the session back', async () => {
    const supplier = jwt({
      sub: 'u1',
      roles: ['CUSTOMER'],
      tenantId: 's1',
      tenantType: 'SUPPLIER',
    });
    const restored = jwt(restaurant('t1'));
    mockJar.set(ACCESS_COOKIE, jwt(restaurant('t1'))).set(REFRESH_COOKIE, 'rt1');
    const calls = gateway({
      'auth/switch-tenant': [
        { body: session(supplier, 'rt2') },
        { body: session(restored, 'rt3') },
      ],
    });

    const res = await switchTo(restaurantOnly, 's1');

    expect(res).toEqual({
      status: 403,
      body: { statusCode: 403, code: 'APP_ACCESS_DENIED', message: 'Restaurants only.' },
    });
    expect(calls[1]).toEqual({
      path: 'auth/switch-tenant',
      body: { tenantId: 't1' },
      authorization: `Bearer ${supplier}`,
    });
    // the refused tokens never reach the browser and the session is not logged out
    expect(mockJar.get(ACCESS_COOKIE)).toBe(restored);
    expect(mockJar.get(REFRESH_COOKIE)).toBe('rt3');
    expect(calls.map((c) => c.path)).not.toContain('auth/logout');
  });

  it('ends the session if it cannot be switched back', async () => {
    const supplier = jwt({
      sub: 'u1',
      roles: ['CUSTOMER'],
      tenantId: 's1',
      tenantType: 'SUPPLIER',
    });
    mockJar.set(ACCESS_COOKIE, jwt(restaurant('t1'))).set(REFRESH_COOKIE, 'rt1');
    const calls = gateway({
      'auth/switch-tenant': [{ body: session(supplier, 'rt2') }, { status: 503, body: {} }],
      'auth/logout': [{ body: {} }],
    });

    const res = await switchTo(restaurantOnly, 's1');

    expect(res.status).toBe(403);
    expect(calls[2]).toMatchObject({ path: 'auth/logout', body: { refreshToken: 'rt2' } });
    expect(mockJar.has(ACCESS_COOKIE)).toBe(false);
    expect(mockJar.has(REFRESH_COOKIE)).toBe(false);
  });

  it('renews an expired access token before switching', async () => {
    const renewed = jwt(restaurant('t1'));
    const after = jwt(restaurant('t2'));
    mockJar.set(ACCESS_COOKIE, jwt(restaurant('t1'), -60)).set(REFRESH_COOKIE, 'rt1');
    const calls = gateway({
      'auth/refresh': [{ body: session(renewed, 'rt2') }],
      'auth/switch-tenant': [{ body: session(after, 'rt3') }],
    });

    const res = await switchTo(restaurantOnly, 't2');

    expect(res.status).toBe(200);
    expect(calls.map((c) => [c.path, c.authorization])).toEqual([
      ['auth/refresh', undefined],
      ['auth/switch-tenant', `Bearer ${renewed}`],
    ]);
    expect(mockJar.get(REFRESH_COOKIE)).toBe('rt3');
  });

  it('passes backend errors through without touching cookies', async () => {
    const before = jwt(restaurant('t1'));
    mockJar.set(ACCESS_COOKIE, before).set(REFRESH_COOKIE, 'rt1');
    const error = { statusCode: 403, code: 'NOT_A_MEMBER', message: 'Not a member' };
    gateway({ 'auth/switch-tenant': [{ status: 403, body: error }] });

    const res = await switchTo(restaurantOnly, 'other');

    expect(res).toEqual({ status: 403, body: error });
    expect(mockJar.get(ACCESS_COOKIE)).toBe(before);
    expect(mockJar.get(REFRESH_COOKIE)).toBe('rt1');
  });
});

describe('auth route handler: refresh', () => {
  const routes = createAuthRoutes();
  const refresh = () =>
    routes.POST({ json: async () => ({}) } as unknown as NextRequest, {
      params: Promise.resolve({ action: 'refresh' }),
    });
  const original = global.fetch;

  beforeEach(() => {
    mockJar.clear();
    process.env.API_URL = 'http://gw.test/api/v1';
  });
  afterAll(() => {
    global.fetch = original;
  });

  it('stores a token that carries a role granted since sign-in', async () => {
    const rider = jwt({ sub: 'u1', roles: ['CUSTOMER', 'RIDER'] });
    mockJar.set(ACCESS_COOKIE, jwt({ sub: 'u1', roles: ['CUSTOMER'] })).set(REFRESH_COOKIE, 'rt1');
    const calls = gateway({ 'auth/refresh': [{ body: session(rider, 'rt2') }] });

    const res = await refresh();

    expect(res.status).toBe(204);
    expect(calls[0]!.body).toEqual({ refreshToken: 'rt1' });
    expect(mockJar.get(ACCESS_COOKIE)).toBe(rider);
    expect(mockJar.get(REFRESH_COOKIE)).toBe('rt2');
  });

  it('answers 401 without a session or when the refresh token is rejected', async () => {
    expect((await refresh()).status).toBe(401);

    mockJar.set(REFRESH_COOKIE, 'revoked');
    gateway({ 'auth/refresh': [{ status: 401, body: { code: 'REFRESH_INVALID' } }] });
    expect((await refresh()).status).toBe(401);
    expect(mockJar.get(REFRESH_COOKIE)).toBe('revoked');
  });
});
