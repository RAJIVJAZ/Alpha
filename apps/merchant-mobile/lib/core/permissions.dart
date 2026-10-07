import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

/// Merchant permissions, mirroring `TENANT_ROLE_PERMISSIONS` in
/// packages/auth/src/permissions.ts. The API enforces them; the app uses
/// them to hide actions a role can't perform (and still surfaces any 403).
enum Perm {
  ordersRead,
  ordersManage,
  kdsOperate,
  posOperate,
  menuManage,
  outletManage,
  inventoryRead,
  inventoryManage,
  procurementRead,
  procurementManage,
  procurementApprove,
  reportsRead,
}

const _all = Perm.values;

const Map<String, Set<Perm>> rolePermissions = {
  'OWNER': {..._all},
  'MANAGER': {
    Perm.ordersRead, Perm.ordersManage, Perm.kdsOperate, Perm.posOperate, Perm.menuManage, Perm.outletManage, //
    Perm.inventoryRead, Perm.inventoryManage, Perm.procurementRead, Perm.procurementManage, Perm.reportsRead,
  },
  'CHEF': {Perm.ordersRead, Perm.kdsOperate, Perm.inventoryRead},
  'CASHIER': {Perm.ordersRead, Perm.ordersManage, Perm.posOperate, Perm.kdsOperate},
  'STAFF': {Perm.ordersRead, Perm.kdsOperate},
  'ACCOUNTANT': {Perm.ordersRead, Perm.reportsRead, Perm.procurementRead, Perm.inventoryRead},
  'PROCUREMENT_MANAGER': {Perm.inventoryRead, Perm.inventoryManage, Perm.procurementRead, Perm.procurementManage, Perm.reportsRead},
};

/// Business types this app serves.
const merchantTenantTypes = {'RESTAURANT', 'FOOD_CART'};

bool isMerchantTenant(String? type) => type != null && merchantTenantTypes.contains(type);

class Permissions {
  const Permissions(this.role, this.granted);

  final String? role;
  final Set<Perm> granted;

  bool can(Perm p) => granted.contains(p);

  /// Today's sales: owners, managers and accountants (reports) and the
  /// counter (POS "Today" tab on the web). Kitchen roles don't see revenue.
  bool get canSeeSales => can(Perm.reportsRead);

  String get roleLabel => role == null ? 'Team member' : humanize(role);
}

final permissionsProvider = Provider<Permissions>((ref) {
  final role = ref.watch(sessionProvider.select((s) => s.value?.claims.tenantRole));
  return Permissions(role, rolePermissions[role] ?? const {});
});
