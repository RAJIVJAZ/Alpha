import { NextRequest } from 'next/server';
import { createAuthMiddleware } from './middleware';
import { ACCESS_COOKIE } from './shared';

const jwt = (claims: Record<string, unknown>) =>
  [
    'eyJhbGciOiJSUzI1NiJ9',
    Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900, ...claims })).toString(
      'base64url',
    ),
    'sig',
  ].join('.');

const visit = (path: string, roles: string[]) =>
  new NextRequest(`http://rider.test${path}`, {
    headers: { cookie: `${ACCESS_COOKIE}=${jwt({ sub: 'u1', roles })}` },
  });

describe('createAuthMiddleware allow', () => {
  // rider-web: riders use the app, everyone else may only apply
  const middleware = createAuthMiddleware({
    allow: (c, path) => path === '/apply' || (c.roles as string[]).includes('RIDER') || '/apply',
  });

  it('sends an account the app refuses to the path the gate names', async () => {
    const res = await middleware(visit('/earnings?range=7d', ['CUSTOMER']));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://rider.test/apply');
  });

  it('lets the named path and allowed accounts through', async () => {
    expect((await middleware(visit('/apply', ['CUSTOMER']))).headers.get('location')).toBeNull();
    expect((await middleware(visit('/earnings', ['RIDER']))).headers.get('location')).toBeNull();
  });

  it('still sends a false verdict to the login page', async () => {
    const riderOnly = createAuthMiddleware({
      allow: (c) => (c.roles as string[]).includes('RIDER'),
    });
    const res = await riderOnly(visit('/earnings', ['CUSTOMER']));
    expect(res.headers.get('location')).toBe('http://rider.test/login?next=%2Fearnings');
  });
});
