import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';
import '../../core/outlet_store.dart';
import '../../core/permissions.dart';
import 'outlet.dart';

class OutletState {
  const OutletState({this.tenantId, this.outlets = const [], this.selectedId});

  final String? tenantId;
  final List<Outlet> outlets;
  final String? selectedId;

  Outlet? get selected {
    for (final o in outlets) {
      if (o.id == selectedId) return o;
    }
    return null;
  }

  OutletState copyWith({List<Outlet>? outlets, String? selectedId}) =>
      OutletState(tenantId: tenantId, outlets: outlets ?? this.outlets, selectedId: selectedId ?? this.selectedId);
}

/// Outlets of the active business (as the web OutletProvider: GET
/// merchant/outlets) and the one this device works on, remembered per business.
class OutletController extends AsyncNotifier<OutletState> {
  @override
  Future<OutletState> build() async {
    final (tenantId, tenantType) = ref.watch(sessionProvider.select((s) => (s.value?.claims.tenantId, s.value?.claims.tenantType)));
    if (tenantId == null || !isMerchantTenant(tenantType)) return const OutletState();
    final outlets = await _fetch();
    final saved = await ref.read(outletStoreProvider).read(tenantId);
    final selectedId = outlets.any((o) => o.id == saved)
        ? saved
        : outlets.length == 1
            ? outlets.first.id
            : null;
    return OutletState(tenantId: tenantId, outlets: outlets, selectedId: selectedId);
  }

  Future<List<Outlet>> _fetch() async {
    final raw = await ref.read(apiClientProvider).get<List<dynamic>>('merchant/outlets');
    return [for (final j in listOfMaps(raw)) Outlet.fromJson(j)];
  }

  Future<void> select(String outletId) async {
    final current = state.requireValue;
    await ref.read(outletStoreProvider).write(current.tenantId!, outletId);
    state = AsyncData(current.copyWith(selectedId: outletId));
  }

  /// Re-reads the outlet list (open / closed state changes elsewhere too).
  Future<void> refreshOutlets() async {
    final current = state.value;
    if (current == null || current.tenantId == null) return;
    final outlets = await _fetch();
    if (ref.mounted) state = AsyncData(current.copyWith(outlets: outlets));
  }

  /// Open / close for orders: POST merchant/outlets/{id}/availability {isOpen}.
  Future<void> setOpen(String outletId, bool isOpen) async {
    await ref.read(apiClientProvider).post<dynamic>('merchant/outlets/$outletId/availability', body: {'isOpen': isOpen});
    final current = state.value;
    if (current == null || !ref.mounted) return;
    state = AsyncData(current.copyWith(outlets: [for (final o in current.outlets) o.id == outletId ? o.copyWith(isOpen: isOpen) : o]));
  }
}

final outletControllerProvider = AsyncNotifierProvider<OutletController, OutletState>(OutletController.new);

/// The outlet every screen works on (null until picked).
final currentOutletProvider = Provider<Outlet?>((ref) => ref.watch(outletControllerProvider).value?.selected);

final currentOutletIdProvider = Provider<String?>((ref) => ref.watch(currentOutletProvider.select((o) => o?.id)));
