import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../common/device.dart';
import '../../common/errors.dart';
import '../../common/widgets.dart';
import '../duty_providers.dart';
import '../duty_repository.dart';
import '../location_tracker.dart';
import '../models.dart';
import 'complete_sheet.dart';
import 'fail_sheet.dart';

/// What the rider is doing in each status and the button that moves it on.
class DeliveryStep {
  const DeliveryStep(this.label, this.action, this.next, this.icon);
  final String label;
  final String action;
  final String next;
  final IconData icon;
}

const deliverySteps = <String, DeliveryStep>{
  'ASSIGNED': DeliveryStep('Going to the restaurant', 'arrived-pickup', "I've reached the restaurant", Icons.storefront),
  'AT_PICKUP': DeliveryStep('At the restaurant', 'picked-up', 'Order picked up', Icons.shopping_bag_outlined),
  'PICKED_UP': DeliveryStep('Going to the customer', 'arrived-drop', "I've reached the customer", Icons.location_on_outlined),
  'AT_DROP': DeliveryStep('At the customer', 'complete', 'Complete delivery', Icons.check_circle_outline),
};

/// One delivery in progress: where to go, navigation and calls, and the next step.
class ActiveDeliveryCard extends ConsumerStatefulWidget {
  const ActiveDeliveryCard({super.key, required this.delivery});
  final Delivery delivery;

  @override
  ConsumerState<ActiveDeliveryCard> createState() => _ActiveDeliveryCardState();
}

class _ActiveDeliveryCardState extends ConsumerState<ActiveDeliveryCard> {
  bool _busy = false;

  Future<void> _advance(DeliveryStep step) async {
    final d = widget.delivery;
    if (step.action == 'complete') return _complete();
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      // the server checks arrivals against the rider's last known position
      if (geofencedActions.contains(step.action)) await container.read(locationTrackerProvider.notifier).pingNow();
      await container.read(dutyRepositoryProvider).step(d.id, step.action);
      if (step.action == 'picked-up') toast(messenger, 'Picked up ${d.orderNumber} — head to the customer');
      await container.refresh(currentDeliveriesProvider.future);
    } catch (e) {
      toast(messenger, riderMessage(e));
      container.invalidate(currentDeliveriesProvider);
    } finally {
      container.invalidate(routeProvider);
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _complete() async {
    final d = widget.delivery;
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => CompleteSheet(delivery: d),
    );
    if (done != true) return;
    toast(messenger, 'Delivered! ${money(d.totalEarning)} added to your earnings');
    refreshDuty(container.invalidate);
  }

  Future<void> _fail() async {
    final d = widget.delivery;
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    final failed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => FailSheet(delivery: d),
    );
    if (failed != true) return;
    toast(messenger, 'Reported — support will contact you about the order');
    refreshDuty(container.invalidate);
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.delivery;
    final step = deliverySteps[d.status];
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final toPickup = d.toPickup;
    final phone = toPickup ? d.pickupPhone : d.dropPhone;
    final (lat, lng) = toPickup ? (d.pickupLat, d.pickupLng) : (d.dropLat, d.dropLng);
    final earn = [
      'earn ${money(d.riderEarning)}',
      if (d.tipAmount > 0) '+ ${money(d.tipAmount, whole: true)} tip',
    ].join(' ');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(d.orderNumber, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                Caption('${step?.label ?? humanize(d.status)} · $earn'),
              ]),
            ),
            StatusChip(d.status),
          ]),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(border: Border.all(color: scheme.outlineVariant), borderRadius: BorderRadius.circular(10)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(toPickup ? 'PICK UP FROM' : 'DELIVER TO', style: text.labelSmall?.copyWith(color: scheme.onSurfaceVariant, letterSpacing: 0.8)),
              const SizedBox(height: 2),
              Text(toPickup ? d.pickupName : (d.dropName ?? 'Customer'), style: text.titleMedium),
              Text(toPickup ? d.pickupAddress : d.dropAddress, style: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
              if (d.isCod && !toPickup) ...[
                const SizedBox(height: 6),
                Text('Collect ${money(d.codAmount)} in cash', style: text.titleSmall?.copyWith(color: scheme.primary, fontWeight: FontWeight.w700)),
              ],
            ]),
          ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => openExternal(context, ref, directionsUri(lat, lng)),
                icon: const Icon(Icons.navigation_outlined),
                label: Text('Navigate', semanticsLabel: toPickup ? 'Navigate to restaurant' : 'Navigate to customer', maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ),
            if (phone != null) ...[
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => openExternal(context, ref, telUri(phone)),
                  icon: const Icon(Icons.call_outlined),
                  label: Text(toPickup ? 'Call restaurant' : 'Call customer', maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
              ),
            ],
          ]),
          if (step != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              height: 60,
              child: FilledButton.icon(
                onPressed: _busy ? null : () => _advance(step),
                icon: _busy ? const ButtonSpinner(color: Colors.white) : Icon(step.icon),
                label: Text(step.next),
              ),
            ),
          ],
          if (d.status == 'PICKED_UP' || d.status == 'AT_DROP')
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: TextButton(onPressed: _busy ? null : _fail, child: const Text("Can't deliver?")),
            ),
        ]),
      ),
    );
  }
}
