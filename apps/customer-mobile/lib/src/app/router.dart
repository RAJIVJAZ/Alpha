import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart' hide Page;
import 'package:go_router/go_router.dart';

import '../account/account_screen.dart';
import '../account/addresses_screen.dart';
import '../account/preferences_screen.dart';
import '../account/profile_screen.dart';
import '../cart/checkout_screen.dart';
import '../discovery/home_screen.dart';
import '../discovery/search_screen.dart';
import '../meal_plans/meal_plans_screen.dart';
import '../membership/membership_screen.dart';
import '../notifications/notifications_screen.dart';
import '../orders/order_screen.dart';
import '../orders/orders_screen.dart';
import '../outlet/outlet_screen.dart';
import '../table/scan_screen.dart';
import '../table/table_screen.dart';
import '../wallet/wallet_screen.dart';
import 'shell.dart';
import 'sign_in_screen.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');

/// Where the app starts (tests start elsewhere).
final initialLocationProvider = Provider<String>((ref) => '/');

const _private = ['/cart', '/orders', '/account', '/wallet', '/meal-plans', '/notifications'];

/// Browsing (home, search, outlets, table menus, membership plans) is public;
/// the cart, orders, wallet and account need a signed-in customer.
bool requiresSignIn(String path) => _private.any((p) => path == p || path.startsWith('$p/'));

/// Splash while the stored session is restored, then sign-in for private pages.
String? sessionRedirect(AsyncValue<Session?> session, Uri uri) {
  final path = uri.path;
  if (session.isLoading && !session.hasValue) {
    return path == '/splash' ? null : Uri(path: '/splash', queryParameters: {'from': uri.toString()}).toString();
  }
  if (path == '/splash') return uri.queryParameters['from'] ?? '/';
  final signedIn = session.value != null;
  if (!signedIn && requiresSignIn(path)) return Uri(path: '/login', queryParameters: {'from': uri.toString()}).toString();
  return null;
}

Page<void> _page(GoRouterState state, Widget child) => MaterialPage<void>(key: state.pageKey, name: state.uri.path, child: child);

GoRoute _route(String path, Widget Function(GoRouterState s) build) => GoRoute(path: path, pageBuilder: (context, state) => _page(state, build(state)));

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(sessionProvider, (_, _) => refresh.value++);
  final router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: ref.read(initialLocationProvider),
    refreshListenable: refresh,
    redirect: (context, state) => sessionRedirect(ref.read(sessionProvider), state.uri),
    errorPageBuilder: (context, state) => _page(state, const NotFoundScreen()),
    routes: [
      _route('/splash', (s) => const SplashView()),
      _route('/login', (s) => SignInScreen(from: s.uri.queryParameters['from'])),
      // pages above the tabs; listed first so /orders/:id wins over the Orders tab
      _route('/outlets/:slug', (s) => OutletScreen(slug: s.pathParameters['slug']!)),
      _route('/cart', (s) => CheckoutScreen(coupon: s.uri.queryParameters['coupon'])),
      _route('/orders/:id', (s) => OrderScreen(orderId: s.pathParameters['id']!, rate: s.uri.queryParameters['rate'] == '1')),
      _route('/wallet', (s) => const WalletScreen()),
      _route('/membership', (s) => const MembershipScreen()),
      _route('/meal-plans', (s) => const MealPlansScreen()),
      _route('/notifications', (s) => const NotificationsScreen()),
      _route('/account/profile', (s) => const ProfileScreen()),
      _route('/account/addresses', (s) => const AddressesScreen()),
      _route('/account/preferences', (s) => const PreferencesScreen()),
      _route('/scan', (s) => const ScanScreen()),
      _route('/t/:token', (s) => TableScreen(token: s.pathParameters['token']!)),
      StatefulShellRoute.indexedStack(
        pageBuilder: (context, state, shell) => _page(state, AppShell(shell: shell)),
        branches: [
          StatefulShellBranch(routes: [_route('/', (s) => const HomeScreen())]),
          StatefulShellBranch(routes: [_route('/search', (s) => SearchScreen(query: s.uri.queryParameters['q']))]),
          StatefulShellBranch(routes: [_route('/orders', (s) => const OrdersScreen())]),
          StatefulShellBranch(routes: [_route('/account', (s) => const AccountScreen())]),
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

class NotFoundScreen extends StatelessWidget {
  const NotFoundScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: EmptyView(
          icon: Icons.explore_off_outlined,
          title: 'Page not found',
          message: 'This link may have expired.',
          action: FilledButton(onPressed: () => context.go('/'), child: const Text('Go home')),
        ),
      );
}
