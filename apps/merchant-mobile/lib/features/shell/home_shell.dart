import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/order_alert.dart';
import '../../core/permissions.dart';
import '../orders/orders_board.dart';
import '../outlets/outlet_providers.dart';

/// Branch order in the router's StatefulShellRoute.
enum HomeTab { orders, kitchen, pos, menu, more }

/// Tabs this role can use; food carts put the counter second.
List<HomeTab> visibleTabs(Permissions perms, {required bool foodCart}) => [
      HomeTab.orders,
      if (foodCart && perms.can(Perm.posOperate)) HomeTab.pos,
      if (perms.can(Perm.kdsOperate)) HomeTab.kitchen,
      if (!foodCart && perms.can(Perm.posOperate)) HomeTab.pos,
      HomeTab.menu,
      HomeTab.more,
    ];

/// Bottom navigation, the new-order alert and its badge.
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final perms = ref.watch(permissionsProvider);
    final foodCart = ref.watch(currentOutletProvider.select((o) => o?.isFoodCart ?? false));
    final waiting = ref.watch(newOrderCountProvider);
    final tabs = visibleTabs(perms, foodCart: foodCart);
    final current = HomeTab.values[shell.currentIndex];
    final selected = tabs.indexOf(current);

    ref.listen<AsyncValue<OrdersBoard>>(ordersBoardProvider, (previous, next) {
      final arrived = next.value?.arrived ?? const [];
      if (arrived.isEmpty || identical(previous?.value, next.value)) return;
      ref.read(orderAlerterProvider).newOrders(arrived.length);
      final messenger = ScaffoldMessenger.of(context);
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(SnackBar(
        duration: const Duration(seconds: 8),
        content: Text(arrived.length == 1 ? 'New order ${arrived.first.orderNumber}' : '${arrived.length} new orders'),
        action: SnackBarAction(label: 'View', onPressed: () => shell.goBranch(HomeTab.orders.index)),
      ));
    });

    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selected < 0 ? 0 : selected,
        onDestinationSelected: (i) => shell.goBranch(tabs[i].index, initialLocation: tabs[i] == current),
        destinations: [
          for (final t in tabs)
            switch (t) {
              HomeTab.orders => NavigationDestination(
                  icon: Badge(isLabelVisible: waiting > 0, label: Text('$waiting'), child: const Icon(Icons.receipt_long_outlined)),
                  selectedIcon: Badge(isLabelVisible: waiting > 0, label: Text('$waiting'), child: const Icon(Icons.receipt_long)),
                  label: 'Orders',
                  tooltip: waiting > 0 ? 'Orders, $waiting waiting to be accepted' : 'Orders',
                ),
              HomeTab.kitchen => const NavigationDestination(icon: Icon(Icons.soup_kitchen_outlined), selectedIcon: Icon(Icons.soup_kitchen), label: 'Kitchen'),
              HomeTab.pos => const NavigationDestination(icon: Icon(Icons.point_of_sale_outlined), selectedIcon: Icon(Icons.point_of_sale), label: 'Counter'),
              HomeTab.menu => const NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'Menu'),
              HomeTab.more => const NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
            },
        ],
      ),
    );
  }
}
