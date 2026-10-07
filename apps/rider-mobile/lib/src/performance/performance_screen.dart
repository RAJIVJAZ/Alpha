import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../common/widgets.dart';
import '../profile/profile.dart';
import 'models.dart';
import 'performance_providers.dart';

/// Incentive targets and the attendance calendar.
class PerformanceScreen extends ConsumerWidget {
  const PerformanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final incentives = ref.watch(incentivesProvider);
    final rating = ref.watch(profileProvider.select((p) => p.value?.rating));
    return Scaffold(
      appBar: AppBar(title: const Text('Performance')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(incentivesProvider);
          ref.invalidate(attendanceProvider);
          await ref.read(incentivesProvider.future).catchError((_) => const <Incentive>[]);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            Semantics(header: true, child: Text('Incentives', style: Theme.of(context).textTheme.titleMedium)),
            const SizedBox(height: 8),
            SectionAsync<List<Incentive>>(
              value: incentives,
              onRetry: () => ref.invalidate(incentivesProvider),
              data: (list) => list.isEmpty
                  ? const Card(child: EmptyView(icon: Icons.emoji_events_outlined, title: 'No incentives running', message: 'New weekly targets appear here every Monday.'))
                  : Column(children: [
                      for (final i in list) Padding(padding: const EdgeInsets.only(bottom: 12), child: IncentiveCard(incentive: i, rating: rating)),
                    ]),
            ),
            const SizedBox(height: 8),
            const AttendanceCard(),
          ],
        ),
      ),
    );
  }
}

class IncentiveCard extends StatelessWidget {
  const IncentiveCard({super.key, required this.incentive, this.rating});
  final Incentive incentive;

  /// The rider's current rating, when known.
  final double? rating;

  @override
  Widget build(BuildContext context) {
    final i = incentive;
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final paused = rating != null && i.pausedFor(rating!);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Text(i.name, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600))),
            const SizedBox(width: 8),
            Text(money(i.rewardAmount, whole: true), semanticsLabel: 'Reward ${money(i.rewardAmount, whole: true)}', style: text.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          ]),
          if (i.description != null) ...[const SizedBox(height: 2), Caption(i.description!)],
          const SizedBox(height: 12),
          Semantics(
            container: true,
            label: '${i.name} progress',
            value: '${i.progress} of ${i.target}',
            excludeSemantics: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: i.fraction,
                  minHeight: 10,
                  color: i.achieved ? FoodGridTheme.good : scheme.primary,
                  backgroundColor: (i.achieved ? FoodGridTheme.good : scheme.primary).withValues(alpha: 0.15),
                ),
              ),
              const SizedBox(height: 6),
              Text('${i.progress} of ${i.target}', style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
            ]),
          ),
          if (paused) ...[
            const SizedBox(height: 10),
            Notice(
              icon: Icons.pause_circle_outline,
              color: FoodGridTheme.warning,
              message: 'Progress is paused: your rating is ${rating!.toStringAsFixed(1)} and this target only counts deliveries '
                  'while it is ${i.minRating!.toStringAsFixed(1)} or higher.',
            ),
          ],
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: Caption('Ends ${i.lastDayLabel}')),
            StatusChip(i.achieved ? 'ACHIEVED' : i.status, label: humanize(i.status), tone: paused ? Tone.neutral : null),
          ]),
        ]),
      ),
    );
  }
}

class AttendanceCard extends ConsumerWidget {
  const AttendanceCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final month = ref.watch(attendanceMonthProvider);
    final controller = ref.read(attendanceMonthProvider.notifier);
    final attendance = ref.watch(attendanceProvider(month));
    final label = DateFormat('MMMM yyyy', 'en_US').format(DateTime.parse('$month-01'));
    return SectionCard(
      title: 'Attendance',
      icon: Icons.calendar_month_outlined,
      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(tooltip: 'Previous month', onPressed: () => controller.shift(-1), icon: const Icon(Icons.chevron_left)),
        IconButton(tooltip: 'Next month', onPressed: controller.canGoForward ? () => controller.shift(1) : null, icon: const Icon(Icons.chevron_right)),
      ]),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(label, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 4),
        SectionAsync<Attendance>(
          value: attendance,
          minHeight: 240,
          onRetry: () => ref.invalidate(attendanceProvider(month)),
          data: (a) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Caption('${a.presentDays} days worked · ${a.onlineHours.toStringAsFixed(1)} h online · ${a.deliveries} deliveries'),
            const SizedBox(height: 12),
            AttendanceCalendar(month: month, days: a.days),
          ]),
        ),
      ]),
    );
  }
}

/// Month grid, Monday first. Worked days are filled and show the delivery count.
class AttendanceCalendar extends StatelessWidget {
  const AttendanceCalendar({super.key, required this.month, required this.days});
  final String month;
  final List<AttendanceDay> days;

  @override
  Widget build(BuildContext context) {
    final y = int.parse(month.substring(0, 4));
    final m = int.parse(month.substring(5, 7));
    final daysInMonth = DateTime.utc(y, m + 1, 0).day;
    final lead = DateTime.utc(y, m, 1).weekday - 1;
    final byDate = {for (final d in days) d.date: d};
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;

    final cells = <Widget>[
      for (final w in const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
        ExcludeSemantics(child: Center(child: Text(w, style: text.labelSmall?.copyWith(color: scheme.onSurfaceVariant)))),
      for (var i = 0; i < lead; i++) const SizedBox.shrink(),
      for (var day = 1; day <= daysInMonth; day++)
        Builder(builder: (context) {
          final key = '$month-${day.toString().padLeft(2, '0')}';
          final d = byDate[key];
          final worked = d?.present ?? false;
          final dateLabel = DateFormat('EEEE d MMMM', 'en_US').format(DateTime.parse(key));
          return Semantics(
            container: true,
            label: d == null
                ? '$dateLabel: off'
                : '$dateLabel: ${worked ? 'worked' : humanize(d.status).toLowerCase()}, ${d.deliveryCount} deliveries, ${(d.onlineMinutes / 60).toStringAsFixed(1)} hours online',
            excludeSemantics: true,
            child: Container(
              decoration: BoxDecoration(
                color: worked ? scheme.primary : null,
                border: worked ? null : Border.all(color: scheme.outlineVariant),
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('$day', style: text.bodyMedium?.copyWith(color: worked ? scheme.onPrimary : scheme.onSurfaceVariant, fontWeight: worked ? FontWeight.w600 : null)),
                if (d != null) Text('${d.deliveryCount}', style: text.labelSmall?.copyWith(fontSize: 10, color: worked ? scheme.onPrimary : scheme.onSurfaceVariant)),
              ]),
            ),
          );
        }),
    ];

    return GridView.count(
      crossAxisCount: 7,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 4,
      crossAxisSpacing: 4,
      children: cells,
    );
  }
}
