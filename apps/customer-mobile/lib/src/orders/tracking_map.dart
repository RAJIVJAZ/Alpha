import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import 'models.dart';
import 'providers.dart';

/// Restaurant, rider and drop on an OpenStreetMap map.
class TrackingMap extends ConsumerWidget {
  const TrackingMap({super.key, required this.tracking});
  final Tracking tracking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = tracking;
    final tiles = ref.watch(mapTileUrlProvider);
    final scheme = Theme.of(context).colorScheme;
    final outlet = t.outlet;
    final drop = t.drop;
    final rider = t.rider;
    final riderAt = rider?.lat != null && rider?.lng != null ? LatLng(rider!.lat!, rider.lng!) : null;
    final points = [
      if (outlet != null) LatLng(outlet.lat, outlet.lng),
      if (drop != null) LatLng(drop.lat, drop.lng),
      ?riderAt,
    ];
    if (points.isEmpty) return const SizedBox.shrink();
    Marker pin(LatLng at, IconData icon, Color color, String label, {double size = 34}) => Marker(
          point: at,
          width: 96,
          height: size + 22,
          child: Semantics(
            label: label,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: size,
                height: size,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3)),
                child: Icon(icon, size: size * 0.5, color: Colors.white),
              ),
              Container(
                margin: const EdgeInsets.only(top: 2),
                padding: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.9), borderRadius: BorderRadius.circular(4)),
                child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.black)),
              ),
            ]),
          ),
        );
    return Semantics(
      container: true,
      label: 'Map: restaurant${riderAt != null ? ', your rider' : ''}${drop != null ? ' and your address' : ''}',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          height: 240,
          child: FlutterMap(
            options: MapOptions(
              initialCenter: points.first,
              initialZoom: 14,
              initialCameraFit: points.length > 1 ? CameraFit.coordinates(coordinates: points, padding: const EdgeInsets.all(56), maxZoom: 16) : null,
              backgroundColor: scheme.surfaceContainerHighest,
              interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
            ),
            children: [
              if (tiles != null) TileLayer(urlTemplate: tiles, userAgentPackageName: 'in.foodgrid.customer'),
              if (outlet != null && drop != null)
                PolylineLayer(polylines: [
                  Polyline(points: [LatLng(outlet.lat, outlet.lng), LatLng(drop.lat, drop.lng)], strokeWidth: 3, color: scheme.outline, pattern: StrokePattern.dashed(segments: const [8, 8])),
                ]),
              MarkerLayer(markers: [
                if (outlet != null) pin(LatLng(outlet.lat, outlet.lng), Icons.storefront, const Color(0xFF7C3AED), 'Restaurant'),
                if (drop != null) pin(LatLng(drop.lat, drop.lng), Icons.home, const Color(0xFF0F7A3A), 'You'),
                if (riderAt != null) pin(riderAt, Icons.delivery_dining, scheme.primary, rider!.firstName, size: 40),
              ]),
              if (tiles != null) const SimpleAttributionWidget(source: Text('OpenStreetMap contributors')),
            ],
          ),
        ),
      ),
    );
  }
}
