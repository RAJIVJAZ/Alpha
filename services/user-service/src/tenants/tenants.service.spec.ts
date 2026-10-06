import { TenantsService } from './tenants.service';

const prismaMock = () => {
  const tx = {
    tenant: { create: jest.fn(async ({ data }) => ({ id: 't1', status: 'PENDING_APPROVAL', ...data })) },
  };
  return {
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    tenant: { findUnique: jest.fn(), update: jest.fn() },
    tenantMember: { count: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    tx,
  };
};

describe('TenantsService', () => {
  const approvals = { create: jest.fn() };
  const audit = { record: jest.fn() };

  it('onboards a tenant with an owner and an approval request', async () => {
    const prisma = prismaMock();
    const svc = new TenantsService(prisma as never, approvals as never, audit as never);
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
    expect(approvals.create).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'TENANT', entityId: 't1' }));
  });

  it('rejects GSTINs with a bad checksum', async () => {
    const svc = new TenantsService(prismaMock() as never, approvals as never, audit as never);
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
    prisma.tenantMember.findFirst.mockResolvedValue({ id: 'm1', role: 'OWNER', userId: 'u2' });
    prisma.tenantMember.count.mockResolvedValue(0);
    const svc = new TenantsService(prisma as never, approvals as never, audit as never);
    await expect(svc.updateMember('t1', 'm1', 'u1', { role: 'MANAGER' })).rejects.toMatchObject({ code: 'LAST_OWNER' });
  });
});
