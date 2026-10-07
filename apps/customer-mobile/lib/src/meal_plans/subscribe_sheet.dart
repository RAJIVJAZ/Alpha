import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../account/addresses.dart';
import '../cart/address_form.dart';
import '../cart/models.dart';
import '../common/json.dart';
import '../common/widgets.dart';
import '../outlet/models.dart';
import '../payments/payments.dart';
import 'meal_plans_screen.dart';

const _defaultTimes = {'BREAKFAST': '08:00', 'LUNCH': '13:00', 'DINNER': '20:00', 'SNACKS': '17:00'};

Future<void> showSubscribeSheet(BuildContext context, {required SubscriptionPlan plan, required String outletName}) => showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SubscribeSheet(plan: plan, outletName: outletName),
    );

/// Subscribe to a meal plan: start date, delivery time and address, then pay.
class SubscribeSheet extends ConsumerStatefulWidget {
  const SubscribeSheet({super.key, required this.plan, required this.outletName});
  final SubscriptionPlan plan;
  final String outletName;

  @override
  ConsumerState<SubscribeSheet> createState() => _SubscribeSheetState();
}

class _SubscribeSheetState extends ConsumerState<SubscribeSheet> {
  late String _start = istToday(offsetDays: 1);
  late String _time = _defaultTimes[widget.plan.slot] ?? '13:00';
  String? _addressId;
  bool _busy = false;

  Future<void> _pickDate() async {
    final today = DateTime.parse(istToday());
    final picked = await showDatePicker(context: context, firstDate: today, lastDate: today.add(const Duration(days: 30)), initialDate: DateTime.parse(_start));
    if (picked != null) setState(() => _start = '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}');
  }

  Future<void> _pickTime() async {
    final parts = _time.split(':');
    final picked = await showTimePicker(context: context, initialTime: TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1])));
    if (picked != null) setState(() => _time = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}');
  }

  Future<void> _submit(Address address) async {
    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      final sub = asJson(await api.post<dynamic>('meal-subscriptions', body: {
        'planId': widget.plan.id,
        'startDate': _start,
        'deliveryTime': _time,
        'deliveryAddress': address.toSnapshot(),
      }));
      if (!mounted) return;
      final outcome = await ref.read(paymentsProvider).pay(context, PayRequest(purpose: PayPurpose.mealSubscription, referenceId: str(sub['id']), method: PaymentMethod.upi));
      if (!mounted) return;
      if (outcome == PayOutcome.paid) {
        ref.invalidate(mealSubscriptionsProvider);
        showMessage(context, 'Subscribed — first meal on ${date(DateTime.parse('${_start}T00:00:00+05:30'))}');
        final router = GoRouter.of(context);
        Navigator.of(context).pop();
        router.push('/meal-plans');
      } else {
        showMessage(context, payFailureMessage(outcome));
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.plan;
    final text = Theme.of(context).textTheme;
    final addresses = ref.watch(addressesProvider);
    final list = addresses.value ?? const <Address>[];
    final address = list.where((a) => a.id == _addressId).firstOrNull ?? list.where((a) => a.isDefault).firstOrNull ?? list.firstOrNull;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(p.name, style: text.titleLarge),
          Text('From ${widget.outletName} · ${p.slotLabel} · ${money(p.totalPrice, whole: true)}', style: text.bodyMedium),
          const SizedBox(height: 12),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.event_outlined),
            title: const Text('Start on'),
            subtitle: Text(date(DateTime.parse('${_start}T00:00:00+05:30'))),
            trailing: TextButton(onPressed: _pickDate, child: const Text('Change')),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.schedule),
            title: const Text('Deliver at'),
            subtitle: Text(_time),
            trailing: TextButton(onPressed: _pickTime, child: const Text('Change')),
          ),
          if (addresses.isLoading && !addresses.hasValue) const LinearProgressIndicator(),
          if (list.isNotEmpty)
            DropdownButtonFormField<String>(
              key: ValueKey(address?.id),
              initialValue: address?.id,
              decoration: const InputDecoration(labelText: 'Deliver to'),
              isExpanded: true,
              items: [for (final a in list) DropdownMenuItem(value: a.id, child: Text('${a.label} — ${a.line1}', overflow: TextOverflow.ellipsis))],
              onChanged: (v) => setState(() => _addressId = v),
            ),
          TextButton.icon(
            onPressed: () async {
              final saved = await showAddressForm(context);
              if (saved != null && mounted) setState(() => _addressId = saved.id);
            },
            icon: const Icon(Icons.add),
            label: const Text('Add a new address'),
          ),
          Text('Skip any day from Meal plans at least a day ahead; your plan extends automatically.', style: text.bodySmall),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy || address == null ? null : () => _submit(address),
            child: _busy ? const ButtonSpinner() : Text('Pay ${money(p.totalPrice, whole: true)}'),
          ),
        ]),
      ),
    );
  }
}
