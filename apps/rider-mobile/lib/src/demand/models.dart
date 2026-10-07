import 'dart:math' as math;

import 'package:flutter/painting.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';
import '../common/polling.dart';
import '../common/session_scope.dart';

/// A delivery zone. [polygon] is a single ring of `[lng, lat]` pairs (GeoJSON order).
class DemandZone {
  const DemandZone({required this.id, required this.name, required this.surge, required this.polygon});
  final String id;
  final String name;
  final double surge;
  final List<(double lng, double lat)> polygon;

  /// "Bengaluru - Koramangala" → "Koramangala".
  String get shortName => shortZoneName(name);

  /// Mean of the ring's vertices (the closing vertex counted once).
  (double lat, double lng) get centre {
    final ring = polygon.length > 1 && polygon.first == polygon.last ? polygon.sublist(0, polygon.length - 1) : polygon;
    if (ring.isEmpty) return (0, 0);
    var lat = 0.0, lng = 0.0;
    for (final (x, y) in ring) {
      lng += x;
      lat += y;
    }
    return (lat / ring.length, lng / ring.length);
  }

  bool contains(double lat, double lng) => pointInRing(lat, lng, polygon);

  factory DemandZone.fromJson(Json j) => DemandZone(
        id: strOf(j['id']),
        name: strOf(j['name']),
        surge: numOf(j['surge'], 1),
        polygon: [
          for (final p in (j['polygon'] as List? ?? const []))
            if (p is List && p.length >= 2) (numOf(p[0]), numOf(p[1])),
        ],
      );
}

/// A geohash cell: open orders ([demand]) against riders nearby; [pressure]
/// is orders per available rider.
class DemandCell {
  const DemandCell({required this.geohash, required this.lat, required this.lng, required this.demand, required this.riders, required this.pressure});
  final String geohash;
  final double lat;
  final double lng;
  final int demand;
  final int riders;
  final double pressure;

  factory DemandCell.fromJson(Json j) => DemandCell(
        geohash: strOf(j['geohash']),
        lat: numOf(j['lat']),
        lng: numOf(j['lng']),
        demand: intOf(j['demand']),
        riders: intOf(j['riders']),
        pressure: numOf(j['pressure']),
      );
}

/// GET riders/heatmap
class Heatmap {
  const Heatmap({required this.zones, required this.cells, this.generatedAt});
  final List<DemandZone> zones;
  final List<DemandCell> cells;
  final DateTime? generatedAt;

  int get maxDemand => cells.fold(1, (m, c) => c.demand > m ? c.demand : m);
  double get maxPressure => cells.fold(1.0, (m, c) => c.pressure > m ? c.pressure : m);

  /// Zones overlap at the edges: of the zones containing the point, the one
  /// whose centre is nearest names it.
  String areaOf(double lat, double lng) {
    DemandZone? best;
    var bestD = double.infinity;
    for (final z in zones) {
      if (!z.contains(lat, lng)) continue;
      final (clat, clng) = z.centre;
      final d = (clat - lat) * (clat - lat) + (clng - lng) * (clng - lng);
      if (d < bestD) (best, bestD) = (z, d);
    }
    return best?.shortName ?? 'Outside zones';
  }

  /// Cells with open orders, most orders-per-rider first.
  List<DemandCell> busiest({int limit = 5}) =>
      (cells.where((c) => c.demand > 0).toList()..sort((a, b) => b.pressure != a.pressure ? b.pressure.compareTo(a.pressure) : b.demand.compareTo(a.demand))).take(limit).toList();

  factory Heatmap.fromJson(Json j) => Heatmap(
        zones: [for (final z in jsonList(j['zones'])) DemandZone.fromJson(z)],
        cells: [for (final c in jsonList(j['cells'])) DemandCell.fromJson(c)],
        generatedAt: dateOrNull(j['generatedAt']),
      );
}

String shortZoneName(String name) => name.replaceFirst(RegExp(r'^[^-]+ - '), '');

/// Ray casting on a ring of `(lng, lat)` pairs.
bool pointInRing(double lat, double lng, List<(double lng, double lat)> ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    final (xi, yi) = ring[i];
    final (xj, yj) = ring[j];
    if ((yi > lat) != (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/// Sequential blue ramp for demand pressure, light (few orders per rider) to dark.
const pressureRamp = [Color(0xFFCFE1F7), Color(0xFF9FC3EF), Color(0xFF6AA2E4), Color(0xFF3987E5), Color(0xFF1F66C2), Color(0xFF13498E)];

Color pressureColor(double pressure, double maxPressure) {
  final t = maxPressure <= 0 ? 0.0 : (pressure / maxPressure).clamp(0.0, 1.0);
  return pressureRamp[(t * (pressureRamp.length - 1)).floor()];
}

/// Circle radius in logical pixels: area grows with open orders.
double demandRadius(int demand, int maxDemand) {
  final share = maxDemand <= 0 ? 0.0 : (demand / maxDemand).clamp(0.0, 1.0);
  return 6 + 18 * math.sqrt(share);
}

final heatmapProvider = FutureProvider<Heatmap>((ref) async {
  ref.watch(riderUserIdProvider);
  pollEvery(ref, const Duration(seconds: 30));
  return Heatmap.fromJson(await ref.watch(apiClientProvider).get<Json>('riders/heatmap'));
});
