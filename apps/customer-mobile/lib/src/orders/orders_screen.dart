import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../cart/cart_controller.dart';
import '../common/widgets.dart';
import 'models.dart';
import 'providers.dart';

/// Order history with live status, reorder and rate.
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  String? _reordering;

  Future<void> _reorder(OrderSummary o) async {
    setState(() => _reordering = o.id);
    try {
      final skipped = await ref.read(cartProvider.notifier).reorder(o.id);
      if (!mounted) return;
      if (skipped.isNotEmpty) showMessage(context, '${skipped.join(', ')} ${skipped.length == 1 ? 'is' : 'are'} unavailable right now');
      context.push('/cart');
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _reordering = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final history = ref.watch(orderHistoryProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Your orders')),
      body: AsyncView<OrderHistory>(
        value: history,
        onRetry: () => ref.invalidate(orderHistoryProvider),
        data: (h) => h.items.isEmpty
            ? EmptyView(
                icon: Icons.receipt_long_outlined,
                title: 'No orders yet',
                message: 'Your orders and their live status show up here.',
                action: FilledButton(onPressed: () => context.go('/'), child: const Text('Find food')),
              )
            : RefreshIndicator(
                onRefresh: () => ref.refresh(orderHistoryProvider.future),
                child: NotificationListener<ScrollNotification>(
                  onNotification: (n) {
                    if (n.metrics.extentAfter < 600) ref.read(orderHistoryProvider.notifier).loadMore();
                    return false;
                  },
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: h.items.length + 1,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, i) {
                      if (i == h.items.length) {
                        return Center(
                          child: h.loadingMore
                              ? const Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator())
                              : h.moreError != null
                                  ? OutlinedButton(onPressed: () => ref.read(orderHistoryProvider.notifier).loadMore(), child: const Text('Couldn\'t load more — try again'))
                                  : h.hasMore
                                      ? TextButton(onPressed: () => ref.read(orderHistoryProvider.notifier).loadMore(), child: const Text('Older orders'))
                                      : const SizedBox.shrink(),
                        );
                      }
                      return _OrderCard(order: h.items[i], reordering: _reordering == h.items[i].id, onReorder: _reordering == null ? () => _reorder(h.items[i]) : null);
                    },
                  ),
                ),
              ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.reordering, required this.onReorder});
  final OrderSummary order;
  final bool reordering;
  final VoidCallback? onReorder;

  @override
  Widget build(BuildContext context) {
    final o = order;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.push('/orders/${o.id}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              FoodImage(url: o.outletImage, width: 52, height: 52, radius: 10),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(o.outletName, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  Text(o.items.map((i) => '${i.quantity} × ${i.name}').join(', '), maxLines: 1, overflow: TextOverflow.ellipsis, style: text.bodySmall?.copyWith(color: muted)),
                  Text('${o.orderNumber} · ${dateTime(o.placedAt ?? o.createdAt)} · ${money(o.total)}', style: text.bodySmall?.copyWith(color: muted)),
                ]),
              ),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              StatusChip(o.status, label: statusLabel(o.status)),
              const Spacer(),
              if (o.isDone || o.status == 'CANCELLED')
                TextButton.icon(onPressed: onReorder, icon: reordering ? const ButtonSpinner() : const Icon(Icons.replay), label: const Text('Reorder')),
              if (o.isActive) FilledButton.tonal(onPressed: () => context.push('/orders/${o.id}'), child: const Text('Track order')),
              if (o.isDone && o.reviewRating == null) TextButton.icon(onPressed: () => context.push('/orders/${o.id}?rate=1'), icon: const Icon(Icons.star_outline), label: const Text('Rate')),
              if (o.reviewRating != null)
                Semantics(
                  label: 'You rated ${o.reviewRating} out of 5',
                  excludeSemantics: true,
                  child: Row(children: [Text('You rated ${o.reviewRating}', style: text.bodySmall?.copyWith(color: muted)), const Icon(Icons.star_rounded, size: 14, color: Color(0xFFE8A317))]),
                ),
            ]),
          ]),
        ),
      ),
    );
  }
}
