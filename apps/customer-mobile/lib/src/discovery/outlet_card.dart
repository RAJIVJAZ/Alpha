import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../common/widgets.dart';
import 'models.dart';
import 'providers.dart';

/// Restaurant / food cart card. Closed places are dimmed with "Closed now";
/// sponsored ones carry an "Ad" label and report the click.
class OutletCard extends ConsumerWidget {
  const OutletCard({super.key, required this.outlet, this.compact = false});

  final OutletSummary outlet;
  final bool compact;

  void _open(BuildContext context, WidgetRef ref) {
    if (outlet.sponsored) reportAdClick(ref.read(apiClientProvider), outlet.adCampaignId);
    context.push('/outlets/${outlet.slug}');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = outlet;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final meta = '${o.etaMins} min · ${o.distanceKm.toStringAsFixed(1)} km · ${money(o.costForTwo, whole: true)} for two';
    return Semantics(
      button: true,
      label: [
        o.name,
        if (o.sponsored) 'Ad',
        if (!o.isOpenNow) 'Closed now',
        o.ratingCount > 0 ? 'rated ${o.ratingAvg.toStringAsFixed(1)}' : 'new',
        o.cuisines.join(', '),
        meta,
        if (o.isPureVeg) 'pure veg',
      ].join(', '),
      excludeSemantics: true,
      child: InkWell(
        key: Key('outlet-${o.slug}'),
        borderRadius: BorderRadius.circular(14),
        onTap: () => _open(context, ref),
        child: Opacity(
          opacity: o.isOpenNow ? 1 : 0.6,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            AspectRatio(
              aspectRatio: compact ? 16 / 10 : 16 / 9,
              child: Stack(fit: StackFit.expand, children: [
                FoodImage(url: o.coverImageUrl, radius: 14, icon: o.isFoodCart ? Icons.storefront : Icons.restaurant),
                if (o.sponsored)
                  Positioned(
                    left: 8,
                    top: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.65), borderRadius: BorderRadius.circular(4)),
                      child: Text('Ad', style: text.labelSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w600)),
                    ),
                  ),
                if (!o.isOpenNow)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.7),
                        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(14)),
                      ),
                      child: Row(children: [
                        const Icon(Icons.schedule, size: 14, color: Colors.white),
                        const SizedBox(width: 6),
                        Text('Closed now', style: text.labelMedium?.copyWith(color: Colors.white)),
                      ]),
                    ),
                  ),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 8, 2, 0),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(child: Text(o.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
                const SizedBox(width: 8),
                RatingPill(value: o.ratingAvg, count: o.ratingCount),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Text('${o.isFoodCart ? 'Food cart · ' : ''}${o.cuisines.join(', ')}', maxLines: 1, overflow: TextOverflow.ellipsis, style: text.bodySmall?.copyWith(color: muted)),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Row(children: [
                Icon(Icons.schedule, size: 14, color: muted),
                const SizedBox(width: 4),
                Flexible(child: Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.bodySmall?.copyWith(color: muted))),
                if (o.isPureVeg) ...[const SizedBox(width: 6), const VegMark(veg: true, size: 13)],
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Horizontal rail of compact outlet cards.
class OutletRail extends StatelessWidget {
  const OutletRail({super.key, required this.title, required this.outlets, this.hint});

  final String title;
  final String? hint;
  final List<OutletSummary> outlets;

  @override
  Widget build(BuildContext context) {
    if (outlets.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionTitle(title, hint: hint),
      SizedBox(
        height: 236,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: outlets.length,
          separatorBuilder: (_, _) => const SizedBox(width: 14),
          itemBuilder: (context, i) => SizedBox(width: 220, child: OutletCard(outlet: outlets[i], compact: true)),
        ),
      ),
    ]);
  }
}
