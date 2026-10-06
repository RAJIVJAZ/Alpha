import { canAccessOutlet, hasPermission, isPlatformStaff, Permissions as P } from './permissions';

describe('permissions matrix', () => {
  it('only owners approve purchase orders', () => {
    expect(hasPermission({ roles: ['CUSTOMER'], tenantId: 't', tenantRole: 'OWNER' }, P.ProcurementApprove)).toBe(true);
    expect(hasPermission({ roles: ['CUSTOMER'], tenantId: 't', tenantRole: 'MANAGER' }, P.ProcurementApprove)).toBe(false);
    expect(
      hasPermission({ roles: ['CUSTOMER'], tenantId: 't', tenantRole: 'PROCUREMENT_MANAGER' }, P.ProcurementManage),
    ).toBe(true);
  });

  it('kitchen staff can operate the KDS but not edit menus', () => {
    const chef = { roles: [] as never[], tenantId: 't', tenantRole: 'CHEF' as const };
    expect(hasPermission(chef, P.KdsOperate)).toBe(true);
    expect(hasPermission(chef, P.MenuManage)).toBe(false);
  });

  it('ignores tenant role without an active tenant', () => {
    expect(hasPermission({ roles: [], tenantRole: 'OWNER' }, P.OrdersRead)).toBe(false);
  });

  it('maps platform roles to back-office permissions', () => {
    expect(hasPermission({ roles: ['FINANCE'] }, P.PlatformFinance)).toBe(true);
    expect(hasPermission({ roles: ['SUPPORT'] }, P.PlatformFinance)).toBe(false);
    expect(hasPermission({ roles: ['ADMIN'] }, P.PlatformConfig, P.PlatformApprovals)).toBe(true);
    expect(isPlatformStaff({ roles: ['CUSTOMER', 'OPS'] })).toBe(true);
    expect(isPlatformStaff({ roles: ['CUSTOMER'] })).toBe(false);
  });

  it('restricts outlet-scoped staff', () => {
    expect(canAccessOutlet({ outletIds: [] }, 'o1')).toBe(true);
    expect(canAccessOutlet({ outletIds: ['o1'] }, 'o1')).toBe(true);
    expect(canAccessOutlet({ outletIds: ['o2'] }, 'o1')).toBe(false);
  });
});
