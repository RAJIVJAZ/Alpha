import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';
import 'models.dart';

final profileProvider = FutureProvider.autoDispose<Profile>((ref) async {
  return Profile.fromJson(asJson(await ref.watch(apiClientProvider).get<dynamic>('users/me')));
});

final notificationPrefsProvider = FutureProvider.autoDispose<NotificationPrefs>((ref) async {
  return NotificationPrefs.fromJson(asJson(await ref.watch(apiClientProvider).get<dynamic>('notifications/preferences')));
});
