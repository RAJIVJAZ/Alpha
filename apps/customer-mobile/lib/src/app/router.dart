import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
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
  if (session.isRestoring) {
    return path == '/splash' ? null : Uri(path: '/splash', queryParameters: {'from': uri.toString()}).toString();
  }
  if (path == '/splash') return uri.queryParameters['from'] ?? '/';
  final signedIn = session.value != null;
  if (!signedIn && requiresSignIn(path)) return Uri(path: '/login', queryParameters: {'from': uri.toString()}).toString();
  return null;
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(sessionProvider, (_, _) => refresh.value++);
  final router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: ref.read(initialLocationProvider),
    refreshListenable: refresh,
    redirect: (context, state) => sessionRedirect(ref.read(sessionProvider), state.uri),
    errorPageBuilder: (context, state) => materialPage(state, const NotFoundScreen()),
    routes: [
      materialRoute('/splash', (_, _) => const SplashView()),
      materialRoute('/login', (_, s) => SignInScreen(from: s.uri.queryParameters['from'])),
      // pages above the tabs; listed first so /orders/:id wins over the Orders tab
      materialRoute('/outlets/:slug', (_, s) => OutletScreen(slug: s.pathParameters['slug']!)),
      materialRoute('/cart', (_, s) => CheckoutScreen(coupon: s.uri.queryParameters['coupon'])),
      materialRoute('/orders/:id', (_, s) => OrderScreen(orderId: s.pathParameters['id']!, rate: s.uri.queryParameters['rate'] == '1')),
      materialRoute('/wallet', (_, _) => const WalletScreen()),
      materialRoute('/membership', (_, _) => const MembershipScreen()),
      materialRoute('/meal-plans', (_, _) => const MealPlansScreen()),
      materialRoute('/notifications', (_, _) => const NotificationsScreen()),
      materialRoute('/account/profile', (_, _) => const ProfileScreen()),
      materialRoute('/account/addresses', (_, _) => const AddressesScreen()),
      materialRoute('/account/preferences', (_, _) => const PreferencesScreen()),
      materialRoute('/scan', (_, _) => const ScanScreen()),
      materialRoute('/t/:token', (_, s) => TableScreen(token: s.pathParameters['token']!)),
      StatefulShellRoute.indexedStack(
        pageBuilder: (context, state, shell) => materialPage(state, AppShell(shell: shell)),
        branches: [
          StatefulShellBranch(routes: [materialRoute('/', (_, _) => const HomeScreen())]),
          StatefulShellBranch(routes: [materialRoute('/search', (_, s) => SearchScreen(query: s.uri.queryParameters['q']))]),
          StatefulShellBranch(routes: [materialRoute('/orders', (_, _) => const OrdersScreen())]),
          StatefulShellBranch(routes: [materialRoute('/account', (_, _) => const AccountScreen())]),
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
