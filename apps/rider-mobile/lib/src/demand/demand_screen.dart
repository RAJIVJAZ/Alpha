import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:latlong2/latlong.dart';

import '../common/device.dart';
import '../common/widgets.dart';
import '../duty/location_tracker.dart';
import '../profile/profile.dart';
import 'models.dart';

/// Raster tiles under the demand layers. OpenStreetMap's public servers are
/// for light use; point this at your own tile service in production.
const tileUrl = String.fromEnvironment('MAP_TILE_URL', defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');

/// Whether to draw the raster base map. Tests turn it off so nothing is fetched.
final mapTilesProvider = Provider<bool>((ref) => true);

const _youColor = Color(0xFFC2410C);

/// Where the orders are: zones with surge, demand per area, and the rider.
class DemandScreen extends ConsumerWidget {
  const DemandScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final heat = ref.watch(heatmapProvider);
    final generated = heat.value?.generatedAt;
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Demand map'),
          Text(generated == null ? 'Open orders against riders nearby' : 'Updated ${relative(generated)}', style: Theme.of(context).textTheme.bodySmall),
        ]),
        actions: [IconButton(tooltip: 'Refresh demand', onPressed: () => ref.invalidate(heatmapProvider), icon: const Icon(Icons.refresh))],
      ),
      body: AsyncView<Heatmap>(
        value: heat,
        onRetry: () => ref.invalidate(heatmapProvider),
        data: (h) => _DemandBody(heatmap: h),
      ),
    );
  }
}

/// The rider's position: the live fix while online, else the last one the server has.
final _herePositionProvider = Provider<LatLng?>((ref) {
  final fix = ref.watch(locationTrackerProvider.select((t) => t.lastFix));
  if (fix != null) return LatLng(fix.lat, fix.lng);
  final p = ref.watch(profileProvider).value;
  return p?.currentLat != null && p?.currentLng != null ? LatLng(p!.currentLat!, p.currentLng!) : null;
});

class _DemandBody extends ConsumerWidget {
  const _DemandBody({required this.heatmap});
  final Heatmap heatmap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final here = ref.watch(_herePositionProvider);
    final h = heatmap;
    final top = h.busiest();
    return Column(children: [
      Expanded(flex: 11, child: DemandMapView(heatmap: h, here: here, tiles: ref.watch(mapTilesProvider))),
      const _Legend(),
      const Divider(height: 1),
      Expanded(
        flex: 9,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Semantics(header: true, child: Text('Busiest spots', style: Theme.of(context).textTheme.titleMedium)),
            const SizedBox(height: 4),
            if (top.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Caption('Quiet right now — no open orders waiting for a rider.')),
            for (final c in top) _SpotRow(cell: c, area: h.areaOf(c.lat, c.lng), maxPressure: h.maxPressure, here: here),
            if (h.zones.isNotEmpty) ...[
              const SizedBox(height: 16),
              Semantics(header: true, child: Text('Zones', style: Theme.of(context).textTheme.titleMedium)),
              const SizedBox(height: 4),
              for (final z in h.zones)
                MergeSemantics(
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(z.shortName),
                    trailing: z.surge > 1
                        ? StatusChip('SURGE', label: '${_surge(z.surge)}× pay', tone: Tone.info)
                        : const Caption('Normal pay'),
                  ),
                ),
            ],
          ],
        ),
      ),
    ]);
  }
}

String _surge(double s) => s.toStringAsFixed(s.truncateToDouble() == s ? 0 : 1);

class _SpotRow extends ConsumerWidget {
  const _SpotRow({required this.cell, required this.area, required this.maxPressure, this.here});
  final DemandCell cell;
  final String area;
  final double maxPressure;
  final LatLng? here;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = cell;
    final away = here == null ? null : LocationService.distanceKm(here!.latitude, here!.longitude, c.lat, c.lng);
    final meta = [
      '${c.demand} open order${c.demand == 1 ? '' : 's'}',
      '${c.riders} rider${c.riders == 1 ? '' : 's'} nearby',
      if (away != null) '${away.toStringAsFixed(1)} km from you',
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(children: [
        ExcludeSemantics(
          child: Container(
            width: 14,
            height: 14,
            decoration: BoxDecoration(color: pressureColor(c.pressure, maxPressure), shape: BoxShape.circle),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: MergeSemantics(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(area, style: Theme.of(context).textTheme.titleSmall),
              Caption(meta),
            ]),
          ),
        ),
        IconButton.outlined(
          tooltip: 'Navigate to $area',
          onPressed: () => openExternal(context, ref, directionsUri(c.lat, c.lng)),
          icon: const Icon(Icons.navigation_outlined),
        ),
      ]),
    );
  }
}

/// Zones, demand circles and the rider's position on an OpenStreetMap base.
class DemandMapView extends StatelessWidget {
  const DemandMapView({super.key, required this.heatmap, this.here, this.tiles = true});
  final Heatmap heatmap;
  final LatLng? here;
  final bool tiles;

  @override
  Widget build(BuildContext context) {
    final h = heatmap;
    final scheme = Theme.of(context).colorScheme;
    final points = [
      for (final z in h.zones)
        for (final (lng, lat) in z.polygon) LatLng(lat, lng),
      for (final c in h.cells) LatLng(c.lat, c.lng),
      ?here,
    ];
    final maxDemand = h.maxDemand;
    final maxPressure = h.maxPressure;
    final summary = h.cells.isEmpty
        ? 'Map of ${h.zones.length} delivery zones. No open demand right now.'
        : 'Map of ${h.zones.length} delivery zones with ${h.cells.where((c) => c.demand > 0).length} areas of open demand. The busiest spots are listed below.';

    return Semantics(
      label: summary,
      container: true,
      child: FlutterMap(
        options: MapOptions(
          initialCenter: here ?? const LatLng(12.9716, 77.5946),
          initialZoom: 12,
          initialCameraFit: points.length < 2 ? null : CameraFit.coordinates(coordinates: points, padding: const EdgeInsets.all(28)),
          interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
          backgroundColor: scheme.surfaceContainerLow,
        ),
        children: [
          if (tiles) TileLayer(urlTemplate: tileUrl, userAgentPackageName: 'in.foodgrid.rider', maxNativeZoom: 19),
          PolygonLayer(polygons: [
            for (final z in h.zones)
              Polygon(
                points: [for (final (lng, lat) in z.polygon) LatLng(lat, lng)],
                color: const Color(0xFF2A78D6).withValues(alpha: z.surge > 1 ? 0.10 : 0.04),
                borderColor: const Color(0xFF5B6B7F),
                borderStrokeWidth: 1,
              ),
          ]),
          CircleLayer(circles: [
            for (final c in h.cells)
              CircleMarker(
                point: LatLng(c.lat, c.lng),
                radius: demandRadius(c.demand, maxDemand),
                color: pressureColor(c.pressure, maxPressure).withValues(alpha: 0.85),
                borderColor: Colors.white,
                borderStrokeWidth: 2,
              ),
          ]),
          // labels last, with a halo, so circles never hide them
          MarkerLayer(markers: [
            for (final z in h.zones)
              Marker(
                point: LatLng(z.centre.$1, z.centre.$2),
                width: 130,
                height: 40,
                child: IgnorePointer(child: _ZoneLabel(name: z.shortName, surge: z.surge)),
              ),
            if (here != null)
              Marker(
                point: here!,
                width: 22,
                height: 22,
                child: Tooltip(
                  message: 'You',
                  child: Container(
                    decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, border: Border.all(color: _youColor, width: 4)),
                  ),
                ),
              ),
          ]),
          if (tiles) const SimpleAttributionWidget(source: Text('OpenStreetMap contributors')),
        ],
      ),
    );
  }
}

class _ZoneLabel extends StatelessWidget {
  const _ZoneLabel({required this.name, required this.surge});
  final String name;
  final double surge;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context).textTheme.labelSmall!.copyWith(fontSize: 11, color: const Color(0xFF1F2937));
    Widget halo(String s, TextStyle style) => Stack(children: [
          Text(
            s,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              foreground: Paint()
                ..style = PaintingStyle.stroke
                ..strokeWidth = 3
                ..color = Colors.white,
            ),
          ),
          Text(s, textAlign: TextAlign.center, style: style),
        ]);
    return ExcludeSemantics(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        halo(name, base),
        if (surge > 1) halo('${_surge(surge)}× pay', base.copyWith(fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);
    return Semantics(
      label: 'Legend: circle size shows open orders; darker blue means more orders per available rider; the orange ring marks you.',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: Wrap(spacing: 14, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
          Row(mainAxisSize: MainAxisSize.min, children: [
            Text('Fewer', style: style),
            const SizedBox(width: 4),
            for (final c in pressureRamp) Container(width: 14, height: 10, color: c),
            const SizedBox(width: 4),
            Flexible(child: Text('More orders per rider', style: style)),
          ]),
          Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 12, height: 12, decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, border: Border.all(color: _youColor, width: 3))),
            const SizedBox(width: 4),
            Text('You', style: style),
          ]),
          Text('Circle size = open orders', style: style),
        ]),
      ),
    );
  }
}
