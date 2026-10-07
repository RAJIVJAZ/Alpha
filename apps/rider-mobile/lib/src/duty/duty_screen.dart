import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/widgets.dart';
import '../profile/profile.dart';
import 'duty_providers.dart';
import 'duty_repository.dart';
import 'widgets/active_delivery_card.dart';
import 'widgets/offer_card.dart';
import 'widgets/online_card.dart';
import 'widgets/route_card.dart';

/// Home tab: go online, accept offers, work through active deliveries.
class DutyScreen extends ConsumerWidget {
  const DutyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    final p = profile.value;
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(p == null ? 'Duty' : 'Hi, ${p.firstName}'),
          if (p != null)
            Text(
              '${p.rating.toStringAsFixed(1)} ★ · ${number(p.totalDeliveries)} deliveries',
              semanticsLabel: 'Rating ${p.rating.toStringAsFixed(1)} stars, ${number(p.totalDeliveries)} deliveries',
              style: Theme.of(context).textTheme.bodySmall,
            ),
        ]),
        actions: [
          SignOutButton(
            beforeSignOut: () async {
              // best effort: leave the dispatch pool before handing the phone over
              final current = ref.read(profileProvider).value;
              if (current != null && current.isOnline && !current.isOnDelivery) await ref.read(dutyRepositoryProvider).goOffline();
            },
          ),
        ],
      ),
      body: AsyncView<RiderProfile>(
        value: profile,
        onRetry: () => ref.invalidate(profileProvider),
        data: (p) => _DutyBody(profile: p),
      ),
    );
  }
}

class _DutyBody extends ConsumerWidget {
  const _DutyBody({required this.profile});
  final RiderProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offers = ref.watch(offersProvider).value ?? const [];
    final current = ref.watch(currentDeliveriesProvider);
    final deliveries = current.value ?? const [];

    final children = <Widget>[
      OnlineCard(profile: profile),
      for (final o in offers) OfferCard(key: ValueKey('offer-${o.id}'), offer: o),
      if (deliveries.isNotEmpty)
        Semantics(header: true, child: Text(deliveries.length == 1 ? 'Active delivery' : 'Active deliveries (${deliveries.length})', style: Theme.of(context).textTheme.titleMedium)),
      for (final d in deliveries) ActiveDeliveryCard(key: ValueKey('delivery-${d.id}'), delivery: d),
      if (deliveries.isNotEmpty) const RouteCard(),
      if (current.hasError && !current.hasValue)
        Card(child: Padding(padding: const EdgeInsets.all(16), child: InlineError(error: current.error!, onRetry: () => ref.invalidate(currentDeliveriesProvider)))),
      if (current.isLoading && !current.hasValue) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
      if (current.hasValue && deliveries.isEmpty && offers.isEmpty)
        EmptyView(
          icon: profile.isOnline ? Icons.hourglass_empty : Icons.two_wheeler,
          title: profile.isOnline ? 'No orders right now' : 'Nothing assigned',
          message: profile.isOnline ? 'Stay near busy areas — the Demand tab shows hotspots.' : 'Go online to start receiving delivery offers.',
        ),
    ];

    return RefreshIndicator(
      onRefresh: () async {
        refreshDuty(ref.invalidate);
        await ref.read(currentDeliveriesProvider.future).catchError((_) => const <Never>[]);
      },
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: children.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (_, i) => children[i],
      ),
    );
  }
}
