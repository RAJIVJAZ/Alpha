import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import 'demand/demand_screen.dart';
import 'duty/duty_screen.dart';
import 'earnings/earnings_screen.dart';
import 'performance/performance_screen.dart';
import 'shell/home_shell.dart';
import 'trips/trips_screen.dart';

/// Only delivery partners may use this app.
String? authorizeRider(Claims claims) => claims.hasRole('RIDER') ? null : 'This number is not registered as a FoodGrid rider.';

class RiderLoginScreen extends StatelessWidget {
  const RiderLoginScreen({super.key});

  @override
  Widget build(BuildContext context) => const LoginScreen(
        title: 'FoodGrid Rider',
        subtitle: 'Sign in with the mobile number you registered as a delivery partner.',
        authorize: authorizeRider,
      );
}

/// Where the session says the rider should be, or null to stay at [location].
String? sessionRedirect(AsyncValue<Session?> session, String location) {
  if (session.isLoading && !session.hasValue) return location == '/splash' ? null : '/splash';
  final s = session.value;
  final signedIn = s != null && authorizeRider(s.claims) == null;
  if (!signedIn) return location == '/login' ? null : '/login';
  if (location == '/login' || location == '/splash') return '/duty';
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
      GoRoute(path: '/splash', builder: (_, _) => const SplashView()),
      GoRoute(path: '/login', builder: (_, _) => const RiderLoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => HomeShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/duty', builder: (_, _) => const DutyScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/earnings', builder: (_, _) => const EarningsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/performance', builder: (_, _) => const PerformanceScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/demand', builder: (_, _) => const DemandScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/trips', builder: (_, _) => const TripsScreen())]),
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
