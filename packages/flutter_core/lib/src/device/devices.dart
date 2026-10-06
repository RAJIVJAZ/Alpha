import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../config.dart';

/// Registers a push token (FCM on Android, APNs on iOS) for this user, so
/// order updates and admin campaigns reach the device. Call it with the
/// token from your push plugin after sign-in and whenever it rotates.
Future<void> registerPushToken(ApiClient api, AppConfig config, String token) => api.post<void>('devices', body: {
      'token': token,
      'platform': switch (defaultTargetPlatform) {
        TargetPlatform.iOS => 'IOS',
        TargetPlatform.android => 'ANDROID',
        _ => 'WEB',
      },
      'app': config.appName,
    });

Future<void> unregisterPushToken(ApiClient api, String token) => api.delete<void>('devices/${Uri.encodeComponent(token)}');
