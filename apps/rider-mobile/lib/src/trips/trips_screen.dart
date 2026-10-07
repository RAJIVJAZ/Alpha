import 'package:flutter/material.dart' hide Page;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/session_scope.dart';
import '../common/widgets.dart';
import '../duty/models.dart';

class TripsState {
  const TripsState({required this.items, required this.page, required this.totalPages, required this.total, this.loadingMore = false, this.moreError});
  final List<Delivery> items;
  final int page;
  final int totalPages;
  final int total;
  final bool loadingMore;
  final Object? moreError;

  bool get hasMore => page < totalPages;

  TripsState copyWith({List<Delivery>? items, int? page, int? totalPages, int? total, bool? loadingMore, Object? moreError, bool clearError = false}) => TripsState(
        items: items ?? this.items,
        page: page ?? this.page,
        totalPages: totalPages ?? this.totalPages,
        total: total ?? this.total,
        loadingMore: loadingMore ?? this.loadingMore,
        moreError: clearError ? null : (moreError ?? this.moreError),
      );
}

/// Delivery history (GET riders/me/deliveries?page), loaded a page at a time.
final tripsProvider = AsyncNotifierProvider<TripsController, TripsState>(TripsController.new);

class TripsController extends AsyncNotifier<TripsState> {
  Future<Page<Delivery>> _fetch(int page) async =>
      Page.fromJson(await ref.read(apiClientProvider).get<Map<String, dynamic>>('riders/me/deliveries', query: {'page': page}), Delivery.fromJson);

  @override
  Future<TripsState> build() async {
    ref.watch(riderUserIdProvider);
    final p = await _fetch(1);
    return TripsState(items: p.data, page: p.page, totalPages: p.totalPages, total: p.total);
  }

  Future<void> loadMore() async {
    final s = state.value;
    if (s == null || !s.hasMore || s.loadingMore) return;
    state = AsyncData(s.copyWith(loadingMore: true, clearError: true));
    try {
      final p = await _fetch(s.page + 1);
      if (!ref.mounted) return;
      final seen = {for (final d in s.items) d.id};
      state = AsyncData(s.copyWith(items: [...s.items, ...p.data.where((d) => !seen.contains(d.id))], page: p.page, totalPages: p.totalPages, total: p.total, loadingMore: false));
    } catch (e) {
      if (ref.mounted) state = AsyncData(s.copyWith(loadingMore: false, moreError: e));
    }
  }
}

class TripsScreen extends ConsumerWidget {
  const TripsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trips = ref.watch(tripsProvider);
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Trips'),
          if (trips.value != null) Text('${number(trips.value!.total)} deliveries', style: Theme.of(context).textTheme.bodySmall),
        ]),
      ),
      body: AsyncView<TripsState>(
        value: trips,
        onRetry: () => ref.invalidate(tripsProvider),
        data: (s) => RefreshIndicator(
          onRefresh: () => ref.refresh(tripsProvider.future),
          child: s.items.isEmpty
              ? ListView(physics: const AlwaysScrollableScrollPhysics(), children: const [
                  SizedBox(height: 80),
                  EmptyView(icon: Icons.two_wheeler, title: 'No trips yet', message: 'Completed deliveries will show up here.'),
                ])
              : NotificationListener<ScrollNotification>(
                  onNotification: (n) {
                    if (n.metrics.extentAfter < 400) ref.read(tripsProvider.notifier).loadMore();
                    return false;
                  },
                  child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    itemCount: s.items.length + 1,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) {
                      if (i < s.items.length) return TripTile(delivery: s.items[i]);
                      if (s.moreError != null) return InlineError(error: s.moreError!, onRetry: () => ref.read(tripsProvider.notifier).loadMore());
                      if (s.loadingMore) return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
                      if (s.hasMore) {
                        return Center(child: TextButton(onPressed: () => ref.read(tripsProvider.notifier).loadMore(), child: const Text('Load older trips')));
                      }
                      return const Padding(padding: EdgeInsets.all(12), child: Center(child: Caption("That's all your trips")));
                    },
                  ),
                ),
        ),
      ),
    );
  }
}

class TripTile extends StatelessWidget {
  const TripTile({super.key, required this.delivery});
  final Delivery delivery;

  @override
  Widget build(BuildContext context) {
    final d = delivery;
    final text = Theme.of(context).textTheme;
    final when = d.deliveredAt ?? d.createdAt;
    return Card(
      child: MergeSemantics(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${d.pickupName} → ${d.dropName ?? 'Customer'}', style: text.titleSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Caption('${d.orderNumber} · ${dateTime(when)} · ${d.distanceKm.toStringAsFixed(1)} km'),
                if (d.failureReason != null) Caption(d.failureReason!),
              ]),
            ),
            const SizedBox(width: 12),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(money(d.totalEarning), style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600, fontFeatures: const [FontFeature.tabularFigures()])),
              if (d.tipAmount > 0) Caption('incl. ${money(d.tipAmount, whole: true)} tip'),
              const SizedBox(height: 4),
              StatusChip(d.status),
            ]),
          ]),
        ),
      ),
    );
  }
}
