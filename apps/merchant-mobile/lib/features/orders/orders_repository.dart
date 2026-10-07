import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';
import 'order.dart';

/// merchant/orders endpoints (order-service), as used by the web OrdersBoard.
class OrdersRepository {
  OrdersRepository(this._api);
  final ApiClient _api;

  Future<Page<MerchantOrder>> list({
    required String outletId,
    required List<String> statuses,
    String? from,
    String? to,
    String? q,
    int page = 1,
    int pageSize = 100,
  }) async {
    final r = await _api.get<Map<String, dynamic>>('merchant/orders', query: {
      'outletId': outletId,
      'status': statuses,
      'from': from,
      'to': to,
      'q': q,
      'page': page,
      'pageSize': pageSize,
    });
    return Page.fromJson(r, MerchantOrder.fromJson);
  }

  Future<MerchantOrder> get(String id) async => MerchantOrder.fromJson(await _api.get<Map<String, dynamic>>('merchant/orders/$id'));

  Future<String> accept(String id, int prepTimeMins) => _move(id, 'accept', {'prepTimeMins': prepTimeMins});
  Future<String> reject(String id, String reason) => _move(id, 'reject', {'reason': reason});
  Future<String> preparing(String id) => _move(id, 'preparing');
  Future<String> ready(String id) => _move(id, 'ready');

  /// Takeaway / dine-in hand-over.
  Future<String> complete(String id) => _move(id, 'complete');
  Future<String> cancel(String id, String reason) => _move(id, 'cancel', {'reason': reason});

  Future<String> _move(String id, String action, [Json? body]) async {
    final r = await _api.post<dynamic>('merchant/orders/$id/$action', body: body ?? const <String, dynamic>{});
    return r is Map ? str(r['status']) : '';
  }
}

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) => OrdersRepository(ref.watch(apiClientProvider)));

/// GET merchant/orders/{id} (items, events, kitchen tickets).
final orderDetailProvider = FutureProvider.autoDispose.family<MerchantOrder, String>((ref, id) => ref.watch(ordersRepositoryProvider).get(id));
