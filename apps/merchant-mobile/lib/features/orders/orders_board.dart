import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/timings.dart';
import '../outlets/outlet_providers.dart';
import 'order.dart';
import 'orders_repository.dart';

/// Board lanes. Statuses follow the web board's lanes; delivery hand-offs
/// (picked up, on the way) count as done for the kitchen.
enum Lane {
  fresh('New', Icons.notifications_active_outlined, ['PLACED']),
  preparing('Preparing', Icons.soup_kitchen_outlined, ['ACCEPTED', 'PREPARING']),
  ready('Ready', Icons.takeout_dining_outlined, ['READY']),
  done('Done today', Icons.task_alt, ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED']);

  const Lane(this.label, this.icon, this.statuses);
  final String label;
  final IconData icon;
  final List<String> statuses;

  static Lane? of(String status) {
    for (final l in Lane.values) {
      if (l.statuses.contains(status)) return l;
    }
    return null;
  }
}

/// Statuses still on the pass (polled without a date limit, so yesterday's
/// stuck orders stay visible).
final activeStatuses = [...Lane.fresh.statuses, ...Lane.preparing.statuses, ...Lane.ready.statuses];

class OrdersBoard {
  const OrdersBoard({required this.lanes, this.arrived = const [], this.refreshError, this.fetchedAt});

  static final empty = OrdersBoard(lanes: {for (final l in Lane.values) l: const <MerchantOrder>[]});

  final Map<Lane, List<MerchantOrder>> lanes;

  /// New PLACED orders first seen in this refresh (drives the alert).
  final List<MerchantOrder> arrived;

  /// Set when the last background refresh failed (lanes keep the last data).
  final Object? refreshError;
  final DateTime? fetchedAt;

  List<MerchantOrder> operator [](Lane lane) => lanes[lane] ?? const [];
  int count(Lane lane) => this[lane].length;

  OrdersBoard withError(Object error) => OrdersBoard(lanes: lanes, refreshError: error, fetchedAt: fetchedAt);

  /// Splits orders into lanes: new and ready oldest first (FIFO), preparing
  /// by promised time, done most recent first.
  static Map<Lane, List<MerchantOrder>> group(Iterable<MerchantOrder> orders) {
    final lanes = {for (final l in Lane.values) l: <MerchantOrder>[]};
    final seen = <String>{};
    for (final o in orders) {
      final lane = Lane.of(o.status);
      if (lane != null && seen.add(o.id)) lanes[lane]!.add(o);
    }
    final epoch = DateTime.fromMillisecondsSinceEpoch(0);
    int oldest(MerchantOrder a, MerchantOrder b) => (a.placedOrCreated ?? epoch).compareTo(b.placedOrCreated ?? epoch);
    lanes[Lane.fresh]!.sort(oldest);
    lanes[Lane.ready]!.sort(oldest);
    lanes[Lane.preparing]!.sort((a, b) => (a.estimatedReadyAt ?? a.placedOrCreated ?? epoch).compareTo(b.estimatedReadyAt ?? b.placedOrCreated ?? epoch));
    lanes[Lane.done]!.sort((a, b) => oldest(b, a));
    return lanes;
  }
}

/// Live board for the current outlet: GET merchant/orders with the outlet
/// and status filters, refreshed every 10 s.
class OrdersBoardController extends AsyncNotifier<OrdersBoard> {
  Set<String>? _seenPlaced;
  bool _loading = false;

  @override
  Future<OrdersBoard> build() async {
    final outletId = ref.watch(currentOutletIdProvider);
    _seenPlaced = null;
    final poll = ref.watch(appTimingsProvider).ordersPoll;
    if (poll != null) {
      final timer = Timer.periodic(poll, (_) => refresh());
      ref.onDispose(timer.cancel);
    }
    if (outletId == null) return OrdersBoard.empty;
    return _load(outletId);
  }

  Future<OrdersBoard> _load(String outletId) async {
    _loading = true;
    try {
      final repo = ref.read(ordersRepositoryProvider);
      final today = istToday();
      final results = await Future.wait([
        repo.list(outletId: outletId, statuses: activeStatuses),
        repo.list(outletId: outletId, statuses: Lane.done.statuses, from: today, to: today, pageSize: 50),
      ]);
      final byId = {for (final p in results) for (final o in p.data) o.id: o};
      final orders = byId.values.toList();
      final placed = [for (final o in orders) if (o.status == 'PLACED') o];
      final seen = _seenPlaced;
      final arrived = seen == null ? const <MerchantOrder>[] : [for (final o in placed) if (!seen.contains(o.id)) o];
      _seenPlaced = {...?seen, for (final o in placed) o.id};
      return OrdersBoard(lanes: OrdersBoard.group(orders), arrived: arrived, fetchedAt: DateTime.now());
    } finally {
      _loading = false;
    }
  }

  /// Background refresh: keeps the board on screen if it fails.
  Future<void> refresh() async {
    final outletId = ref.read(currentOutletIdProvider);
    if (outletId == null || _loading) return;
    try {
      final board = await _load(outletId);
      if (ref.mounted) state = AsyncData(board);
    } catch (e, st) {
      if (!ref.mounted) return;
      final previous = state.value;
      state = previous == null ? AsyncError(e, st) : AsyncData(previous.withError(e));
    }
  }
}

final ordersBoardProvider = AsyncNotifierProvider<OrdersBoardController, OrdersBoard>(OrdersBoardController.new);

/// Number of orders waiting to be accepted (navigation badge).
final newOrderCountProvider = Provider<int>((ref) => ref.watch(ordersBoardProvider).value?.count(Lane.fresh) ?? 0);
