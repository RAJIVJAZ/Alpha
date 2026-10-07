import type { AccessTokenClaims, PlatformRole, TenantRole, TenantType } from '@foodgrid/types';

/**
 * Fine-grained permissions. Tenant roles map to permissions inside their
 * organisation; platform roles map to back-office permissions.
 * This module is isomorphic (safe for browser bundles).
 */
export const Permissions = {
  // merchant operations
  OrdersRead: 'orders:read',
  OrdersManage: 'orders:manage',
  KdsOperate: 'kds:operate',
  PosOperate: 'pos:operate',
  MenuManage: 'menu:manage',
  OutletManage: 'outlet:manage',
  StaffManage: 'staff:manage',
  InventoryRead: 'inventory:read',
  InventoryManage: 'inventory:manage',
  RecipesManage: 'recipes:manage',
  ProductionManage: 'production:manage',
  ProcurementRead: 'procurement:read',
  ProcurementManage: 'procurement:manage',
  ProcurementApprove: 'procurement:approve',
  ReportsRead: 'reports:read',
  FinanceRead: 'finance:read',
  PromotionsManage: 'promotions:manage',
  AdsManage: 'ads:manage',
  SettingsManage: 'settings:manage',
  // seller (supplier / wholesaler / retailer) operations
  CatalogManage: 'catalog:manage',
  PricingManage: 'pricing:manage',
  SalesOrdersManage: 'sales-orders:manage',
  LogisticsManage: 'logistics:manage',
  DealersManage: 'dealers:manage',
  // platform back-office
  PlatformUsersRead: 'platform:users:read',
  PlatformUsersManage: 'platform:users:manage',
  PlatformApprovals: 'platform:approvals',
  PlatformFinance: 'platform:finance',
  PlatformAnalytics: 'platform:analytics',
  PlatformContent: 'platform:content',
  PlatformNotifications: 'platform:notifications',
  PlatformRiders: 'platform:riders',
  PlatformFraud: 'platform:fraud',
  PlatformConfig: 'platform:config',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

const P = Permissions;
const ALL_MERCHANT: Permission[] = [
  P.OrdersRead,
  P.OrdersManage,
  P.KdsOperate,
  P.PosOperate,
  P.MenuManage,
  P.OutletManage,
  P.StaffManage,
  P.InventoryRead,
  P.InventoryManage,
  P.RecipesManage,
  P.ProductionManage,
  P.ProcurementRead,
  P.ProcurementManage,
  P.ProcurementApprove,
  P.ReportsRead,
  P.FinanceRead,
  P.PromotionsManage,
  P.AdsManage,
  P.SettingsManage,
  P.CatalogManage,
  P.PricingManage,
  P.SalesOrdersManage,
  P.LogisticsManage,
  P.DealersManage,
];

export const TENANT_ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  OWNER: ALL_MERCHANT,
  MANAGER: ALL_MERCHANT.filter((p) => p !== P.ProcurementApprove && p !== P.SettingsManage),
  CHEF: [P.OrdersRead, P.KdsOperate, P.InventoryRead, P.RecipesManage, P.ProductionManage],
  CASHIER: [P.OrdersRead, P.OrdersManage, P.PosOperate, P.KdsOperate],
  STAFF: [P.OrdersRead, P.KdsOperate],
  ACCOUNTANT: [P.OrdersRead, P.ReportsRead, P.FinanceRead, P.ProcurementRead, P.InventoryRead],
  PROCUREMENT_MANAGER: [
    P.InventoryRead,
    P.InventoryManage,
    P.ProcurementRead,
    P.ProcurementManage,
    P.ReportsRead,
  ],
};

const ALL_PLATFORM: Permission[] = Object.values(P).filter((p) => p.startsWith('platform:'));

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly Permission[]> = {
  CUSTOMER: [],
  RIDER: [],
  ADMIN: ALL_PLATFORM,
  SUPPORT: [P.PlatformUsersRead, P.PlatformFraud],
  FINANCE: [P.PlatformFinance, P.PlatformAnalytics, P.PlatformUsersRead],
  OPS: [
    P.PlatformApprovals,
    P.PlatformRiders,
    P.PlatformUsersRead,
    P.PlatformAnalytics,
    P.PlatformContent,
  ],
};

/** Back-office staff roles (have access to admin-web). */
export const STAFF_PLATFORM_ROLES: PlatformRole[] = ['ADMIN', 'SUPPORT', 'FINANCE', 'OPS'];

export function permissionsFor(
  claims: Pick<AccessTokenClaims, 'roles' | 'tenantRole' | 'tenantId'>,
): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of claims.roles ?? []) {
    for (const p of PLATFORM_ROLE_PERMISSIONS[role] ?? []) out.add(p);
  }
  if (claims.tenantId && claims.tenantRole) {
    for (const p of TENANT_ROLE_PERMISSIONS[claims.tenantRole] ?? []) out.add(p);
  }
  return out;
}

export function hasPermission(
  claims: Pick<AccessTokenClaims, 'roles' | 'tenantRole' | 'tenantId'>,
  ...required: Permission[]
): boolean {
  const granted = permissionsFor(claims);
  return required.every((p) => granted.has(p));
}

export const isPlatformStaff = (claims: Pick<AccessTokenClaims, 'roles'>) =>
  (claims.roles ?? []).some((r) => STAFF_PLATFORM_ROLES.includes(r));

/** Which merchant dashboard each tenant type uses. */
export const TENANT_APP: Record<TenantType, string> = {
  PLATFORM: 'admin-web',
  RESTAURANT: 'restaurant-web',
  FOOD_CART: 'vendor-web',
  SUPPLIER: 'supplier-web',
  WHOLESALER: 'vendor-web',
  RETAILER: 'vendor-web',
};

/** Outlet-level restriction check for staff assigned to specific outlets. */
export function canAccessOutlet(
  claims: Pick<AccessTokenClaims, 'outletIds'>,
  outletId: string,
): boolean {
  return !claims.outletIds?.length || claims.outletIds.includes(outletId);
}
