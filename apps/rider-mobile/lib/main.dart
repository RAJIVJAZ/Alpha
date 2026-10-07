import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'src/app.dart';

/// FoodGrid Rider: the delivery partner app.
///
///   flutter run --dart-define=API_URL=http://10.0.2.2:8080/api/v1
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ProviderScope(
      retry: retryTransientErrors,
      overrides: [appConfigProvider.overrideWithValue(const AppConfig(app: ClientApp.rider))],
      child: const RiderApp(),
    ),
  );
}
