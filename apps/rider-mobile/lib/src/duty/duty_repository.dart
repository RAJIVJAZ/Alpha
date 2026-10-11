import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';
import '../common/session_scope.dart';
import '../profile/profile.dart';
import 'models.dart';

final dutyRepositoryProvider = Provider<DutyRepository>((ref) {
  ref.watch(riderUserIdProvider);
  return DutyRepository(ref.watch(apiClientProvider));
});

/// The geofenced steps: the server checks the rider's last position, so the
/// app sends a fresh fix right before them.
const geofencedActions = {'arrived-pickup', 'arrived-drop', 'complete'};

/// delivery-service endpoints used on the duty screen.
class DutyRepository {
  DutyRepository(this._api);
  final ApiClient _api;

  Future<RiderProfile> profile() async => RiderProfile.fromJson(await _api.get<Json>('riders/me'));

  /// Applies (or applies again) to become a delivery partner.
  Future<void> apply(Json application) => _api.post<dynamic>('riders/onboarding', body: application);

  Future<void> goOnline(Fix fix) => _api.post<dynamic>('riders/me/online', body: fixBody(fix));

  Future<void> goOffline() => _api.post<dynamic>('riders/me/offline');

  Future<void> ping(Fix fix) => _api.post<dynamic>('riders/me/location', body: fixBody(fix));

  Future<List<Offer>> offers() async => [for (final o in jsonList(await _api.get<List<dynamic>>('riders/me/offers'))) Offer.fromJson(o)];

  Future<void> acceptOffer(String offerId) => _api.post<dynamic>('deliveries/offers/$offerId/accept');

  Future<void> rejectOffer(String offerId, String reason) => _api.post<dynamic>('deliveries/offers/$offerId/reject', body: {'reason': reason});

  Future<List<Delivery>> current() async => [for (final d in jsonList(await _api.get<List<dynamic>>('riders/me/deliveries/current'))) Delivery.fromJson(d)];

  /// arrived-pickup, picked-up or arrived-drop.
  Future<void> step(String deliveryId, String action) => _api.post<dynamic>('deliveries/$deliveryId/$action');

  Future<void> complete(String deliveryId, {String? otp, String? proofPhotoUrl, bool? codCollected}) => _api.post<dynamic>(
        'deliveries/$deliveryId/complete',
        body: {'otp': ?otp, 'proofPhotoUrl': ?proofPhotoUrl, 'codCollected': ?codCollected},
      );

  Future<void> fail(String deliveryId, String reason) => _api.post<dynamic>('deliveries/$deliveryId/fail', body: {'reason': reason});

  Future<RoutePlan> route() async => RoutePlan.fromJson(await _api.get<Json>('riders/me/route'));

  Future<Json> earningsSummary({String? from, String? to}) => _api.get<Json>('riders/me/earnings', query: {'from': from, 'to': to});

  /// The LocationPingDto body: lat, lng and whatever else the fix carries.
  static Json fixBody(Fix f) => {
        'lat': f.lat,
        'lng': f.lng,
        'accuracyM': ?f.accuracyM?.roundToDouble(),
        'speedKmph': ?f.speedKmph?.roundToDouble(),
        'heading': ?f.heading?.roundToDouble(),
      };
}
