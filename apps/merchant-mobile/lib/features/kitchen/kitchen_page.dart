import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';
import '../../core/timings.dart';
import '../../core/ui.dart';
import '../orders/orders_board.dart';
import '../outlets/outlet_providers.dart';
import 'ticket.dart';

class KdsBoard {
  const KdsBoard(this.tickets, this.fetchedAt, {this.refreshError});
  final List<KitchenTicket> tickets;
  final DateTime fetchedAt;
  final Object? refreshError;

  List<KitchenTicket> withStatus(String status) =>
      [for (final t in tickets) if (t.status == status) t]..sort((a, b) => b.elapsedSeconds.compareTo(a.elapsedSeconds));
}

/// Station filter (null = all stations).
class KdsStation extends Notifier<String?> {
  @override
  String? build() {
    ref.watch(currentOutletIdProvider);
    return null;
  }

  void set(String? station) => state = station;
}

final kdsStationProvider = NotifierProvider<KdsStation, String?>(KdsStation.new);

/// GET kds/tickets?outletId=&station= every 5 s (web KitchenDisplay).
class KdsController extends AsyncNotifier<KdsBoard> {
  @override
  Future<KdsBoard> build() async {
    final outletId = ref.watch(currentOutletIdProvider);
    final station = ref.watch(kdsStationProvider);
    final poll = ref.watch(appTimingsProvider).kdsPoll;
    if (poll != null) {
      final timer = Timer.periodic(poll, (_) => refresh());
      ref.onDispose(timer.cancel);
    }
    if (outletId == null) return KdsBoard(const [], DateTime.now());
    return _load(outletId, station);
  }

  Future<KdsBoard> _load(String outletId, String? station) async {
    final raw = await ref.read(apiClientProvider).get<List<dynamic>>('kds/tickets', query: {'outletId': outletId, 'station': station});
    return KdsBoard([for (final j in listOfMaps(raw)) KitchenTicket.fromJson(j)], DateTime.now());
  }

  Future<void> refresh() async {
    final outletId = ref.read(currentOutletIdProvider);
    if (outletId == null) return;
    try {
      final board = await _load(outletId, ref.read(kdsStationProvider));
      if (ref.mounted) state = AsyncData(board);
    } catch (e, st) {
      if (!ref.mounted) return;
      final prev = state.value;
      state = prev == null ? AsyncError(e, st) : AsyncData(KdsBoard(prev.tickets, prev.fetchedAt, refreshError: e));
    }
  }

  /// start / ready / bump / recall: POST kds/tickets/{id}/{action}.
  Future<void> act(KitchenTicket ticket, String action) async {
    await ref.read(apiClientProvider).post<dynamic>('kds/tickets/${ticket.id}/$action');
    await refresh();
    // ticket moves can change the order's status (preparing / ready)
    unawaited(ref.read(ordersBoardProvider.notifier).refresh());
  }
}

final kdsProvider = AsyncNotifierProvider<KdsController, KdsBoard>(KdsController.new);

const _columns = [('QUEUED', 'Queued', Icons.receipt_long), ('IN_PROGRESS', 'Cooking', Icons.local_fire_department_outlined), ('READY', 'Ready', Icons.room_service_outlined)];

class KitchenPage extends ConsumerWidget {
  const KitchenPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(kdsProvider);
    final outlet = ref.watch(currentOutletProvider);
    final station = ref.watch(kdsStationProvider);
    final b = board.value;
    final stations = {...?outlet?.kdsStations, for (final t in b?.tickets ?? const <KitchenTicket>[]) t.station}.toList()..sort();

    return DefaultTabController(
      length: _columns.length,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Kitchen'),
          actions: [IconButton(tooltip: 'Refresh tickets', icon: const Icon(Icons.refresh), onPressed: () => ref.read(kdsProvider.notifier).refresh())],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(104),
            child: Column(children: [
              SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  children: [
                    for (final s in [null, ...stations])
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(s == null ? 'All stations' : humanize(s)),
                          selected: station == s,
                          onSelected: (_) => ref.read(kdsStationProvider.notifier).set(s),
                        ),
                      ),
                  ],
                ),
              ),
              TabBar(tabs: [
                for (final (status, label, _) in _columns)
                  Tab(
                    child: Semantics(
                      label: '$label, ${b?.withStatus(status).length ?? 0} tickets',
                      excludeSemantics: true,
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
                        const SizedBox(width: 6),
                        CountBadge(b?.withStatus(status).length ?? 0, highlight: status == 'QUEUED'),
                      ]),
                    ),
                  ),
              ]),
            ]),
          ),
        ),
        body: Column(children: [
          if (b?.refreshError != null) StaleBanner(error: b!.refreshError!, onRetry: () => ref.read(kdsProvider.notifier).refresh()),
          Expanded(
            child: AsyncView<KdsBoard>(
              value: board,
              onRetry: () => ref.invalidate(kdsProvider),
              data: (b) => _Clock(
                builder: (now) => TabBarView(children: [
                  for (final (status, label, icon) in _columns)
                    RefreshIndicator(
                      onRefresh: () => ref.read(kdsProvider.notifier).refresh(),
                      child: _TicketList(tickets: b.withStatus(status), sinceFetch: now.difference(b.fetchedAt).inSeconds, emptyLabel: label, emptyIcon: icon),
                    ),
                ]),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Rebuilds every second so ticket timers count up between refreshes.
class _Clock extends ConsumerStatefulWidget {
  const _Clock({required this.builder});
  final Widget Function(DateTime now) builder;

  @override
  ConsumerState<_Clock> createState() => _ClockState();
}

class _ClockState extends ConsumerState<_Clock> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    final tick = ref.read(appTimingsProvider).clockTick;
    if (tick != null) _timer = Timer.periodic(tick, (_) => setState(() {}));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(DateTime.now());
}

class _TicketList extends StatelessWidget {
  const _TicketList({required this.tickets, required this.sinceFetch, required this.emptyLabel, required this.emptyIcon});
  final List<KitchenTicket> tickets;
  final int sinceFetch;
  final String emptyLabel;
  final IconData emptyIcon;

  @override
  Widget build(BuildContext context) {
    if (tickets.isEmpty) {
      return ListView(children: [
        const SizedBox(height: 60),
        EmptyView(icon: emptyIcon, title: 'No ${emptyLabel.toLowerCase()} tickets', message: 'Accepted orders appear here as tickets, one per station.'),
      ]);
    }
    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: tickets.length,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (_, i) => TicketCard(ticket: tickets[i], elapsed: tickets[i].elapsedSeconds + (sinceFetch < 0 ? 0 : sinceFetch)),
    );
  }
}

class TicketCard extends ConsumerWidget {
  const TicketCard({super.key, required this.ticket, required this.elapsed});
  final KitchenTicket ticket;
  final int elapsed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ticket;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final age = TicketAge.of(elapsed, t.status);
    Future<void> act(String action) => ref.read(kdsProvider.notifier).act(t, action);

    return Card(
      shape: age == TicketAge.overdue
          ? RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: FoodGridTheme.critical, width: 2))
          : null,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('#${t.ticketNumber}', style: text.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
                Text('${t.orderNumber} · ${humanize(t.orderType)} · ${humanize(t.station)}', style: text.bodyMedium?.copyWith(color: muted)),
              ]),
            ),
            TicketAgeBadge(elapsed: elapsed, age: age, ready: t.status == 'READY'),
          ]),
          const SizedBox(height: 12),
          for (final i in t.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text.rich(
                  TextSpan(children: [
                    TextSpan(text: '${i.quantity} × ', style: const TextStyle(fontWeight: FontWeight.w800)),
                    TextSpan(text: i.name),
                  ]),
                  style: text.titleLarge,
                ),
                if (i.options.isNotEmpty) Text(i.options, style: text.titleSmall?.copyWith(color: muted)),
                if (i.notes != null) Text('Note: ${i.notes}', style: text.titleSmall?.copyWith(fontStyle: FontStyle.italic)),
              ]),
            ),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.end, children: [
            if (t.status == 'QUEUED') ActionButton(label: 'Start', icon: Icons.play_arrow, large: true, tooltip: 'Start ticket #${t.ticketNumber}', onPressed: () => act('start')),
            if (t.status == 'IN_PROGRESS') ActionButton(label: 'Ready', icon: Icons.check, large: true, tooltip: 'Mark ticket #${t.ticketNumber} ready', onPressed: () => act('ready')),
            if (t.status == 'READY') ...[
              ActionButton(
                label: 'Recall',
                icon: Icons.undo,
                kind: ActionKind.outlined,
                large: true,
                tooltip: 'Send ticket #${t.ticketNumber} back to cooking',
                onPressed: () => act('recall'),
              ),
              ActionButton(label: 'Served', icon: Icons.done_all, large: true, tooltip: 'Bump ticket #${t.ticketNumber} off the screen', onPressed: () => act('bump')),
            ],
          ]),
        ]),
      ),
    );
  }
}

/// Ticket timer: colour, icon and a word, never colour alone.
class TicketAgeBadge extends StatelessWidget {
  const TicketAgeBadge({super.key, required this.elapsed, required this.age, required this.ready});
  final int elapsed;
  final TicketAge age;
  final bool ready;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (Color bg, Color fg, IconData icon, String label) = ready
        ? (scheme.surfaceContainerHighest, scheme.onSurface, Icons.room_service_outlined, 'Waiting')
        : switch (age) {
            TicketAge.overdue => (FoodGridTheme.critical, Colors.white, Icons.warning_amber_rounded, age.label),
            TicketAge.dueSoon => (FoodGridTheme.warning, Colors.black, Icons.hourglass_bottom, age.label),
            TicketAge.onTime => (scheme.surfaceContainerHighest, scheme.onSurface, Icons.timer_outlined, age.label),
          };
    return Semantics(
      label: '${elapsedLabel(elapsed)} elapsed, $label',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, color: fg, size: 22),
            const SizedBox(width: 4),
            Text(
              elapsedLabel(elapsed),
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: fg, fontWeight: FontWeight.w700, fontFeatures: const [FontFeature.tabularFigures()]),
            ),
          ]),
          Text(label, style: Theme.of(context).textTheme.labelLarge?.copyWith(color: fg, fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }
}
