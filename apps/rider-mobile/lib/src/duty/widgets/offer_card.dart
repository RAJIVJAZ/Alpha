import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../common/errors.dart';
import '../../common/widgets.dart';
import '../duty_providers.dart';
import '../duty_repository.dart';
import '../models.dart';

const rejectReasons = ['Too far', 'Vehicle issue', 'On a break', 'Unsafe area', 'Other'];

/// A new order offer with a countdown; accept or reject before it expires.
class OfferCard extends ConsumerStatefulWidget {
  const OfferCard({super.key, required this.offer});
  final Offer offer;

  @override
  ConsumerState<OfferCard> createState() => _OfferCardState();
}

class _OfferCardState extends ConsumerState<OfferCard> {
  Timer? _tick;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
      if (widget.offer.timeLeft() == Duration.zero) {
        _tick?.cancel();
        ref.invalidate(offersProvider);
      }
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _accept() async {
    final o = widget.offer;
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await container.read(dutyRepositoryProvider).acceptOffer(o.id);
      toast(messenger, 'Order ${o.orderNumber} is yours — head to ${o.pickupName}');
    } catch (e) {
      toast(messenger, riderMessage(e));
    } finally {
      refreshDuty(container.invalidate);
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reject() async {
    final reason = await showModalBottomSheet<String>(context: context, showDragHandle: true, builder: (_) => const _RejectSheet());
    if (reason == null || !mounted) return;
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await container.read(dutyRepositoryProvider).rejectOffer(widget.offer.id, reason);
      toast(messenger, 'Offer rejected');
    } catch (e) {
      toast(messenger, riderMessage(e));
    } finally {
      container.invalidate(offersProvider);
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offer;
    final left = o.timeLeft().inSeconds;
    if (left <= 0) return const SizedBox.shrink();
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final urgent = left <= 10;

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: scheme.primary, width: 2)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('New order', style: text.labelLarge?.copyWith(color: scheme.primary)),
                Text('Earn ${money(o.estimatedEarning)}', style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
              ]),
            ),
            Semantics(
              container: true,
              label: '$left seconds left to accept',
              excludeSemantics: true,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: (urgent ? scheme.error : scheme.primary).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.timer_outlined, size: 18, color: urgent ? scheme.error : scheme.primary),
                  const SizedBox(width: 4),
                  Text('${left}s', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700, fontFeatures: const [FontFeature.tabularFigures()])),
                ]),
              ),
            ),
          ]),
          const SizedBox(height: 12),
          _Leg(
            icon: Icons.storefront_outlined,
            title: o.pickupName,
            subtitle: o.pickupAddress,
            meta: '${o.distanceToPickupKm.toStringAsFixed(1)} km to pickup',
          ),
          const SizedBox(height: 10),
          _Leg(
            icon: Icons.location_on_outlined,
            title: o.dropAddress,
            meta: [
              '${o.distanceKm.toStringAsFixed(1)} km trip',
              if (o.isCod) 'collect ${money(o.codAmount)} cash',
            ].join(' · '),
          ),
          if (o.isCod) ...[
            const SizedBox(height: 10),
            const StatusChip('COD', label: 'Cash on delivery', tone: Tone.warning),
          ],
          const SizedBox(height: 16),
          Row(children: [
            Expanded(
              child: SizedBox(
                height: 56,
                child: OutlinedButton.icon(onPressed: _busy ? null : _reject, icon: const Icon(Icons.close), label: const Text('Reject')),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: SizedBox(
                height: 56,
                child: FilledButton.icon(
                  onPressed: _busy ? null : _accept,
                  icon: _busy ? const ButtonSpinner(color: Colors.white) : const Icon(Icons.check),
                  label: const Text('Accept'),
                ),
              ),
            ),
          ]),
        ]),
      ),
    );
  }
}

class _Leg extends StatelessWidget {
  const _Leg({required this.icon, required this.title, this.subtitle, this.meta});
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? meta;

  @override
  Widget build(BuildContext context) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(top: 2), child: ExcludeSemantics(child: Icon(icon, size: 20, color: Theme.of(context).colorScheme.onSurfaceVariant))),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: Theme.of(context).textTheme.titleSmall),
            if (subtitle != null && subtitle!.isNotEmpty) Caption(subtitle!),
            if (meta != null) Text(meta!, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
          ]),
        ),
      ]);
}

class _RejectSheet extends StatefulWidget {
  const _RejectSheet();
  @override
  State<_RejectSheet> createState() => _RejectSheetState();
}

class _RejectSheetState extends State<_RejectSheet> {
  String _reason = rejectReasons.first;

  @override
  Widget build(BuildContext context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Reject this order?', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            const Caption('Rejections lower your acceptance rate, which dispatch uses when offering orders.'),
            const SizedBox(height: 8),
            RadioGroup<String>(
              groupValue: _reason,
              onChanged: (v) => setState(() => _reason = v ?? _reason),
              child: Column(children: [for (final r in rejectReasons) RadioListTile<String>(value: r, title: Text(r), contentPadding: EdgeInsets.zero)]),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 56,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error, foregroundColor: Theme.of(context).colorScheme.onError),
                onPressed: () => Navigator.pop(context, _reason),
                child: const Text('Reject order'),
              ),
            ),
          ]),
        ),
      );
}
