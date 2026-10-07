import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../../core/permissions.dart';
import '../../core/ui.dart';
import '../outlets/outlet_providers.dart';
import 'order_card.dart';
import 'orders_board.dart';

/// Home: live orders for the current outlet, grouped New / Preparing /
/// Ready / Done today, refreshed every 10 seconds.
class OrdersPage extends ConsumerWidget {
  const OrdersPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final outlet = ref.watch(currentOutletProvider);
    final outlets = ref.watch(outletControllerProvider).value?.outlets.length ?? 0;
    final board = ref.watch(ordersBoardProvider);
    final value = board.value;
    final perms = ref.watch(permissionsProvider);

    return DefaultTabController(
      length: Lane.values.length,
      child: Scaffold(
        appBar: AppBar(
          title: InkWell(
            onTap: outlets > 1 ? () => context.push('/outlet') : null,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(mainAxisSize: MainAxisSize.min, children: [
                Flexible(child: Text(outlet?.name ?? 'Orders', overflow: TextOverflow.ellipsis)),
                if (outlets > 1) const Icon(Icons.arrow_drop_down, semanticLabel: 'Switch outlet'),
              ]),
              Text(
                value?.fetchedAt == null ? 'Live orders' : 'Live · updated ${time(value!.fetchedAt)}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ]),
          ),
          actions: [
            IconButton(
              tooltip: 'Refresh orders',
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.read(ordersBoardProvider.notifier).refresh(),
            ),
          ],
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              for (final lane in Lane.values) LaneTab(label: lane.label, count: value?.count(lane) ?? 0, highlight: lane == Lane.fresh),
            ],
          ),
        ),
        body: Column(children: [
          if (outlet != null && !outlet.isOpen) _ClosedBanner(canOpen: perms.can(Perm.ordersManage), outletId: outlet.id),
          if (value?.refreshError != null) StaleBanner(error: value!.refreshError!, onRetry: () => ref.read(ordersBoardProvider.notifier).refresh()),
          Expanded(
            child: AsyncView<OrdersBoard>(
              value: board,
              onRetry: () => ref.invalidate(ordersBoardProvider),
              data: (b) => TabBarView(children: [for (final lane in Lane.values) _LaneList(lane: lane, board: b)]),
            ),
          ),
        ]),
      ),
    );
  }
}

class _LaneList extends ConsumerWidget {
  const _LaneList({required this.lane, required this.board});
  final Lane lane;
  final OrdersBoard board;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = board[lane];
    Future<void> refresh() => ref.read(ordersBoardProvider.notifier).refresh();
    if (orders.isEmpty) {
      final (title, message) = switch (lane) {
        Lane.fresh => ('No new orders', 'New orders appear here automatically and this phone chimes.'),
        Lane.preparing => ('Nothing cooking', 'Accepted orders move here.'),
        Lane.ready => ('Nothing waiting at the pass', 'Orders marked ready wait here for pickup or hand-over.'),
        Lane.done => ('No completed orders yet today', 'Handed-over, delivered and cancelled orders from today (IST).'),
      };
      return RefreshIndicator(onRefresh: refresh, child: LaneEmpty(title: title, message: message, icon: lane.icon));
    }
    if (lane == Lane.done) {
      return RefreshIndicator(
        onRefresh: refresh,
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: orders.length,
          separatorBuilder: (_, _) => const Divider(height: 1),
          itemBuilder: (_, i) => DoneOrderTile(order: orders[i]),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView.separated(
        padding: const EdgeInsets.all(12),
        itemCount: orders.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (_, i) => OrderCard(order: orders[i]),
      ),
    );
  }
}

class _ClosedBanner extends ConsumerWidget {
  const _ClosedBanner({required this.canOpen, required this.outletId});
  final bool canOpen;
  final String outletId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.secondaryContainer,
      child: ListTile(
        leading: Icon(Icons.store_mall_directory_outlined, color: scheme.onSecondaryContainer),
        title: Text('Closed: not taking new orders', style: TextStyle(color: scheme.onSecondaryContainer, fontWeight: FontWeight.w600)),
        trailing: canOpen
            ? ActionButton(
                label: 'Open',
                kind: ActionKind.tonal,
                onPressed: () async {
                  await ref.read(outletControllerProvider.notifier).setOpen(outletId, true);
                  if (context.mounted) showMessage(context, 'Open for orders');
                },
              )
            : null,
      ),
    );
  }
}

