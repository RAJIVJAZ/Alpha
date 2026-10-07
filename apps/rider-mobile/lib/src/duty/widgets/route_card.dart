import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../common/device.dart';
import '../../common/widgets.dart';
import '../duty_providers.dart';
import '../models.dart';

/// The optimised order of stops for everything the rider is carrying.
class RouteCard extends ConsumerWidget {
  const RouteCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final route = ref.watch(routeProvider);
    final r = route.value;
    if (r == null || r.stops.isEmpty) return const SizedBox.shrink();
    final summary = [
      '${r.totalKm.toStringAsFixed(1)} km',
      '${r.totalMins} min',
      if (r.improvedByKm > 0) 'saves ${r.improvedByKm.toStringAsFixed(1)} km',
    ].join(' · ');
    return SectionCard(
      title: 'Best route',
      icon: Icons.route,
      trailing: Caption(summary),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (final s in r.stops) _StopRow(stop: s),
        if (r.navigationUrl != null) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => openExternal(context, ref, Uri.parse(r.navigationUrl!)),
            icon: const Icon(Icons.navigation_outlined),
            label: const Text('Open full route in Maps'),
          ),
        ],
      ]),
    );
  }
}

class _StopRow extends StatelessWidget {
  const _StopRow({required this.stop});
  final RouteStop stop;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      container: true,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          CircleAvatar(
            radius: 13,
            backgroundColor: stop.isPickup ? scheme.primaryContainer : scheme.surfaceContainerHighest,
            child: Text('${stop.sequence}', style: Theme.of(context).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${stop.isPickup ? 'Pick up' : 'Drop'} · ${stop.label}', style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
              Caption('+${stop.legKm.toStringAsFixed(1)} km · arrive in ~${stop.etaMins} min'),
            ]),
          ),
          StatusChip(stop.type, label: stop.isPickup ? 'Pickup' : 'Drop', tone: stop.isPickup ? Tone.info : Tone.neutral),
        ]),
      ),
    );
  }
}
