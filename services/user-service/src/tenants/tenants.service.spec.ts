import { TenantsService } from './tenants.service';

const prismaMock = () => {
  const tx = {
    tenant: {
      create: jest.fn(async ({ data }) => ({ id: 't1', status: 'PENDING_APPROVAL', ...data })),
    },
  };
  return {
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    tenant: { findUnique: jest.fn(), update: jest.fn() },
    tenantMember: {
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    user: { findUnique: jest.fn(), create: jest.fn() },
    tx,
  };
};

const member = (id: string, userId: string, role: string, outletIds: string[] = []) => ({
  id,
  tenantId: 't1',
  userId,
  role,
  outletIds,
  status: 'ACTIVE',
});
const OWNER = member('m-owner', 'u1', 'OWNER');
const MANAGER = member('m-mgr', 'u-mgr', 'MANAGER', ['outlet-1']);

describe('TenantsService', () => {
  const approvals = { create: jest.fn() };
  const audit = { record: jest.fn() };
  const internal = { post: jest.fn(async () => ({ revoked: 1 })) };
  beforeEach(() => internal.post.mockClear());

  it('onboards a tenant with an owner and an approval request', async () => {
    const prisma = prismaMock();
    const svc = new TenantsService(
      prisma as never,
      approvals as never,
      audit as never,
      internal as never,
    );
    const tenant = await svc.create('u1', {
      type: 'RESTAURANT',
      name: 'Spice Route',
      gstin: '29AABCS1234K1ZC',
      addressLine1: '1 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
    });
    expect(tenant.stateCode).toBe('29');
    expect(tenant.slug).toMatch(/^spice-route-[0-9a-f]{6}$/);
    const createArgs = prisma.tx.tenant.create.mock.calls[0][0];
    expect(createArgs.data.members.create).toMatchObject({ userId: 'u1', role: 'OWNER' });
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'TENANT', entityId: 't1' }),
    );
  });

  it('rejects GSTINs with a bad checksum', async () => {
    const svc = new TenantsService(
      prismaMock() as never,
      approvals as never,
      audit as never,
      internal as never,
    );
    await expect(
      svc.create('u1', {
        type: 'SUPPLIER',
        name: 'X',
        gstin: '29AABCS1234K1ZD',
        addressLine1: 'a',
        city: 'b',
        state: 'c',
        pincode: '560001',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_GSTIN' });
  });

  it('refuses to demote the last owner', async () => {
    const prisma = prismaMock();
    prisma.tenantMember.findUnique.mockResolvedValue(OWNER);
    prisma.tenantMember.findFirst.mockResolvedValue({ id: 'm1', role: 'OWNER', userId: 'u2' });
    prisma.tenantMember.count.mockResolvedValue(0);
    const svc = new TenantsService(
      prisma as never,
      approvals as never,
      audit as never,
      internal as never,
    );
    await expect(svc.updateMember('t1', 'm1', 'u1', { role: 'MANAGER' })).rejects.toMatchObject({
      code: 'LAST_OWNER',
    });
  });

  describe('staff management cannot escalate privileges', () => {
    /** prisma where the caller (actor) and the target member are the given rows */
    const setup = (actor: object, target?: object) => {
      const prisma = prismaMock();
      prisma.tenantMember.findUnique.mockImplementation(async ({ where }) =>
        where.tenantId_userId?.userId === (actor as { userId: string }).userId ? actor : null,
      );
      prisma.tenantMember.findFirst.mockResolvedValue(target ?? null);
      prisma.tenantMember.count.mockResolvedValue(1);
      prisma.tenantMember.update.mockImplementation(async ({ data }) => ({ ...target, ...data }));
      prisma.tenantMember.upsert.mockImplementation(async ({ create }) => ({
        id: 'm-new',
        ...create,
      }));
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }) => ({ id: 'u-new', ...data }));
      const svc = new TenantsService(
        prisma as never,
        approvals as never,
        audit as never,
        internal as never,
      );
      return { prisma, svc };
    };

    it('a manager cannot promote themselves or lift their outlet restriction', async () => {
      const { prisma, svc } = setup(MANAGER, MANAGER);
      await expect(
        svc.updateMember('t1', MANAGER.id, MANAGER.userId, { role: 'OWNER', outletIds: [] }),
      ).rejects.toMatchObject({ status: 403, code: 'SELF_UPDATE' });
      expect(prisma.tenantMember.update).not.toHaveBeenCalled();
    });

    it('a manager cannot invite an owner or another manager', async () => {
      const { prisma, svc } = setup(MANAGER);
      for (const role of ['OWNER', 'MANAGER'] as const)
        await expect(
          svc.invite('t1', MANAGER.userId, { phone: '9811188003', role, outletIds: ['outlet-1'] }),
        ).rejects.toMatchObject({ status: 403, code: 'ROLE_NOT_ALLOWED' });
      expect(prisma.tenantMember.upsert).not.toHaveBeenCalled();
    });

    it('a manager cannot revoke or demote an owner', async () => {
      const { svc } = setup(MANAGER, OWNER);
      await expect(
        svc.updateMember('t1', OWNER.id, MANAGER.userId, { status: 'REVOKED' }),
      ).rejects.toMatchObject({ status: 403, code: 'ROLE_NOT_ALLOWED' });
    });

    it('an outlet-restricted manager can only hand out their own outlets', async () => {
      const { svc } = setup(MANAGER);
      for (const outletIds of [undefined, [], ['outlet-2']])
        await expect(
          svc.invite('t1', MANAGER.userId, { phone: '9811188004', role: 'CHEF', outletIds }),
        ).rejects.toMatchObject({ status: 403, code: 'OUTLET_NOT_ALLOWED' });
      await expect(
        svc.invite('t1', MANAGER.userId, {
          phone: '9811188004',
          role: 'CHEF',
          outletIds: ['outlet-1'],
        }),
      ).resolves.toMatchObject({ role: 'CHEF', status: 'INVITED' });
    });

    it('a revoked or demoted caller cannot manage staff with a token issued before', async () => {
      const { svc } = setup({ ...OWNER, status: 'REVOKED' });
      await expect(
        svc.invite('t1', OWNER.userId, { phone: '9811188005', role: 'OWNER' }),
      ).rejects.toMatchObject({ status: 403, code: 'NOT_A_MEMBER' });
      const demoted = setup({ ...MANAGER, role: 'STAFF' });
      await expect(demoted.svc.members('t1', MANAGER.userId)).rejects.toMatchObject({
        status: 403,
        code: 'PERMISSION_DENIED',
      });
    });

    it('an owner can promote a manager to owner, which ends the old sessions', async () => {
      const chef = member('m-chef', 'u-chef', 'MANAGER');
      const { svc } = setup(OWNER, chef);
      await expect(
        svc.updateMember('t1', chef.id, OWNER.userId, { role: 'OWNER' }),
      ).resolves.toMatchObject({ role: 'OWNER' });
      expect(internal.post).toHaveBeenCalledWith('auth', 'internal/auth/revoke-user-sessions', {
        userId: 'u-chef',
      });
    });

    it('invites stay INVITED until accepted and never name the invitee', async () => {
      const { prisma, svc } = setup(OWNER);
      await svc.invite('t1', OWNER.userId, { phone: '9811188006', role: 'CHEF', name: 'Chosen' });
      expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty('name');
      expect(prisma.tenantMember.upsert.mock.calls[0][0]).toMatchObject({
        create: { status: 'INVITED' },
        update: { status: 'INVITED' },
      });
    });

    it('restoring a revoked member re-invites them instead of activating them', async () => {
      const revoked = { ...member('m-x', 'u-x', 'STAFF'), status: 'REVOKED' };
      const { prisma, svc } = setup(OWNER, revoked);
      await svc.updateMember('t1', revoked.id, OWNER.userId, { status: 'ACTIVE' });
      expect(prisma.tenantMember.update.mock.calls[0][0].data.status).toBe('INVITED');
      expect(internal.post).not.toHaveBeenCalled();
    });
  });
});
