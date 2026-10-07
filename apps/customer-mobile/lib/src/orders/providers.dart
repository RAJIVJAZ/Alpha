import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';
import 'models.dart';

final orderProvider = FutureProvider.autoDispose.family<OrderDetail, String>((ref, id) async {
  return OrderDetail.fromJson(asJson(await ref.watch(apiClientProvider).get<dynamic>('orders/$id')));
});

final trackingProvider = FutureProvider.autoDispose.family<Tracking, String>((ref, id) async {
  return Tracking.fromJson(asJson(await ref.watch(apiClientProvider).get<dynamic>('orders/$id/track')));
});

/// Map tiles for live tracking (OpenStreetMap); null draws the pins on a plain
/// background (tests, or where tiles are not allowed).
final mapTileUrlProvider = Provider<String?>((ref) => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');

class OrderHistory {
  const OrderHistory({required this.items, required this.page, required this.totalPages, this.loadingMore = false, this.moreError});

  final List<OrderSummary> items;
  final int page;
  final int totalPages;
  final bool loadingMore;
  final Object? moreError;

  bool get hasMore => page < totalPages;
}

/// GET orders, newest first, with infinite scroll.
class OrderHistoryController extends AsyncNotifier<OrderHistory> {
  int _generation = 0;

  @override
  Future<OrderHistory> build() async {
    _generation++;
    final session = await ref.watch(sessionProvider.future);
    if (session == null) return const OrderHistory(items: [], page: 1, totalPages: 1);
    return _fetch(1, const []);
  }

  Future<OrderHistory> _fetch(int page, List<OrderSummary> before) async {
    final p = PagedResult.fromJson(await ref.read(apiClientProvider).get<dynamic>('orders', query: {'page': page, 'pageSize': 10}), OrderSummary.fromJson);
    final seen = {for (final o in before) o.id};
    return OrderHistory(items: [...before, ...p.data.where((o) => seen.add(o.id))], page: p.page, totalPages: p.totalPages);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || state.isLoading || current.loadingMore || !current.hasMore) return;
    final generation = _generation;
    state = AsyncData(OrderHistory(items: current.items, page: current.page, totalPages: current.totalPages, loadingMore: true));
    try {
      final next = await _fetch(current.page + 1, current.items);
      if (ref.mounted && generation == _generation) state = AsyncData(next);
    } catch (e) {
      if (ref.mounted && generation == _generation) state = AsyncData(OrderHistory(items: current.items, page: current.page, totalPages: current.totalPages, moreError: e));
    }
  }
}

final orderHistoryProvider = AsyncNotifierProvider<OrderHistoryController, OrderHistory>(OrderHistoryController.new);
