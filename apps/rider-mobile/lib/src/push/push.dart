import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/session_scope.dart';

/// This device's push token (FCM on Android, APNs on iOS), or null.
///
/// The app ships without a push plugin, so the default returns null. After
/// adding one (e.g. firebase_messaging), override this in `main()`:
///
/// ```dart
/// pushTokenSourceProvider.overrideWithValue(() => FirebaseMessaging.instance.getToken()),
/// ```
final pushTokenSourceProvider = Provider<Future<String?> Function()>((ref) => () async => null);

/// Registers the token for the signed-in rider via `registerPushToken`, so
/// offers and order updates reach the phone while the app is closed. Re-runs
/// when another rider signs in.
final pushRegistrationProvider = FutureProvider<String?>((ref) async {
  final userId = ref.watch(riderUserIdProvider);
  if (userId == null) return null;
  final token = await ref.read(pushTokenSourceProvider)();
  if (token == null || token.isEmpty) return null;
  await registerPushToken(ref.read(apiClientProvider), ref.read(appConfigProvider), token);
  return token;
});
