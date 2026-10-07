import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Remembers the chosen outlet per business between launches.
abstract class OutletStore {
  Future<String?> read(String tenantId);
  Future<void> write(String tenantId, String outletId);
}

class PrefsOutletStore implements OutletStore {
  static String _key(String tenantId) => 'fg.outlet.$tenantId';

  @override
  Future<String?> read(String tenantId) async {
    try {
      return (await SharedPreferences.getInstance()).getString(_key(tenantId));
    } catch (_) {
      return null; // storage unavailable: ask again
    }
  }

  @override
  Future<void> write(String tenantId, String outletId) async {
    try {
      await (await SharedPreferences.getInstance()).setString(_key(tenantId), outletId);
    } catch (_) {
      // not fatal; the picker shows again next launch
    }
  }
}

class MemoryOutletStore implements OutletStore {
  MemoryOutletStore([Map<String, String>? initial]) : _values = {...?initial};
  final Map<String, String> _values;

  @override
  Future<String?> read(String tenantId) async => _values[tenantId];

  @override
  Future<void> write(String tenantId, String outletId) async => _values[tenantId] = outletId;
}

final outletStoreProvider = Provider<OutletStore>((ref) => PrefsOutletStore());
