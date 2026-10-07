import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';

/// A delivery offered to this rider (GET riders/me/offers), valid until [expiresAt].
class Offer {
  const Offer({
    required this.id,
    required this.deliveryId,
    required this.distanceToPickupKm,
    required this.estimatedEarning,
    required this.expiresAt,
    required this.orderNumber,
    required this.pickupName,
    required this.pickupAddress,
    required this.pickupLat,
    required this.pickupLng,
    required this.dropAddress,
    required this.dropLat,
    required this.dropLng,
    required this.distanceKm,
    required this.isCod,
    required this.codAmount,
  });

  final String id;
  final String deliveryId;
  final double distanceToPickupKm;
  final double estimatedEarning;
  final DateTime expiresAt;
  final String orderNumber;
  final String pickupName;
  final String pickupAddress;
  final double pickupLat;
  final double pickupLng;
  final String dropAddress;
  final double dropLat;
  final double dropLng;
  final double distanceKm;
  final bool isCod;
  final double codAmount;

  Duration timeLeft([DateTime? now]) {
    final left = expiresAt.difference(now ?? DateTime.now());
    return left.isNegative ? Duration.zero : left;
  }

  factory Offer.fromJson(Json j) {
    final d = jsonOrNull(j['delivery']) ?? const <String, dynamic>{};
    return Offer(
      id: strOf(j['id']),
      deliveryId: strOf(j['deliveryId'] ?? d['id']),
      distanceToPickupKm: numOf(j['distanceToPickupKm']),
      estimatedEarning: dec(j['estimatedEarning']),
      expiresAt: dateOrNull(j['expiresAt']) ?? DateTime.now(),
      orderNumber: strOf(d['orderNumber']),
      pickupName: strOf(d['pickupName'], 'Restaurant'),
      pickupAddress: strOf(d['pickupAddress']),
      pickupLat: numOf(d['pickupLat']),
      pickupLng: numOf(d['pickupLng']),
      dropAddress: strOf(d['dropAddress']),
      dropLat: numOf(d['dropLat']),
      dropLng: numOf(d['dropLng']),
      distanceKm: numOf(d['distanceKm']),
      isCod: d['isCod'] == true,
      codAmount: dec(d['codAmount']),
    );
  }
}

/// A delivery assigned to this rider (current or past).
class Delivery {
  const Delivery({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.pickupName,
    required this.pickupAddress,
    required this.pickupLat,
    required this.pickupLng,
    this.pickupPhone,
    this.dropName,
    required this.dropAddress,
    required this.dropLat,
    required this.dropLng,
    this.dropPhone,
    required this.distanceKm,
    this.estimatedMins,
    required this.isCod,
    required this.codAmount,
    required this.tipAmount,
    required this.riderEarning,
    this.failureReason,
    this.deliveredAt,
    this.createdAt,
  });

  final String id;
  final String orderNumber;
  final String status;
  final String pickupName;
  final String pickupAddress;
  final double pickupLat;
  final double pickupLng;
  final String? pickupPhone;
  final String? dropName;
  final String dropAddress;
  final double dropLat;
  final double dropLng;
  final String? dropPhone;
  final double distanceKm;
  final int? estimatedMins;
  final bool isCod;
  final double codAmount;
  final double tipAmount;
  final double riderEarning;
  final String? failureReason;
  final DateTime? deliveredAt;
  final DateTime? createdAt;

  /// Still heading to (or waiting at) the restaurant.
  bool get toPickup => status == 'ASSIGNED' || status == 'AT_PICKUP';

  double get totalEarning => riderEarning + tipAmount;

  factory Delivery.fromJson(Json j) => Delivery(
        id: strOf(j['id']),
        orderNumber: strOf(j['orderNumber']),
        status: strOf(j['status']),
        pickupName: strOf(j['pickupName'], 'Restaurant'),
        pickupAddress: strOf(j['pickupAddress']),
        pickupLat: numOf(j['pickupLat']),
        pickupLng: numOf(j['pickupLng']),
        pickupPhone: strOrNull(j['pickupPhone']),
        dropName: strOrNull(j['dropName']),
        dropAddress: strOf(j['dropAddress']),
        dropLat: numOf(j['dropLat']),
        dropLng: numOf(j['dropLng']),
        dropPhone: strOrNull(j['dropPhone']),
        distanceKm: numOf(j['distanceKm']),
        estimatedMins: j['estimatedMins'] == null ? null : intOf(j['estimatedMins']),
        isCod: j['isCod'] == true,
        codAmount: dec(j['codAmount']),
        tipAmount: dec(j['tipAmount']),
        riderEarning: dec(j['riderEarning']),
        failureReason: strOrNull(j['failureReason']),
        deliveredAt: dateOrNull(j['deliveredAt']),
        createdAt: dateOrNull(j['createdAt']),
      );
}

class RouteStop {
  const RouteStop({required this.id, required this.type, required this.label, required this.sequence, required this.legKm, required this.etaMins, required this.lat, required this.lng});
  final String id;
  final String type;
  final String label;
  final int sequence;
  final double legKm;
  final int etaMins;
  final double lat;
  final double lng;

  bool get isPickup => type == 'PICKUP';

  factory RouteStop.fromJson(Json j) => RouteStop(
        id: strOf(j['id']),
        type: strOf(j['type']),
        label: strOf(j['label']),
        sequence: intOf(j['sequence']),
        legKm: numOf(j['legKm']),
        etaMins: intOf(j['etaMins']),
        lat: numOf(j['lat']),
        lng: numOf(j['lng']),
      );
}

/// Optimised order of stops for the open deliveries (GET riders/me/route).
class RoutePlan {
  const RoutePlan({required this.stops, required this.totalKm, required this.totalMins, required this.improvedByKm, this.navigationUrl});
  final List<RouteStop> stops;
  final double totalKm;
  final int totalMins;
  final double improvedByKm;
  final String? navigationUrl;

  factory RoutePlan.fromJson(Json j) => RoutePlan(
        stops: [for (final s in jsonList(j['stops'])) RouteStop.fromJson(s)]..sort((a, b) => a.sequence.compareTo(b.sequence)),
        totalKm: numOf(j['totalKm']),
        totalMins: intOf(j['totalMins']),
        improvedByKm: numOf(j['improvedByKm']),
        navigationUrl: strOrNull(j['navigationUrl']),
      );
}
