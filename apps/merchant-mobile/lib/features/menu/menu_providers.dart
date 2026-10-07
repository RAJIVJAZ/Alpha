import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';
import '../outlets/outlet_providers.dart';
import 'menu_models.dart';

/// The outlet's menu (GET merchant/outlets/{id}/menu), shared by the menu
/// tab and the POS. Availability changes apply instantly and roll back if
/// the API refuses them.
class MenuController extends AsyncNotifier<List<MenuCategory>> {
  @override
  Future<List<MenuCategory>> build() async {
    final outletId = ref.watch(currentOutletIdProvider);
    if (outletId == null) return const [];
    final raw = await ref.read(apiClientProvider).get<List<dynamic>>('merchant/outlets/$outletId/menu');
    return [for (final c in listOfMaps(raw)) MenuCategory.fromJson(c)];
  }

  /// In / out of stock in bulk: POST merchant/items/availability {itemIds, isAvailable}.
  Future<void> setAvailability(List<String> itemIds, bool isAvailable) async {
    final before = state.value;
    if (before == null || itemIds.isEmpty) return;
    final ids = itemIds.toSet();
    state = AsyncData([
      for (final c in before) c.withItems([for (final i in c.items) ids.contains(i.id) ? i.withAvailability(isAvailable) : i]),
    ]);
    try {
      await ref.read(apiClientProvider).post<dynamic>('merchant/items/availability', body: {'itemIds': itemIds, 'isAvailable': isAvailable});
    } catch (_) {
      if (ref.mounted) state = AsyncData(before);
      rethrow;
    }
  }
}

final menuProvider = AsyncNotifierProvider<MenuController, List<MenuCategory>>(MenuController.new);
