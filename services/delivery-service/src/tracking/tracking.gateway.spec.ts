import 'reflect-metadata';
import type { AccessTokenService } from '@foodgrid/auth';
import type { PrismaService } from '@foodgrid/database/nest';
import type { AccessTokenClaims } from '@foodgrid/types';
import type { InternalHttpService } from '@foodgrid/utils/server';
import type { Socket } from 'socket.io';
import { TrackingGateway } from './tracking.gateway';

const OUTLETS: Record<string, { id: string; tenantId: string }> = {
  'outlet-a1': { id: 'outlet-a1', tenantId: 'tenant-a' },
  'outlet-a2': { id: 'outlet-a2', tenantId: 'tenant-a' },
  'outlet-b1': { id: 'outlet-b1', tenantId: 'tenant-b' },
};

const claims = (extra: Partial<AccessTokenClaims>): AccessTokenClaims => ({
  sub: 'user-1',
  sid: 'sid-1',
  roles: ['CUSTOMER'],
  ...extra,
});
const OWNER_A = claims({ tenantId: 'tenant-a', tenantType: 'RESTAURANT', tenantRole: 'OWNER' });
const CHEF_A = claims({ tenantId: 'tenant-a', tenantType: 'RESTAURANT', tenantRole: 'CHEF' });

function subscribe(user: AccessTokenClaims | undefined, outletId: unknown) {
  const internal = {
    get: jest.fn(async (_svc: string, path: string) => {
      const outlet = OUTLETS[decodeURIComponent(path.split('/').pop()!)];
      if (!outlet) throw new Error('404');
      return outlet;
    }),
  };
  const gateway = new TrackingGateway(
    {} as AccessTokenService,
    {} as PrismaService,
    internal as unknown as InternalHttpService,
  );
  const client = { data: { user }, emit: jest.fn(), join: jest.fn() };
  const ack = gateway.subscribeOutlet(client as unknown as Socket, { outletId } as never);
  return ack.then((res) => ({ res, client, internal }));
}

describe('TrackingGateway outlet:subscribe', () => {
  it('lets the owner follow an outlet of their tenant', async () => {
    const { res, client } = await subscribe(OWNER_A, 'outlet-a1');
    expect(res).toEqual({ ok: true });
    expect(client.join).toHaveBeenCalledWith('outlet:outlet-a1');
    expect(client.emit).not.toHaveBeenCalled();
  });

  it('lets kitchen staff with orders:read follow their outlet', async () => {
    expect((await subscribe(CHEF_A, 'outlet-a2')).res).toEqual({ ok: true });
  });

  it.each([
    ['staff of another tenant', CHEF_A, 'outlet-b1'],
    ['an owner for another tenant', OWNER_A, 'outlet-b1'],
    ['an unknown outlet', OWNER_A, 'outlet-zz'],
  ])('refuses %s after checking the outlet owner', async (_label, user, outletId) => {
    const { res, client, internal } = await subscribe(user, outletId);
    expect(internal.get).toHaveBeenCalled();
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(client.emit).toHaveBeenCalledWith('error', { code: 'FORBIDDEN', outletId });
    expect(client.join).not.toHaveBeenCalled();
  });

  it.each([
    ['a customer', claims({})],
    ['ops staff without a tenant', claims({ roles: ['OPS'] })],
    [
      'a role without orders:read',
      claims({ tenantId: 'tenant-a', tenantRole: 'PROCUREMENT_MANAGER' }),
    ],
    [
      'staff limited to other outlets',
      { ...CHEF_A, outletIds: ['outlet-a2'] } as AccessTokenClaims,
    ],
    ['an unauthenticated socket', undefined],
  ])('refuses %s from the token alone', async (_label, user) => {
    const { res, client, internal } = await subscribe(user, 'outlet-a1');
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(internal.get).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('error', { code: 'FORBIDDEN', outletId: 'outlet-a1' });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('refuses a missing or non-string outletId', async () => {
    for (const outletId of [undefined, 42, { $ne: '' }]) {
      const { res, internal } = await subscribe(OWNER_A, outletId);
      expect(res).toEqual({ ok: false, error: 'FORBIDDEN' });
      expect(internal.get).not.toHaveBeenCalled();
    }
  });
});
