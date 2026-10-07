import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'src/app/app.dart';

/// FoodGrid customer app.
///
///   flutter run --dart-define=API_URL=http://10.0.2.2:8080/api/v1 \
///               --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(ProviderScope(
    overrides: [appConfigProvider.overrideWithValue(const AppConfig(app: ClientApp.customer))],
    retry: retryNetworkErrors,
    child: const CustomerApp(),
  ));
}
