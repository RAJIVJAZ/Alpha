import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../account/models.dart';
import '../common/json.dart';
import '../common/widgets.dart';

final mealSubscriptionsProvider = FutureProvider.autoDispose<List<MealSubscription>>((ref) async {
  return listOf(await ref.watch(apiClientProvider).get<dynamic>('meal-subscriptions'), MealSubscription.fromJson);
});

/// yyyy-MM-dd (an IST calendar day) → "Thu 8 Oct".
String dayLabel(String isoDay) {
  final d = DateTime.tryParse(isoDay);
  return d == null ? isoDay : DateFormat('EEE d MMM', 'en_US').format(d);
}

/// The customer's tiffin / meal subscriptions: progress, skip days, cancel.
class MealPlansScreen extends ConsumerWidget {
  const MealPlansScreen({super.key});

  Future<void> _cancel(BuildContext context, WidgetRef ref, MealSubscription s) async {
    final ok = await confirm(
      context,
      title: 'Cancel this meal plan?',
      message: 'No more meals are delivered from tomorrow. Contact support about refunds for meals not yet delivered.',
      confirmLabel: 'Cancel plan',
      destructive: true,
    );
    if (!ok) return;
    try {
      await ref.read(apiClientProvider).post<dynamic>('meal-subscriptions/${s.id}/cancel');
      ref.invalidate(mealSubscriptionsProvider);
      if (context.mounted) showMessage(context, 'Subscription cancelled');
    } catch (e) {
      if (context.mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subs = ref.watch(mealSubscriptionsProvider);
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(title: const Text('Meal plans')),
      body: AsyncView<List<MealSubscription>>(
        value: subs,
        onRetry: () => ref.invalidate(mealSubscriptionsProvider),
        data: (list) => list.isEmpty
            ? EmptyView(
                icon: Icons.calendar_month_outlined,
                title: 'No meal plans yet',
                message: 'Tiffin and meal plans from nearby kitchens appear on their pages under “Meal plans”.',
                action: OutlinedButton(onPressed: () => context.go('/'), child: const Text('Browse kitchens')),
              )
            : RefreshIndicator(
                onRefresh: () => ref.refresh(mealSubscriptionsProvider.future),
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (context, i) {
                    final s = list[i];
                    final progress = s.mealsTotal == 0 ? 0.0 : s.mealsDelivered / s.mealsTotal;
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [Expanded(child: Text(s.planName, style: text.titleMedium)), StatusChip(s.status)]),
                          const SizedBox(height: 4),
                          Text('${s.slotLabel} at ${s.deliveryTime} · ${date(s.startDate)} to ${date(s.endDate)}', style: text.bodySmall?.copyWith(color: muted)),
                          const SizedBox(height: 12),
                          Semantics(
                            label: '${s.mealsDelivered} of ${s.mealsTotal} meals delivered',
                            child: ExcludeSemantics(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                LinearProgressIndicator(value: progress, minHeight: 8, borderRadius: BorderRadius.circular(4)),
                                const SizedBox(height: 4),
                                Text('${s.mealsDelivered} of ${s.mealsTotal} meals delivered', style: text.bodySmall),
                              ]),
                            ),
                          ),
                          if (s.pausedDates.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Skipping ${s.pausedDates.map(dayLabel).join(', ')}', style: text.bodySmall?.copyWith(color: muted))),
                          if (s.isLive)
                            Padding(
                              padding: const EdgeInsets.only(top: 10),
                              child: Wrap(spacing: 8, children: [
                                OutlinedButton.icon(onPressed: () => showSkipDaysSheet(context, s), icon: const Icon(Icons.event_busy_outlined), label: const Text('Skip days')),
                                TextButton(onPressed: () => _cancel(context, ref, s), child: const Text('Cancel plan')),
                              ]),
                            ),
                        ]),
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }
}

Future<void> showSkipDaysSheet(BuildContext context, MealSubscription sub) => showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SkipDaysSheet(sub: sub),
    );

/// Pick upcoming days (tomorrow onwards) to skip; skipped meals move to the end.
class SkipDaysSheet extends ConsumerStatefulWidget {
  const SkipDaysSheet({super.key, required this.sub});
  final MealSubscription sub;

  @override
  ConsumerState<SkipDaysSheet> createState() => _SkipDaysSheetState();
}

class _SkipDaysSheetState extends ConsumerState<SkipDaysSheet> {
  final _picked = <String>[];
  bool _busy = false;
  late final _upcoming = [for (var i = 1; i <= 14; i++) istToday(offsetDays: i)];

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).post<dynamic>('meal-subscriptions/${widget.sub.id}/pause', body: {'dates': _picked..sort()});
      ref.invalidate(mealSubscriptionsProvider);
      if (!mounted) return;
      showMessage(context, 'Days skipped — your plan now ends later');
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        showError(context, e);
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final already = widget.sub.pausedDates.toSet();
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Skip days', style: text.titleLarge),
          Text("Pick the days you don't want a meal. Skipped meals move to the end of the plan.", style: text.bodyMedium),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final d in _upcoming)
              FilterChip(
                label: Text(dayLabel(d)),
                selected: _picked.contains(d) || already.contains(d),
                onSelected: already.contains(d) ? null : (on) => setState(() => on ? _picked.add(d) : _picked.remove(d)),
              ),
          ]),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _picked.isEmpty || _busy ? null : _save,
            child: _busy ? const ButtonSpinner() : Text('Skip ${_picked.isEmpty ? '' : '${_picked.length} '}day${_picked.length == 1 ? '' : 's'}'),
          ),
        ]),
      ),
    );
  }
}
