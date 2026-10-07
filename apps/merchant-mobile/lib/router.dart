import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import 'core/permissions.dart';
import 'features/auth/business_picker_page.dart';
import 'features/auth/login_page.dart';
import 'features/inventory/inventory_page.dart';
import 'features/kitchen/kitchen_page.dart';
import 'features/menu/menu_page.dart';
import 'features/more/more_page.dart';
import 'features/orders/order_detail_page.dart';
import 'features/orders/orders_page.dart';
import 'features/outlets/outlet_picker_page.dart';
import 'features/outlets/outlet_providers.dart';
import 'features/pos/pos_page.dart';
import 'features/procurement/po_detail_page.dart';
import 'features/procurement/procurement_page.dart';
import 'features/reviews/reviews_page.dart';
import 'features/sales/sales_page.dart';
import 'features/shell/home_shell.dart';
import 'features/splash/splash_page.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

class _RouterRefresh extends ChangeNotifier {
  void ping() => notifyListeners();
}

/// Where the app should be for the current session:
/// splash → login → business picker (no / wrong business in the token) →
/// outlet picker (several outlets, none remembered) → home tabs.
String? merchantRedirect(Ref ref, GoRouterState state) {
  final loc = state.matchedLocation;
  String? go(String target) => loc == target ? null : target;

  final session = ref.read(sessionProvider);
  if (session.isLoading) return go('/splash');
  final s = session.value;
  if (s == null) return go('/login');
  if (!isMerchantTenant(s.claims.tenantType)) return go('/business');
  if (loc == '/business') return null; // switching from More

  final outlets = ref.read(outletControllerProvider);
  final o = outlets.value;
  if (outlets.isLoading || o == null || o.tenantId != s.claims.tenantId) return go('/splash');
  if (o.selected == null) return go('/outlet');
  if (loc == '/splash' || loc == '/login') return '/orders';

  final perms = ref.read(permissionsProvider);
  final allowed = switch (loc) {
    _ when loc.startsWith('/kitchen') => perms.can(Perm.kdsOperate),
    _ when loc.startsWith('/pos') => perms.can(Perm.posOperate),
    _ when loc.startsWith('/more/sales') => perms.canSeeSales,
    _ when loc.startsWith('/more/inventory') => perms.can(Perm.inventoryRead),
    _ when loc.startsWith('/more/purchasing') => perms.can(Perm.procurementRead),
    _ => true,
  };
  return allowed ? null : '/orders';
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh();
  ref.listen(sessionProvider, (_, _) => refresh.ping());
  ref.listen(outletControllerProvider, (_, _) => refresh.ping());
  ref.listen(permissionsProvider, (_, _) => refresh.ping());

  final router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) => merchantRedirect(ref, state),
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashPage()),
      GoRoute(path: '/login', builder: (_, _) => const LoginPage()),
      GoRoute(path: '/business', builder: (_, _) => const BusinessPickerPage()),
      GoRoute(path: '/outlet', builder: (_, _) => const OutletPickerPage()),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => HomeShell(shell: shell),
        // branch order matches HomeTab
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/orders',
              builder: (_, _) => const OrdersPage(),
              routes: [
                GoRoute(path: ':id', parentNavigatorKey: rootNavigatorKey, builder: (_, s) => OrderDetailPage(orderId: s.pathParameters['id']!)),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [GoRoute(path: '/kitchen', builder: (_, _) => const KitchenPage())]),
          StatefulShellBranch(routes: [GoRoute(path: '/pos', builder: (_, _) => const PosPage())]),
          StatefulShellBranch(routes: [GoRoute(path: '/menu', builder: (_, _) => const MenuPage())]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/more',
              builder: (_, _) => const MorePage(),
              routes: [
                GoRoute(path: 'sales', builder: (_, _) => const SalesPage()),
                GoRoute(path: 'inventory', builder: (_, _) => const InventoryPage()),
                GoRoute(
                  path: 'purchasing',
                  builder: (_, _) => const ProcurementPage(),
                  routes: [GoRoute(path: 'po/:id', builder: (_, s) => PoDetailPage(poId: s.pathParameters['id']!))],
                ),
                GoRoute(path: 'reviews', builder: (_, _) => const ReviewsPage()),
              ],
            ),
          ]),
        ],
      ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});
