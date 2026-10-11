import { NextRequest } from 'next/server';
import { approvedBusiness, createAuthMiddleware } from './middleware';
import { ACCESS_COOKIE } from './shared';

const jwt = (claims: Record<string, unknown>) =>
  [
    'eyJhbGciOiJSUzI1NiJ9',
    Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900, ...claims })).toString(
      'base64url',
    ),
    'sig',
  ].join('.');

const visit = (path: string, roles: string[], claims: Record<string, unknown> = {}) =>
  new NextRequest(`http://rider.test${path}`, {
    headers: { cookie: `${ACCESS_COOKIE}=${jwt({ sub: 'u1', roles, ...claims })}` },
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

describe('approvedBusiness', () => {
  const vendor = createAuthMiddleware({ allow: approvedBusiness('FOOD_CART', 'RETAILER') });
  const goesTo = async (path: string, claims: Record<string, unknown>) =>
    (await vendor(visit(path, ['CUSTOMER'], claims))).headers.get('location');

  it('opens the dashboard only to an approved business of the app', async () => {
    expect(await goesTo('/orders', { tenantType: 'FOOD_CART', tenantStatus: 'ACTIVE' })).toBeNull();
  });

  it('sends everyone else to the application, which they may open', async () => {
    for (const claims of [
      {},
      { tenantType: 'FOOD_CART', tenantStatus: 'PENDING_APPROVAL' },
      { tenantType: 'FOOD_CART', tenantStatus: 'REJECTED' },
      { tenantType: 'FOOD_CART' }, // minted before tokens carried the status
      { tenantType: 'RESTAURANT', tenantStatus: 'ACTIVE' },
    ]) {
      expect(await goesTo('/orders', claims)).toBe('http://rider.test/apply');
      expect(await goesTo('/apply', claims)).toBeNull();
    }
  });
});
