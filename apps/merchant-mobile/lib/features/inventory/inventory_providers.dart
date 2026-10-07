import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';
import '../outlets/outlet_providers.dart';
import 'inventory_models.dart';

typedef StockFilter = ({String? category, String? status, String q});

/// GET inventory/summary?outletId= (stock value, low / out counts, expiring batches).
final inventorySummaryProvider = FutureProvider.autoDispose<InventorySummary>((ref) async {
  final outletId = ref.watch(currentOutletIdProvider);
  if (outletId == null) return const InventorySummary();
  return InventorySummary.fromJson(await ref.watch(apiClientProvider).get<Map<String, dynamic>>('inventory/summary', query: {'outletId': outletId}));
});

/// GET inventory/ingredients with the web filters (outletId, category,
/// status, q). "Other" covers every category without its own chip.
final ingredientsProvider = FutureProvider.autoDispose.family<List<Ingredient>, StockFilter>((ref, f) async {
  final outletId = ref.watch(currentOutletIdProvider);
  if (outletId == null) return const [];
  final other = f.category == 'OTHER';
  final r = await ref.watch(apiClientProvider).get<Map<String, dynamic>>('inventory/ingredients', query: {
    'outletId': outletId,
    'category': other ? null : f.category,
    'status': f.status,
    'q': f.q,
    'pageSize': 500, // the API's maximum page size
  });
  final rows = [for (final j in rowsOf(r)) Ingredient.fromJson(j)];
  return other ? [for (final i in rows) if (!namedInventoryCategories.contains(i.category)) i] : rows;
});

enum StockAction {
  receive('Receive stock', 'Stock received'),
  wastage('Record wastage', 'Wastage recorded'),
  count('Stock count', 'Stock count saved');

  const StockAction(this.title, this.done);
  final String title;
  final String done;
}

/// Stock movements, same endpoints and bodies as the web StockDialog.
class InventoryRepository {
  InventoryRepository(this._api);
  final ApiClient _api;

  Future<void> submit(StockAction action, {required String outletId, required Ingredient ingredient, required double quantity, double? unitCost, String? reason}) =>
      switch (action) {
        StockAction.receive => _api.post<dynamic>('inventory/stock/receive', body: {
            'outletId': outletId,
            'lines': [
              {'ingredientId': ingredient.id, 'quantity': quantity, 'unitCost': unitCost ?? ingredient.avgUnitCost},
            ],
            'note': ?reason,
          }),
        StockAction.wastage => _api.post<dynamic>('inventory/stock/wastage', body: {'ingredientId': ingredient.id, 'quantity': quantity, 'reason': reason ?? 'Spoiled'}),
        StockAction.count => _api.post<dynamic>('inventory/stock/adjust', body: {'ingredientId': ingredient.id, 'countedQuantity': quantity, 'reason': reason ?? 'Stock count'}),
      };
}

final inventoryRepositoryProvider = Provider<InventoryRepository>((ref) => InventoryRepository(ref.watch(apiClientProvider)));
