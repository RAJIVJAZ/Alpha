import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/errors.dart';
import '../../core/permissions.dart';
import '../../core/ui.dart';
import 'order.dart';
import 'order_actions.dart';
import 'order_card.dart';
import 'orders_repository.dart';

const _cancellable = ['ACCEPTED', 'PREPARING', 'READY'];

/// Items, add-ons, notes, customer, payment and the bill for one order.
class OrderDetailPage extends ConsumerWidget {
  const OrderDetailPage({super.key, required this.orderId});
  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(orderDetailProvider(orderId));
    final perms = ref.watch(permissionsProvider);
    final o = order.value;
    return Scaffold(
      appBar: AppBar(
        title: Text(o?.orderNumber ?? 'Order'),
        actions: [
          if (o != null && perms.can(Perm.ordersManage) && _cancellable.contains(o.status))
            PopupMenuButton<String>(
              tooltip: 'More actions',
              onSelected: (_) => _cancel(context, o),
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'cancel', child: ListTile(leading: Icon(Icons.cancel_outlined), title: Text('Cancel order'), contentPadding: EdgeInsets.zero)),
              ],
            ),
        ],
      ),
      body: AsyncView<MerchantOrder>(
        value: order,
        onRetry: () => ref.invalidate(orderDetailProvider(orderId)),
        data: (o) => RefreshIndicator(
          onRefresh: () => ref.refresh(orderDetailProvider(orderId).future),
          child: _OrderDetailBody(order: o),
        ),
      ),
    );
  }

  Future<void> _cancel(BuildContext context, MerchantOrder o) async {
    final reason = await pickReason(
      context,
      title: 'Cancel ${o.orderNumber}?',
      message: 'The customer is refunded and notified. Use this only if the order truly cannot be made.',
      confirmLabel: 'Cancel order',
      reasons: cancelReasons,
    );
    if (reason == null || !context.mounted) return;
    try {
      await runOrderAction(context, o, (r) => r.cancel(o.id, reason), 'cancelled');
    } catch (e) {
      if (context.mounted) showApiError(context, e);
    }
  }
}

class _OrderDetailBody extends StatelessWidget {
  const _OrderDetailBody({required this.order});
  final MerchantOrder order;

  @override
  Widget build(BuildContext context) {
    final o = order;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Wrap(spacing: 6, runSpacing: 6, children: [
          StatusChip(o.status),
          StatusChip(o.type, label: humanize(o.type), tone: Tone.neutral),
          StatusChip(o.channel, label: humanize(o.channel), tone: Tone.neutral),
        ]),
        const SizedBox(height: 8),
        Text('Placed ${dateTime(o.placedOrCreated)} (${relative(o.placedOrCreated)})', style: text.bodyMedium?.copyWith(color: muted)),
        if (o.estimatedReadyAt != null) Text('Ready by ${time(o.estimatedReadyAt)}', style: text.bodyMedium?.copyWith(color: muted)),
        const SizedBox(height: 12),
        OrderActions(order: o, large: true),
        const SectionHeader('Customer', padding: EdgeInsets.fromLTRB(0, 20, 0, 6)),
        Card(
          child: ListTile(
            leading: Icon(orderTypeIcon(o.type), semanticLabel: humanize(o.type)),
            title: Text(o.customerName ?? (o.channel == 'POS' ? 'Walk-in' : 'Guest')),
            subtitle: Text([?o.customerPhone, ?o.deliveryAddress].join('\n')),
            isThreeLine: o.customerPhone != null && o.deliveryAddress != null,
          ),
        ),
        SectionHeader('Items', count: o.itemCount, padding: const EdgeInsets.fromLTRB(0, 20, 0, 6)),
        Card(
          child: Column(children: [
            for (final (index, i) in o.items.indexed) ...[
              if (index > 0) const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (i.isVeg != null) Padding(padding: const EdgeInsets.only(top: 4, right: 8), child: VegMark(veg: i.isVeg!)),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${i.quantity} × ${i.name}', style: text.titleMedium),
                      if (i.variant != null) Text('Size: ${i.variant}', style: text.bodyMedium?.copyWith(color: muted)),
                      if (i.addons.isNotEmpty) Text('Add-ons: ${i.addons.join(', ')}', style: text.bodyMedium?.copyWith(color: muted)),
                      if (i.notes != null) Text('Note: ${i.notes}', style: text.bodyMedium?.copyWith(fontStyle: FontStyle.italic)),
                    ]),
                  ),
                  Text(money(i.totalPrice), style: text.bodyLarge),
                ]),
              ),
            ],
          ]),
        ),
        if (o.specialInstructions != null) ...[
          const SectionHeader('Instructions', padding: EdgeInsets.fromLTRB(0, 20, 0, 6)),
          Card(child: Padding(padding: const EdgeInsets.all(12), child: Text('“${o.specialInstructions}”', style: text.titleMedium))),
        ],
        const SectionHeader('Bill', padding: EdgeInsets.fromLTRB(0, 20, 0, 6)),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(children: [
              AmountRow('Item total', money(o.subtotal)),
              if (o.discount > 0) AmountRow('Discount', '-${money(o.discount)}'),
              if (o.packagingCharge > 0) AmountRow('Packaging', money(o.packagingCharge)),
              if (o.deliveryFee > 0) AmountRow('Delivery fee', money(o.deliveryFee)),
              if (o.platformFee > 0) AmountRow('Platform fee', money(o.platformFee)),
              if (o.igst > 0) AmountRow('IGST', money(o.igst)) else ...[AmountRow('CGST', money(o.cgst)), AmountRow('SGST', money(o.sgst))],
              if (o.tip > 0) AmountRow('Tip', money(o.tip)),
              if (o.roundOff != 0) AmountRow('Round off', money(o.roundOff)),
              const Divider(),
              AmountRow('Total', money(o.total), bold: true),
              const SizedBox(height: 6),
              Row(children: [
                Text('Payment', style: text.bodyLarge),
                const Spacer(),
                StatusChip(o.paymentStatus, label: [if (o.paymentMethod != null) humanize(o.paymentMethod), humanize(o.paymentStatus)].join(' · ')),
              ]),
            ]),
          ),
        ),
        if (o.cancelReason != null) ...[
          const SizedBox(height: 12),
          PermissionNote('Reason: ${o.cancelReason}'),
        ],
        if (o.events.isNotEmpty) ...[
          const SectionHeader('Timeline', padding: EdgeInsets.fromLTRB(0, 20, 0, 6)),
          for (final e in o.events)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.circle, size: 10),
              title: Text(humanize(e.status)),
              subtitle: e.note == null ? null : Text(e.note!),
              trailing: Text(time(e.at)),
            ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }
}
