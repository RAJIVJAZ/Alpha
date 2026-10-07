import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../notifications/notifications_provider.dart';
import 'cart_controller.dart';

/// App bar cart icon with the number of items.
class CartButton extends ConsumerWidget {
  const CartButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(cartProvider).value?.count ?? 0;
    return IconButton(
      key: const Key('cart-button'),
      tooltip: count > 0 ? 'Cart, $count item${count == 1 ? '' : 's'}' : 'Cart',
      onPressed: () => context.push('/cart'),
      icon: Badge(isLabelVisible: count > 0, label: Text('$count'), child: const Icon(Icons.shopping_bag_outlined)),
    );
  }
}

/// Bell with an unread dot (signed-in customers only).
class NotificationsButton extends ConsumerWidget {
  const NotificationsButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(sessionProvider).value == null) return const SizedBox.shrink();
    final unread = ref.watch(inboxProvider).value?.unread ?? 0;
    return IconButton(
      tooltip: unread > 0 ? 'Notifications, $unread unread' : 'Notifications',
      onPressed: () => context.push('/notifications'),
      icon: Badge(isLabelVisible: unread > 0, smallSize: 8, child: const Icon(Icons.notifications_outlined)),
    );
  }
}
