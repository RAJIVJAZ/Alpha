import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderOrFamily;

import '../common/polling.dart';
import '../profile/profile.dart';
import 'duty_repository.dart';
import 'models.dart';

/// Pending offers, polled every 5 s while online (the socket's `offer:new`
/// refreshes them straight away). Empty while offline.
final offersProvider = FutureProvider<List<Offer>>((ref) async {
  final online = ref.watch(isOnlineProvider);
  final repo = ref.watch(dutyRepositoryProvider);
  if (!online) return const [];
  pollEvery(ref, const Duration(seconds: 5));
  final now = DateTime.now();
  return [for (final o in await repo.offers()) if (o.expiresAt.isAfter(now)) o];
});

/// Deliveries in progress, polled every 10 s.
final currentDeliveriesProvider = FutureProvider<List<Delivery>>((ref) {
  pollEvery(ref, const Duration(seconds: 10));
  return ref.watch(dutyRepositoryProvider).current();
});

/// Best order of stops for the open deliveries, refreshed every 30 s.
final routeProvider = FutureProvider<RoutePlan>((ref) {
  pollEvery(ref, const Duration(seconds: 30));
  return ref.watch(dutyRepositoryProvider).route();
});

/// Everything the duty screen shows after an action changes the rider's work.
void refreshDuty(void Function(ProviderOrFamily) invalidate) {
  invalidate(offersProvider);
  invalidate(currentDeliveriesProvider);
  invalidate(routeProvider);
  invalidate(profileProvider);
  invalidate(todayEarningsProvider);
}
