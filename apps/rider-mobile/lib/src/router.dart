import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import 'apply/apply_screen.dart';
import 'demand/demand_screen.dart';
import 'duty/duty_screen.dart';
import 'earnings/earnings_screen.dart';
import 'performance/performance_screen.dart';
import 'shell/home_shell.dart';
import 'trips/trips_screen.dart';

class RiderLoginScreen extends StatelessWidget {
  const RiderLoginScreen({super.key});

  @override
  Widget build(BuildContext context) => const LoginScreen(
        title: 'FoodGrid Rider',
        subtitle: 'Sign in with your mobile number. New to FoodGrid? Sign in and apply to deliver.',
        allowGoogle: true,
      );
}

/// Where the session says the user should be, or null to stay at [location].
/// Accounts without the RIDER role apply to become a delivery partner.
String? sessionRedirect(AsyncValue<Session?> session, String location) {
  if (session.isRestoring) return location == '/splash' ? null : '/splash';
  final s = session.value;
  if (s == null) return location == '/login' ? null : '/login';
  if (!s.claims.hasRole('RIDER')) return location == '/apply' ? null : '/apply';
  if (location == '/login' || location == '/splash' || location == '/apply') return '/duty';
  return null;
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(sessionProvider, (_, _) => refresh.value++);

  final router = GoRouter(
    initialLocation: '/duty',
    refreshListenable: refresh,
    redirect: (context, state) => sessionRedirect(ref.read(sessionProvider), state.matchedLocation),
    routes: [
      materialRoute('/splash', (_, _) => const SplashView()),
      materialRoute('/login', (_, _) => const RiderLoginScreen()),
      materialRoute('/apply', (_, _) => const ApplyScreen()),
      StatefulShellRoute.indexedStack(
        pageBuilder: (context, state, shell) => materialPage(state, HomeShell(shell: shell)),
        branches: [
          StatefulShellBranch(routes: [materialRoute('/duty', (_, _) => const DutyScreen())]),
          StatefulShellBranch(routes: [materialRoute('/earnings', (_, _) => const EarningsScreen())]),
          StatefulShellBranch(routes: [materialRoute('/performance', (_, _) => const PerformanceScreen())]),
          StatefulShellBranch(routes: [materialRoute('/demand', (_, _) => const DemandScreen())]),
          StatefulShellBranch(routes: [materialRoute('/trips', (_, _) => const TripsScreen())]),
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
