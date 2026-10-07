import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../account/models.dart';
import '../common/json.dart';

class Inbox {
  const Inbox({this.items = const [], this.unread = 0});
  final List<AppNotification> items;
  final int unread;
}

/// The notification inbox (newest first) with the unread count.
final inboxProvider = FutureProvider<Inbox>((ref) async {
  final session = await ref.watch(sessionProvider.future);
  if (session == null) return const Inbox();
  final j = asJson(await ref.watch(apiClientProvider).get<dynamic>('notifications', query: {'page': 1}));
  final items = listOf(j['data'], AppNotification.fromJson);
  return Inbox(items: items, unread: optInt(j['unread']) ?? items.where((n) => n.unread).length);
});
