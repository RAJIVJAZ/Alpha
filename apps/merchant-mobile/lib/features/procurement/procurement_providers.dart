import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';
import 'procurement_models.dart';

/// PO groups, as the web PurchaseOrders tabs.
enum PoGroup {
  approval('Needs approval', ['DRAFT', 'PENDING_APPROVAL', 'REJECTED']),
  open('In progress', ['APPROVED', 'SENT_TO_SUPPLIER', 'CONFIRMED', 'PARTIALLY_CONFIRMED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_RECEIVED']);

  const PoGroup(this.label, this.statuses);
  final String label;
  final List<String> statuses;
}

const receivableStatuses = ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_RECEIVED'];
const cancellableStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT_TO_SUPPLIER', 'CONFIRMED', 'PARTIALLY_CONFIRMED'];

/// procurement-service endpoints used by procurement.tsx and purchase-orders.tsx.
class ProcurementRepository {
  ProcurementRepository(this._api);
  final ApiClient _api;

  Future<ProcurementDashboard> dashboard() async => ProcurementDashboard.fromJson(await _api.get<Map<String, dynamic>>('procurement/dashboard'));

  Future<List<ReorderAlert>> alerts({String? outletId, String? severity}) async {
    final raw = await _api.get<dynamic>('procurement/alerts', query: {'outletId': outletId, 'severity': severity});
    return [for (final j in rowsOf(raw)) ReorderAlert.fromJson(j)];
  }

  Future<void> dismissAlert(String id) => _api.post<dynamic>('procurement/alerts/$id/dismiss');

  /// Raises POs from alerts with the supplier engine; returns the created PO numbers.
  Future<({List<String> created, List<String> skipped})> autoPo(List<String> alertIds, {String strategy = 'BALANCED'}) async {
    final r = mapOf(await _api.post<dynamic>('procurement/purchase-orders/auto', body: {'alertIds': alertIds, 'strategy': strategy}));
    return (
      created: [for (final p in listOfMaps(r['created'])) '${str(p['poNumber'])} · ${str(p['supplierName'])} · ${humanize(str(p['status']))}'],
      skipped: [for (final s in listOfMaps(r['skipped'])) '${str(s['ingredient'])}: ${str(s['reason'])}'],
    );
  }

  Future<PagedResult<PurchaseOrder>> purchaseOrders({List<String>? statuses, int pageSize = 50}) async =>
      PagedResult.fromJson(await _api.get<Map<String, dynamic>>('procurement/purchase-orders', query: {'status': statuses, 'pageSize': pageSize}), PurchaseOrder.fromJson);

  Future<PurchaseOrder> purchaseOrder(String id) async => PurchaseOrder.fromJson(await _api.get<Map<String, dynamic>>('procurement/purchase-orders/$id'));

  Future<PurchaseOrder> approve(String id, {String? comment}) => _decide(id, 'approve', comment);
  Future<PurchaseOrder> reject(String id, {String? comment}) => _decide(id, 'reject', comment);
  Future<PurchaseOrder> cancel(String id, {String? comment}) => _decide(id, 'cancel', comment);

  Future<PurchaseOrder> submit(String id) async => PurchaseOrder.fromJson(mapOf(await _api.post<dynamic>('procurement/purchase-orders/$id/submit')));

  Future<PurchaseOrder> receive(String id, Map<String, double> receivedByItem, {String? note}) async => PurchaseOrder.fromJson(mapOf(await _api.post<dynamic>(
        'procurement/purchase-orders/$id/receive',
        body: {
          'lines': [for (final e in receivedByItem.entries) {'itemId': e.key, 'receivedQty': e.value}],
          'note': ?note,
        },
      )));

  Future<PurchaseOrder> _decide(String id, String action, String? comment) async =>
      PurchaseOrder.fromJson(mapOf(await _api.post<dynamic>('procurement/purchase-orders/$id/$action', body: {'comment': ?comment})));
}

final procurementRepositoryProvider = Provider<ProcurementRepository>((ref) => ProcurementRepository(ref.watch(apiClientProvider)));

final procurementDashboardProvider = FutureProvider.autoDispose<ProcurementDashboard>((ref) => ref.watch(procurementRepositoryProvider).dashboard());

final purchaseOrdersProvider = FutureProvider.autoDispose.family<List<PurchaseOrder>, PoGroup>((ref, group) async {
  final page = await ref.watch(procurementRepositoryProvider).purchaseOrders(statuses: group.statuses);
  final rows = [...page.data];
  // pending approvals first, then newest
  rows.sort((a, b) {
    final pa = a.status == 'PENDING_APPROVAL' ? 0 : 1;
    final pb = b.status == 'PENDING_APPROVAL' ? 0 : 1;
    if (pa != pb) return pa - pb;
    return (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0));
  });
  return rows;
});

final purchaseOrderProvider = FutureProvider.autoDispose.family<PurchaseOrder, String>((ref, id) => ref.watch(procurementRepositoryProvider).purchaseOrder(id));

/// Reorder alerts for one outlet (null = all outlets).
final reorderAlertsProvider = FutureProvider.autoDispose.family<List<ReorderAlert>, String?>((ref, outletId) async {
  final rows = await ref.watch(procurementRepositoryProvider).alerts(outletId: outletId);
  return rows..sort((a, b) => severityOrder.indexOf(a.severity).compareTo(severityOrder.indexOf(b.severity)));
});
