import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/ui.dart';
import 'sales_summary.dart';

/// Today's sales for the outlet (pos/summary, the web POS "Today" tab).
class SalesPage extends ConsumerStatefulWidget {
  const SalesPage({super.key});

  @override
  ConsumerState<SalesPage> createState() => _SalesPageState();
}

class _SalesPageState extends ConsumerState<SalesPage> {
  bool _hourlyAsList = false;

  Future<void> _pickDate() async {
    final today = DateTime.parse(istToday());
    final current = DateTime.parse(ref.read(salesDateProvider));
    final picked = await showDatePicker(context: context, initialDate: current, firstDate: today.subtract(const Duration(days: 365)), lastDate: today);
    if (picked != null) {
      ref.read(salesDateProvider.notifier).set('${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final summary = ref.watch(salesSummaryProvider);
    final date = ref.watch(salesDateProvider);
    final today = istToday();
    final yesterday = istToday(offsetDays: -1);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Sales'),
        actions: [IconButton(tooltip: 'Refresh sales', icon: const Icon(Icons.refresh), onPressed: () => ref.invalidate(salesSummaryProvider))],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: Wrap(spacing: 8, runSpacing: 8, children: [
            ChoiceChip(label: const Text('Today'), selected: date == today, onSelected: (_) => ref.read(salesDateProvider.notifier).set(today)),
            ChoiceChip(label: const Text('Yesterday'), selected: date == yesterday, onSelected: (_) => ref.read(salesDateProvider.notifier).set(yesterday)),
            ActionChip(
              avatar: const Icon(Icons.calendar_today, size: 18),
              label: Text(date == today || date == yesterday ? 'Pick a day' : _dayLabel(date)),
              tooltip: 'Choose a business day',
              onPressed: _pickDate,
            ),
          ]),
        ),
        Expanded(
          child: AsyncView<SalesSummary>(
            value: summary,
            onRetry: () => ref.invalidate(salesSummaryProvider),
            data: (s) => RefreshIndicator(
              onRefresh: () => ref.refresh(salesSummaryProvider.future),
              child: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 24), children: [
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 1.9,
                  children: [
                    KpiTile(label: 'Sales', value: money(s.grossSales, whole: true), hint: s.discounts > 0 ? '${money(s.discounts, whole: true)} discounts' : null),
                    KpiTile(label: 'Orders', value: '${s.orders}', hint: s.cancelled > 0 ? '${s.cancelled} cancelled' : null),
                    KpiTile(label: 'Average ticket', value: money(s.averageTicket, whole: true)),
                    KpiTile(label: 'GST collected', value: money(s.taxCollected, whole: true)),
                  ],
                ),
                if (s.orders == 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: EmptyView(
                      icon: Icons.point_of_sale,
                      title: date == today ? 'No sales yet today' : 'No sales on ${_dayLabel(date)}',
                      message: date == today ? 'Orders and counter bills appear here as they come in (IST business day).' : null,
                    ),
                  )
                else ...[
                  SectionHeader('Payment split', padding: const EdgeInsets.fromLTRB(4, 20, 4, 8)),
                  _Split(values: s.byPaymentMethod, total: s.grossSales),
                  SectionHeader(
                    'Sales by hour',
                    padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
                    trailing: SegmentedButton<bool>(
                      showSelectedIcon: false,
                      segments: const [
                        ButtonSegment(value: false, icon: Icon(Icons.bar_chart), tooltip: 'Show as chart'),
                        ButtonSegment(value: true, icon: Icon(Icons.list), tooltip: 'Show as list'),
                      ],
                      selected: {_hourlyAsList},
                      onSelectionChanged: (v) => setState(() => _hourlyAsList = v.first),
                    ),
                  ),
                  if (_hourlyAsList) _HourlyList(hours: s.tradingHours) else _HourlyBars(hours: s.tradingHours),
                  SectionHeader('Top dishes', padding: const EdgeInsets.fromLTRB(4, 20, 4, 8)),
                  Card(
                    child: Column(children: [
                      for (final (i, t) in s.topItems.indexed)
                        ListTile(
                          dense: true,
                          leading: CircleAvatar(radius: 14, child: Text('${i + 1}')),
                          title: Text(t.name),
                          trailing: Text('${t.quantity} sold · ${money(t.sales, whole: true)}'),
                        ),
                    ]),
                  ),
                  if (s.byChannel.isNotEmpty) ...[
                    SectionHeader('By channel', padding: const EdgeInsets.fromLTRB(4, 20, 4, 8)),
                    _Split(values: s.byChannel, total: s.grossSales),
                  ],
                ],
              ]),
            ),
          ),
        ),
      ]),
    );
  }

  static String _dayLabel(String isoDate) => date(DateTime.tryParse('${isoDate}T12:00:00+05:30'));
}

/// Share of sales per payment method or channel, as labelled bars.
class _Split extends StatelessWidget {
  const _Split({required this.values, required this.total});
  final Map<String, double> values;
  final double total;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final sum = total > 0 ? total : values.values.fold(0.0, (a, b) => a + b);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(children: [
          for (final e in values.entries)
            MergeSemantics(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    Expanded(child: Text(humanize(e.key), style: Theme.of(context).textTheme.bodyLarge)),
                    Text('${money(e.value, whole: true)} · ${sum > 0 ? (e.value * 100 / sum).round() : 0}%'),
                  ]),
                  const SizedBox(height: 4),
                  ExcludeSemantics(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(value: sum > 0 ? e.value / sum : 0, minHeight: 8, color: scheme.primary, backgroundColor: scheme.surfaceContainerHighest),
                    ),
                  ),
                ]),
              ),
            ),
        ]),
      ),
    );
  }
}

class _HourlyBars extends StatelessWidget {
  const _HourlyBars({required this.hours});
  final List<HourSales> hours;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final max = hours.fold(0.0, (m, h) => h.sales > m ? h.sales : m);
    final peak = hours.where((h) => h.sales == max && max > 0).firstOrNull;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 12, 8, 8),
        child: Semantics(
          label: peak == null ? 'Sales by hour chart: no sales' : 'Sales by hour chart. Busiest hour ${peak.label} with ${money(peak.sales, whole: true)}. Use the list view for every hour.',
          excludeSemantics: true,
          child: Column(children: [
            SizedBox(
              height: 140,
              child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                for (final h in hours)
                  Expanded(
                    child: Tooltip(
                      message: '${h.label}: ${h.orders} orders · ${money(h.sales, whole: true)}',
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 1.5),
                        child: Container(
                          height: max > 0 ? 4 + 132 * (h.sales / max) : 4,
                          decoration: BoxDecoration(
                            color: h == peak ? scheme.primary : scheme.primary.withValues(alpha: 0.45),
                            borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                          ),
                        ),
                      ),
                    ),
                  ),
              ]),
            ),
            const SizedBox(height: 4),
            Row(children: [
              for (final h in hours)
                Expanded(
                  child: Text(h.hour % 3 == 0 ? h.label.replaceAll(' ', '') : '', textAlign: TextAlign.center, style: text.labelSmall, maxLines: 1, overflow: TextOverflow.clip),
                ),
            ]),
            if (peak != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Busiest: ${peak.label} · ${money(peak.sales, whole: true)}', style: text.bodySmall)),
          ]),
        ),
      ),
    );
  }
}

class _HourlyList extends StatelessWidget {
  const _HourlyList({required this.hours});
  final List<HourSales> hours;

  @override
  Widget build(BuildContext context) {
    final withSales = [for (final h in hours) if (h.orders > 0) h];
    return Card(
      child: Column(children: [
        if (withSales.isEmpty) const ListTile(title: Text('No sales in any hour')),
        for (final h in withSales) ListTile(dense: true, title: Text(h.label), subtitle: Text('${h.orders} order${h.orders == 1 ? '' : 's'}'), trailing: Text(money(h.sales, whole: true))),
      ]),
    );
  }
}
