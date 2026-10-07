import {
  canAccessOutlet,
  hasPermission,
  isPlatformStaff,
  permissionDeniedMessage,
  Permissions as P,
  roleRequiredMessage,
} from './permissions';

describe('permissions matrix', () => {
  it('only owners approve purchase orders', () => {
    expect(
      hasPermission(
        { roles: ['CUSTOMER'], tenantId: 't', tenantRole: 'OWNER' },
        P.ProcurementApprove,
      ),
    ).toBe(true);
    expect(
      hasPermission(
        { roles: ['CUSTOMER'], tenantId: 't', tenantRole: 'MANAGER' },
        P.ProcurementApprove,
      ),
    ).toBe(false);
    expect(
      hasPermission(
        { roles: ['CUSTOMER'], tenantId: 't', tenantRole: 'PROCUREMENT_MANAGER' },
        P.ProcurementManage,
      ),
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

  it('builds plain-language 403 messages', () => {
    expect(permissionDeniedMessage([P.OrdersManage])).toBe(
      "Your role can't manage orders. Ask the business owner for access.",
    );
    expect(permissionDeniedMessage([P.ReportsRead, P.FinanceRead, P.MenuManage])).toBe(
      "Your role can't view sales reports, view finances or edit the menu. Ask the business owner for access.",
    );
    expect(permissionDeniedMessage([P.PlatformFinance])).toBe(
      "Your role can't access platform finance. Ask a FoodGrid admin for access.",
    );
    expect(permissionDeniedMessage(['unknown:thing'])).toBe(
      "Your role can't do this. Ask the business owner for access.",
    );
    expect(roleRequiredMessage(['ADMIN', 'OPS'])).toBe(
      'This is only available to FoodGrid admins or FoodGrid operations.',
    );
  });
});
