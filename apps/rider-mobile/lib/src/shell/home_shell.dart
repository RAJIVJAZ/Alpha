import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../common/widgets.dart';
import '../duty/duty_providers.dart';
import '../duty/location_tracker.dart';
import '../duty/rider_events.dart';

/// Bottom navigation for the signed-in rider. Also owns what must keep
/// running whatever tab is open: location sharing and the rider socket.
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  static const destinations = [
    NavigationDestination(icon: Icon(Icons.two_wheeler_outlined), selectedIcon: Icon(Icons.two_wheeler), label: 'Duty'),
    NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Earnings'),
    NavigationDestination(icon: Icon(Icons.emoji_events_outlined), selectedIcon: Icon(Icons.emoji_events), label: 'Performance'),
    NavigationDestination(icon: Icon(Icons.map_outlined), selectedIcon: Icon(Icons.map), label: 'Demand'),
    NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Trips'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(locationTrackerProvider, (_, _) {});
    ref.listen<AsyncValue<RiderEvent>>(riderEventsProvider, (_, next) {
      final e = next.value;
      if (e != null) _onEvent(context, ref, e);
    });

    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: destinations,
      ),
    );
  }

  void _onEvent(BuildContext context, WidgetRef ref, RiderEvent e) {
    final messenger = ScaffoldMessenger.of(context);
    final order = e.orderNumber == null ? 'An order' : 'Order ${e.orderNumber}';
    switch (e.name) {
      case 'offer:new':
        ref.invalidate(offersProvider);
        HapticFeedback.heavyImpact();
        if (shell.currentIndex != 0) {
          toast(messenger, 'New order offer', action: SnackBarAction(label: 'View', onPressed: () => shell.goBranch(0)));
        }
      case 'order:ready':
        ref.invalidate(currentDeliveriesProvider);
        toast(messenger, '$order is ready for pickup');
      case 'delivery:cancelled':
        refreshDuty(ref.invalidate);
        HapticFeedback.mediumImpact();
        toast(messenger, '$order was cancelled — no need to continue');
    }
  }
}
