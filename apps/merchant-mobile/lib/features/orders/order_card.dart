import 'package:flutter/material.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../../core/ui.dart';
import 'order.dart';
import 'order_actions.dart';

IconData orderTypeIcon(String type) => switch (type) {
      'DELIVERY' => Icons.delivery_dining,
      'TAKEAWAY' => Icons.shopping_bag_outlined,
      'DINE_IN' => Icons.restaurant,
      _ => Icons.receipt_long,
    };

/// One order on the board: big order number, what to cook, the next action.
class OrderCard extends StatelessWidget {
  const OrderCard({super.key, required this.order, this.now});
  final MerchantOrder order;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final o = order;
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurfaceVariant;
    final shown = o.items.take(5).toList();
    final more = o.items.length - shown.length;
    final current = now ?? DateTime.now();
    final late = o.estimatedReadyAt != null && ['ACCEPTED', 'PREPARING'].contains(o.status) && current.isAfter(o.estimatedReadyAt!);

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.push('/orders/${o.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Tooltip(message: humanize(o.type), child: Icon(orderTypeIcon(o.type), size: 28, semanticLabel: humanize(o.type))),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(o.orderNumber, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                  Text(
                    [humanize(o.type), humanize(o.channel), o.customerName ?? 'Guest'].join(' · '),
                    style: text.bodyMedium?.copyWith(color: muted),
                  ),
                ]),
              ),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(time(o.placedOrCreated), style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                Text(relative(o.placedOrCreated, now: current), style: text.bodySmall?.copyWith(color: muted)),
              ]),
            ]),
            const SizedBox(height: 10),
            Wrap(spacing: 6, runSpacing: 6, children: [
              StatusChip(o.status),
              StatusChip(o.paymentStatus, label: [if (o.paymentMethod != null) humanize(o.paymentMethod), humanize(o.paymentStatus)].join(' · ')),
              if (late) const StatusChip('OVERDUE', label: 'Past promised time'),
            ]),
            const SizedBox(height: 10),
            for (final i in shown)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text.rich(
                  TextSpan(children: [
                    TextSpan(text: '${i.quantity} × ', style: const TextStyle(fontWeight: FontWeight.w700)),
                    TextSpan(text: i.name),
                    if (i.options.isNotEmpty) TextSpan(text: '  (${i.options})', style: TextStyle(color: muted)),
                  ]),
                  style: text.titleMedium,
                ),
              ),
            if (more > 0) Text('+ $more more item${more == 1 ? '' : 's'}', style: text.bodyMedium?.copyWith(color: muted)),
            if (o.specialInstructions != null || o.items.any((i) => i.notes != null))
              Container(
                margin: const EdgeInsets.only(top: 6),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: scheme.tertiaryContainer, borderRadius: BorderRadius.circular(8)),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(Icons.sticky_note_2_outlined, size: 18, color: scheme.onTertiaryContainer),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      [?o.specialInstructions, for (final i in o.items) if (i.notes != null) '${i.name}: ${i.notes}'].join('\n'),
                      style: text.bodyMedium?.copyWith(color: scheme.onTertiaryContainer),
                    ),
                  ),
                ]),
              ),
            const SizedBox(height: 10),
            Row(children: [
              Text(money(o.total), style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600, fontFeatures: const [FontFeature.tabularFigures()])),
              if (o.estimatedReadyAt != null && ['ACCEPTED', 'PREPARING', 'READY'].contains(o.status)) ...[
                const SizedBox(width: 10),
                Icon(Icons.schedule, size: 16, color: muted),
                const SizedBox(width: 2),
                Flexible(child: Text('Ready by ${time(o.estimatedReadyAt)}', style: text.bodyMedium?.copyWith(color: muted))),
              ],
            ]),
            const SizedBox(height: 8),
            OrderActions(order: o, large: true),
          ]),
        ),
      ),
    );
  }
}

/// Section of compact rows for the "Done today" lane.
class DoneOrderTile extends StatelessWidget {
  const DoneOrderTile({super.key, required this.order});
  final MerchantOrder order;

  @override
  Widget build(BuildContext context) => ListTile(
        onTap: () => context.push('/orders/${order.id}'),
        leading: Icon(orderTypeIcon(order.type), semanticLabel: humanize(order.type)),
        title: Text(order.orderNumber, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('${time(order.placedOrCreated)} · ${order.customerName ?? 'Guest'} · ${order.itemCount} items'),
        trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(money(order.total)),
          const SizedBox(height: 2),
          StatusChip(order.status),
        ]),
      );
}

/// Shown for an empty lane.
class LaneEmpty extends StatelessWidget {
  const LaneEmpty({super.key, required this.title, required this.message, required this.icon});
  final String title;
  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) => ListView(children: [
        const SizedBox(height: 60),
        EmptyView(icon: icon, title: title, message: message),
      ]);
}

/// Tab label with a count bubble.
class LaneTab extends StatelessWidget {
  const LaneTab({super.key, required this.label, required this.count, this.highlight = false});
  final String label;
  final int count;
  final bool highlight;

  @override
  Widget build(BuildContext context) => Tab(
        child: Semantics(
          label: '$label, $count',
          excludeSemantics: true,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
            const SizedBox(width: 6),
            CountBadge(count, highlight: highlight && count > 0),
          ]),
        ),
      );
}
