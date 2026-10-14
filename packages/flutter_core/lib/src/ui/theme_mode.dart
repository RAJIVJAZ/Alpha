import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// A Light / Dark / System choice kept between launches. [fallback] applies until the user
/// picks one (and when the device store cannot be read, e.g. in widget tests).
class ThemeModeController extends Notifier<ThemeMode> {
  ThemeModeController({this.fallback = ThemeMode.system, this.key = 'fg.theme', FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage();

  final ThemeMode fallback;
  final String key;
  final FlutterSecureStorage _storage;

  @override
  ThemeMode build() {
    _restore();
    return fallback;
  }

  Future<void> _restore() async {
    try {
      final saved = await _storage.read(key: key);
      for (final m in ThemeMode.values) {
        if (m.name == saved) state = m;
      }
    } catch (_) {
      // no store on this platform: keep the fallback
    }
  }

  Future<void> choose(ThemeMode mode) async {
    state = mode;
    try {
      await _storage.write(key: key, value: mode.name);
    } catch (_) {
      // kept for this run only
    }
  }
}

/// Light / Dark / System buttons for a settings screen.
class ThemeModePicker extends StatelessWidget {
  const ThemeModePicker({super.key, required this.mode, required this.onChanged});

  final ThemeMode mode;
  final ValueChanged<ThemeMode> onChanged;

  @override
  Widget build(BuildContext context) => SegmentedButton<ThemeMode>(
    segments: const [
      ButtonSegment(value: ThemeMode.light, icon: Icon(Icons.light_mode_outlined), label: Text('Light')),
      ButtonSegment(value: ThemeMode.dark, icon: Icon(Icons.dark_mode_outlined), label: Text('Dark')),
      ButtonSegment(value: ThemeMode.system, icon: Icon(Icons.brightness_auto_outlined), label: Text('Phone')),
    ],
    selected: {mode},
    onSelectionChanged: (s) => onChanged(s.first),
  );
}
