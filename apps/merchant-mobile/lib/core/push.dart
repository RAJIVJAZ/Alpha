import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

/// Registers this phone for order pushes (app = MERCHANT). Call it with the
/// FCM / APNs token from a push plugin after sign-in and whenever it rotates;
/// see README "Push notifications".
Future<void> registerMerchantPush(WidgetRef ref, String token) => registerPushToken(ref.read(apiClientProvider), ref.read(appConfigProvider), token);

/// Stops pushes to this phone (call before signing out).
Future<void> unregisterMerchantPush(WidgetRef ref, String token) => unregisterPushToken(ref.read(apiClientProvider), token);
