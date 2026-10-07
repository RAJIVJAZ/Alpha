import 'reflect-metadata';
import { generateKeyPairSync } from 'node:crypto';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessTokenService, signServiceToken } from '../tokens';
import { Permissions } from '../permissions';
import { AuthGuard } from './auth.guard';
import {
  IS_INTERNAL_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
  TENANT_TYPES_KEY,
} from './constants';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const tokens = new AccessTokenService({
  privateKey,
  publicKey,
  issuer: 'i',
  audience: 'a',
  accessTtlSeconds: 60,
});

function ctxWith(meta: Record<string, unknown>, headers: Record<string, string>) {
  const handler = () => undefined;
  for (const [k, v] of Object.entries(meta)) Reflect.defineMetadata(k, v, handler);
  const req: any = { headers };
  const ctx = {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('AuthGuard', () => {
  const revoked = new Set<string>();
  const guard = new AuthGuard(
    new Reflector(),
    tokens,
    { internalSecret: 'sek' },
    {
      isRevoked: async (sid: string) => revoked.has(sid),
    },
  );
  const bearer = (claims: any) => ({ authorization: `Bearer ${tokens.sign(claims)}` });

  it('allows public routes anonymously', async () => {
    const { ctx } = ctxWith({ [IS_PUBLIC_KEY]: true }, {});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects missing tokens', async () => {
    const { ctx } = ctxWith({}, {});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches verified claims', async () => {
    const { ctx, req } = ctxWith({}, bearer({ sub: 'u1', roles: ['CUSTOMER'], sid: 's1' }));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user.sub).toBe('u1');
  });

  it('enforces revoked sessions', async () => {
    revoked.add('dead');
    const { ctx } = ctxWith({}, bearer({ sub: 'u1', roles: ['CUSTOMER'], sid: 'dead' }));
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('enforces platform roles with ADMIN override', async () => {
    const rider = ctxWith(
      { [ROLES_KEY]: ['RIDER'] },
      bearer({ sub: 'u', roles: ['CUSTOMER'], sid: 's' }),
    );
    await expect(guard.canActivate(rider.ctx)).rejects.toBeInstanceOf(ForbiddenException);
    const admin = ctxWith(
      { [ROLES_KEY]: ['RIDER'] },
      bearer({ sub: 'u', roles: ['ADMIN'], sid: 's' }),
    );
    await expect(guard.canActivate(admin.ctx)).resolves.toBe(true);
  });

  it('requires tenant context of the right type and permissions', async () => {
    const meta = {
      [TENANT_TYPES_KEY]: ['RESTAURANT'],
      [PERMISSIONS_KEY]: [Permissions.MenuManage],
    };
    const noTenant = ctxWith(meta, bearer({ sub: 'u', roles: [], sid: 's' }));
    await expect(guard.canActivate(noTenant.ctx)).rejects.toBeInstanceOf(ForbiddenException);

    const wrongType = ctxWith(
      meta,
      bearer({
        sub: 'u',
        roles: [],
        sid: 's',
        tenantId: 't',
        tenantType: 'SUPPLIER',
        tenantRole: 'OWNER',
      }),
    );
    await expect(guard.canActivate(wrongType.ctx)).rejects.toBeInstanceOf(ForbiddenException);

    const chef = ctxWith(
      meta,
      bearer({
        sub: 'u',
        roles: [],
        sid: 's',
        tenantId: 't',
        tenantType: 'RESTAURANT',
        tenantRole: 'CHEF',
      }),
    );
    await expect(guard.canActivate(chef.ctx)).rejects.toBeInstanceOf(ForbiddenException);

    const owner = ctxWith(
      meta,
      bearer({
        sub: 'u',
        roles: [],
        sid: 's',
        tenantId: 't',
        tenantType: 'RESTAURANT',
        tenantRole: 'OWNER',
      }),
    );
    await expect(guard.canActivate(owner.ctx)).resolves.toBe(true);
  });

  it('explains a missing permission in plain words and lists only what is missing', async () => {
    const chef = ctxWith(
      { [PERMISSIONS_KEY]: [Permissions.OrdersRead, Permissions.OrdersManage] },
      bearer({
        sub: 'u',
        roles: [],
        sid: 's',
        tenantId: 't',
        tenantType: 'RESTAURANT',
        tenantRole: 'CHEF',
      }),
    );
    const err = await guard.canActivate(chef.ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toEqual({
      message: "Your role can't manage orders. Ask the business owner for access.",
      code: 'PERMISSION_DENIED',
      details: ['orders:manage'],
    });
  });

  it('names the audience of role-restricted routes', async () => {
    const customer = ctxWith(
      { [ROLES_KEY]: ['RIDER'] },
      bearer({ sub: 'u', roles: ['CUSTOMER'], sid: 's' }),
    );
    const err = await guard.canActivate(customer.ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toEqual({
      message: 'This is only available to riders.',
      code: 'FORBIDDEN',
      details: ['RIDER'],
    });
  });

  it('accepts only service tokens on internal routes', async () => {
    const user = ctxWith(
      { [IS_INTERNAL_KEY]: true },
      bearer({ sub: 'u', roles: ['ADMIN'], sid: 's' }),
    );
    await expect(guard.canActivate(user.ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    const svc = ctxWith(
      { [IS_INTERNAL_KEY]: true },
      { 'x-service-token': signServiceToken('sek', 'payment-service') },
    );
    await expect(guard.canActivate(svc.ctx)).resolves.toBe(true);
    expect(svc.req.service.sub).toBe('payment-service');
  });
});
