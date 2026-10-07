import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Small key-value storage for per-device conveniences (the chosen delivery
/// location, a table's in-progress order). Never used for secrets.
abstract class LocalStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> remove(String key);
}

class PrefsLocalStore implements LocalStore {
  PrefsLocalStore([SharedPreferencesAsync? prefs]) : _prefs = prefs ?? SharedPreferencesAsync();
  final SharedPreferencesAsync _prefs;

  @override
  Future<String?> read(String key) async {
    try {
      return await _prefs.getString(key);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String key, String value) async {
    try {
      await _prefs.setString(key, value);
    } catch (_) {
      // storage unavailable: the choice lasts for this session only
    }
  }

  @override
  Future<void> remove(String key) async {
    try {
      await _prefs.remove(key);
    } catch (_) {}
  }
}

/// In-memory store for tests.
class MemoryLocalStore implements LocalStore {
  MemoryLocalStore([Map<String, String>? initial]) : values = {...?initial};
  final Map<String, String> values;

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> remove(String key) async => values.remove(key);
}

final localStoreProvider = Provider<LocalStore>((ref) => PrefsLocalStore());
