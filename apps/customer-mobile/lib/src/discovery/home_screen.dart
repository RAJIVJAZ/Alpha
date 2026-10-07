import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../cart/cart_button.dart';
import '../cart/cart_controller.dart';
import '../common/links.dart';
import '../common/widgets.dart';
import '../location/location_sheet.dart';
import '../location/place.dart';
import 'models.dart';
import 'outlet_card.dart';
import 'providers.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  bool _onScroll(ScrollNotification n) {
    // infinite scroll: fetch the next page well before the end
    if (n.metrics.axis == Axis.vertical && n.metrics.extentAfter < 900) {
      ref.read(nearbyProvider.notifier).loadMore();
    }
    return false;
  }

  Future<void> _refresh() async {
    ref.invalidate(bannersProvider);
    ref.invalidate(homeFeedProvider);
    ref.invalidate(nearbyProvider);
    await ref.read(nearbyProvider.future).catchError((_) => const NearbyList(items: [], page: 1, totalPages: 1, total: 0));
  }

  @override
  Widget build(BuildContext context) {
    final nearby = ref.watch(nearbyProvider);
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: NotificationListener<ScrollNotification>(
          onNotification: _onScroll,
          child: CustomScrollView(
            key: const PageStorageKey('home'),
            slivers: [
              SliverAppBar(
                floating: true,
                snap: true,
                titleSpacing: 12,
                title: const LocationButton(),
                actions: [
                  IconButton(tooltip: 'Scan a table QR code', onPressed: () => context.push('/scan'), icon: const Icon(Icons.qr_code_scanner)),
                  const NotificationsButton(),
                  const CartButton(),
                ],
              ),
              const SliverToBoxAdapter(child: _SearchEntry()),
              const SliverToBoxAdapter(child: _Banners()),
              const SliverToBoxAdapter(child: _ReorderRail()),
              const SliverToBoxAdapter(child: _Rails()),
              const SliverToBoxAdapter(child: _NearbyHeader()),
              ..._nearbySlivers(context, nearby),
              const SliverToBoxAdapter(child: SizedBox(height: 24)),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _nearbySlivers(BuildContext context, AsyncValue<NearbyList> nearby) {
    final list = nearby.value;
    if (list == null) {
      if (nearby.hasError) {
        return [SliverToBoxAdapter(child: ErrorView(error: nearby.error!, onRetry: () => ref.invalidate(nearbyProvider)))];
      }
      return [const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator())))];
    }
    if (list.items.isEmpty) {
      final place = ref.read(placeProvider);
      return [
        SliverToBoxAdapter(
          child: EmptyView(
            icon: Icons.storefront_outlined,
            title: 'Nothing matches these filters',
            message: 'Try removing a filter, or pick another area than ${place.shortLabel}.',
            action: OutlinedButton(onPressed: () => showLocationSheet(context), child: const Text('Change location')),
          ),
        ),
      ];
    }
    return [
      SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        sliver: SliverList.separated(
          itemCount: list.items.length,
          separatorBuilder: (_, _) => const SizedBox(height: 22),
          itemBuilder: (context, i) => OutletCard(outlet: list.items[i]),
        ),
      ),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Center(
            child: list.loadingMore
                ? const CircularProgressIndicator()
                : list.moreError != null
                    ? OutlinedButton.icon(onPressed: () => ref.read(nearbyProvider.notifier).loadMore(), icon: const Icon(Icons.refresh), label: const Text('Couldn\'t load more — try again'))
                    : list.hasMore
                        ? TextButton(onPressed: () => ref.read(nearbyProvider.notifier).loadMore(), child: const Text('Show more'))
                        : Text('That\'s everything near you', style: Theme.of(context).textTheme.bodySmall),
          ),
        ),
      ),
    ];
  }
}

class _SearchEntry extends StatelessWidget {
  const _SearchEntry();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Semantics(
        button: true,
        label: 'Search for restaurants, food carts and dishes',
        excludeSemantics: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => context.go('/search'),
          child: Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(border: Border.all(color: scheme.outlineVariant), borderRadius: BorderRadius.circular(12), color: scheme.surfaceContainerLow),
            child: Row(children: [
              Icon(Icons.search, color: scheme.onSurfaceVariant),
              const SizedBox(width: 10),
              Expanded(child: Text('Search for biryani, pizza, momos…', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: scheme.onSurfaceVariant))),
            ]),
          ),
        ),
      ),
    );
  }
}

const _bannerGradients = [
  [Color(0xFFEA580C), Color(0xFFBE123C)],
  [Color(0xFF047857), Color(0xFF134E4A)],
  [Color(0xFF4338CA), Color(0xFF0F172A)],
];

class _Banners extends ConsumerWidget {
  const _Banners();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // offers are a bonus: hide quietly when they can't load
    final banners = ref.watch(bannersProvider).value ?? const <HomeBanner>[];
    if (banners.isEmpty) return const SizedBox.shrink();
    final text = Theme.of(context).textTheme;
    return Semantics(
      container: true,
      label: 'Offers',
      child: SizedBox(
        height: 148,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          itemCount: banners.length,
          separatorBuilder: (_, _) => const SizedBox(width: 12),
          itemBuilder: (context, i) {
            final b = banners[i];
            return Semantics(
              button: true,
              label: [b.title, ?b.subtitle].join('. '),
              excludeSemantics: true,
              child: InkWell(
                key: Key('banner-${b.id}'),
                borderRadius: BorderRadius.circular(18),
                onTap: () => openLink(context, b.linkUrl),
                child: Container(
                  width: MediaQuery.sizeOf(context).width * 0.8,
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    gradient: LinearGradient(colors: _bannerGradients[i % _bannerGradients.length], begin: Alignment.topLeft, end: Alignment.bottomRight),
                  ),
                  child: Stack(fit: StackFit.expand, children: [
                    if (b.imageUrl != null)
                      Opacity(
                        opacity: 0.35,
                        child: Image.network(b.imageUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox.shrink()),
                      ),
                    Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(b.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: text.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                        if (b.subtitle != null) Text(b.subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.bodyMedium?.copyWith(color: Colors.white)),
                      ]),
                    ),
                  ]),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _ReorderRail extends ConsumerStatefulWidget {
  const _ReorderRail();

  @override
  ConsumerState<_ReorderRail> createState() => _ReorderRailState();
}

class _ReorderRailState extends ConsumerState<_ReorderRail> {
  String? _busy;

  Future<void> _reorder(ReorderSuggestion r) async {
    setState(() => _busy = r.orderId);
    try {
      final skipped = await ref.read(cartProvider.notifier).reorder(r.orderId);
      if (!mounted) return;
      if (skipped.isNotEmpty) showMessage(context, '${skipped.join(', ')} ${skipped.length == 1 ? 'is' : 'are'} unavailable right now');
      context.push('/cart');
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = ref.watch(sessionProvider).value != null;
    final items = ref.watch(homeFeedProvider).value?.reorder ?? const [];
    if (!signedIn || items.isEmpty) return const SizedBox.shrink();
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionTitle('Order again'),
      SizedBox(
        height: 104,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: items.length,
          separatorBuilder: (_, _) => const SizedBox(width: 12),
          itemBuilder: (context, i) {
            final r = items[i];
            return SizedBox(
              width: 300,
              child: Card(
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => context.push('/outlets/${r.slug}'),
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Row(children: [
                      FoodImage(url: r.imageUrl, width: 64, height: 64),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                          Text(r.outletName, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.titleSmall),
                          Text(r.items.join(', '), maxLines: 1, overflow: TextOverflow.ellipsis, style: text.bodySmall?.copyWith(color: muted)),
                          Text('${money(r.total, whole: true)} · ${relative(r.lastAt)}', style: text.bodySmall?.copyWith(color: muted)),
                        ]),
                      ),
                      const SizedBox(width: 6),
                      OutlinedButton(
                        style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 12)),
                        onPressed: _busy == null ? () => _reorder(r) : null,
                        child: _busy == r.orderId ? const ButtonSpinner() : const Text('Reorder'),
                      ),
                    ]),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    ]);
  }
}

class _Rails extends ConsumerWidget {
  const _Rails();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(homeFeedProvider);
    final f = feed.value;
    if (f == null) {
      if (feed.hasError) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Notice(feed.error.toString(), tone: NoticeTone.critical, action: TextButton(onPressed: () => ref.invalidate(homeFeedProvider), child: const Text('Retry'))),
        );
      }
      return const SizedBox.shrink();
    }
    final signedIn = ref.watch(sessionProvider).value != null;
    final title = signedIn ? 'Recommended for you' : 'Popular near you';
    final reason = f.recommended.firstOrNull?.reasons.firstOrNull;
    // late at night only a few places are open; skip a rail that repeats one already shown
    final seen = <String>{};
    final rails = [
      (title: title, hint: reason != null && reason != title ? reason : null, outlets: f.recommended),
      (title: 'Top rated', hint: null, outlets: f.topRated),
      (title: 'Fastest delivery', hint: null, outlets: f.fastDelivery),
    ].where((r) {
      final key = r.outlets.map((o) => o.id).join(',');
      return key.isNotEmpty && seen.add(key);
    });
    return Column(children: [for (final r in rails) OutletRail(title: r.title, hint: r.hint, outlets: r.outlets)]);
  }
}

class _NearbyHeader extends ConsumerWidget {
  const _NearbyHeader();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final f = ref.watch(nearbyFiltersProvider);
    final total = ref.watch(nearbyProvider).value?.total;
    final place = ref.watch(placeProvider);
    final filters = ref.read(nearbyFiltersProvider.notifier);
    Widget chip(String label, bool on, NearbyFilters Function(NearbyFilters) toggle) => Padding(
          padding: const EdgeInsets.only(right: 8),
          child: FilterChip(label: Text(label), selected: on, onSelected: (_) => filters.update(toggle)),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionTitle(
        'Restaurants and food carts near you',
        hint: total == null ? null : '$total place${total == 1 ? '' : 's'} deliver to ${place.shortLabel}',
        trailing: PopupMenuButton<OutletSort>(
          tooltip: 'Sort by: ${f.sort.label}',
          initialValue: f.sort,
          onSelected: (s) => filters.update((x) => x.copyWith(sort: s)),
          itemBuilder: (_) => [for (final s in OutletSort.values) CheckedPopupMenuItem(value: s, checked: s == f.sort, child: Text(s.label))],
          icon: const Icon(Icons.sort),
        ),
      ),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 0, 8, 12),
        child: Row(children: [
          chip('Restaurants', f.type == 'RESTAURANT', (x) => x.copyWith(type: () => x.type == 'RESTAURANT' ? null : 'RESTAURANT')),
          chip('Food carts', f.type == 'FOOD_CART', (x) => x.copyWith(type: () => x.type == 'FOOD_CART' ? null : 'FOOD_CART')),
          chip('Pure veg', f.veg, (x) => x.copyWith(veg: !x.veg)),
          chip('Rated 4.0+', f.rated, (x) => x.copyWith(rated: !x.rated)),
          chip('Open now', f.openNow, (x) => x.copyWith(openNow: !x.openNow)),
        ]),
      ),
    ]);
  }
}
