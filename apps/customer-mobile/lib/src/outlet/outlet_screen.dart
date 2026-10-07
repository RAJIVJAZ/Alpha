import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../app/sign_in_screen.dart';
import '../cart/cart_button.dart';
import '../cart/cart_controller.dart';
import '../cart/models.dart';
import '../common/hours.dart';
import '../common/links.dart';
import '../common/widgets.dart';
import '../location/place.dart';
import '../meal_plans/subscribe_sheet.dart';
import 'add_to_cart.dart';
import 'customise_sheet.dart';
import 'models.dart';
import 'providers.dart';

/// Restaurant / food cart page: menu, offers, reviews, meal plans and info.
class OutletScreen extends ConsumerWidget {
  const OutletScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final menu = ref.watch(menuProvider(slug));
    final m = menu.value;
    if (m == null) {
      return Scaffold(
        appBar: AppBar(),
        body: menu.hasError
            ? (menu.error is ApiException && (menu.error as ApiException).status == 404)
                ? EmptyView(
                    icon: Icons.storefront_outlined,
                    title: "We couldn't find this place",
                    message: 'It may have closed on FoodGrid.',
                    action: OutlinedButton(onPressed: () => context.go('/'), child: const Text('Back to home')),
                  )
                : ErrorView(error: menu.error!, onRetry: () => ref.invalidate(menuProvider(slug)))
            : const Center(child: CircularProgressIndicator()),
      );
    }
    return _OutletBody(menu: m);
  }
}

class _OutletBody extends ConsumerWidget {
  const _OutletBody({required this.menu});
  final Menu menu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = menu.outlet;
    final plans = ref.watch(mealPlansProvider(o.id)).value ?? const <SubscriptionPlan>[];
    final tabs = ['Menu', 'Reviews', if (plans.isNotEmpty) 'Meal plans', 'Info'];
    return DefaultTabController(
      length: tabs.length,
      child: Scaffold(
        appBar: AppBar(
          title: Text(o.name, overflow: TextOverflow.ellipsis),
          actions: [
            if (o.phone != null) IconButton(tooltip: 'Call ${o.name}', onPressed: () => callPhone(o.phone!), icon: const Icon(Icons.call_outlined)),
            const CartButton(),
          ],
          bottom: TabBar(isScrollable: tabs.length > 3, tabAlignment: tabs.length > 3 ? TabAlignment.start : null, tabs: [for (final t in tabs) Tab(text: t)]),
        ),
        body: TabBarView(children: [
          _MenuTab(menu: menu),
          _ReviewsTab(outlet: o),
          if (plans.isNotEmpty) _PlansTab(outlet: o, plans: plans),
          _InfoTab(outlet: o),
        ]),
        bottomNavigationBar: _CartBar(outletId: o.id),
      ),
    );
  }
}

/// "View cart" bar while the cart holds this outlet's dishes.
class _CartBar extends ConsumerWidget {
  const _CartBar({required this.outletId});
  final String outletId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider).value;
    if (cart == null || cart.isEmpty || cart.outletId != outletId) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
        child: Material(
          color: scheme.primary,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            key: const Key('view-cart'),
            borderRadius: BorderRadius.circular(14),
            onTap: () => context.push('/cart'),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                    Text('${cart.count} item${cart.count == 1 ? '' : 's'} · ${money(cart.itemsTotal, whole: true)}', style: text.titleSmall?.copyWith(color: scheme.onPrimary)),
                    Text('Taxes and delivery added at checkout', style: text.bodySmall?.copyWith(color: scheme.onPrimary)),
                  ]),
                ),
                Text('View cart', style: text.titleSmall?.copyWith(color: scheme.onPrimary)),
                Icon(Icons.arrow_forward, color: scheme.onPrimary, size: 18),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _MenuTab extends ConsumerStatefulWidget {
  const _MenuTab({required this.menu});
  final Menu menu;

  @override
  ConsumerState<_MenuTab> createState() => _MenuTabState();
}

class _MenuTabState extends ConsumerState<_MenuTab> with AutomaticKeepAliveClientMixin {
  bool _vegOnly = false;
  String _q = '';
  final _sectionKeys = <String, GlobalKey>{};

  @override
  bool get wantKeepAlive => true;

  OutletDetail get outlet => widget.menu.outlet;

  bool _show(MenuItem i) {
    final needle = _q.trim().toLowerCase();
    return (!_vegOnly || i.isVeg) && (needle.isEmpty || i.name.toLowerCase().contains(needle) || (i.description ?? '').toLowerCase().contains(needle));
  }

  Future<void> onAdd(MenuItem item) async {
    if (ref.read(sessionProvider).value == null) return signInFirst(context);
    if (item.customisable) {
      // not awaited: the sheet adds (and closes) by itself
      showCustomiseSheet(context, item, (line) => addToCart(context, ref, line));
      return;
    }
    await addToCart(context, ref, AddLine(menuItemId: item.id, variantId: item.defaultVariant?.id));
  }

  void _jumpTo(String id) {
    final ctx = _sectionKeys[id]?.currentContext;
    if (ctx != null) Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 300), alignment: 0.02);
  }

  Future<void> _showSections(List<({String id, String name, int count})> sections) => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (sheet) => SafeArea(
          child: ListView(shrinkWrap: true, children: [
            for (final s in sections)
              ListTile(
                title: Text(s.name),
                trailing: Text('${s.count}'),
                onTap: () {
                  Navigator.of(sheet).pop();
                  WidgetsBinding.instance.addPostFrameCallback((_) => _jumpTo(s.id));
                },
              ),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final o = outlet;
    final cart = ref.watch(cartProvider).value;
    final mine = cart != null && cart.outletId == o.id ? cart : null;
    final recommended = widget.menu.recommended.where(_show).toList();
    final categories = [
      for (final c in widget.menu.categories)
        if (c.items.any(_show)) (category: c, items: c.items.where(_show).toList()),
    ];
    final sections = [
      if (recommended.isNotEmpty) (id: 'recommended', name: 'Recommended', count: recommended.length),
      for (final c in categories) (id: c.category.id, name: c.category.name, count: c.items.length),
    ];
    GlobalKey keyFor(String id) => _sectionKeys.putIfAbsent(id, GlobalKey.new);

    Widget section(String id, String title, List<MenuItem> items, String prefix) => Column(
          key: keyFor(id),
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionTitle(title, hint: '${items.length} item${items.length == 1 ? '' : 's'}'),
            for (final (i, item) in items.indexed) ...[
              if (i > 0) const Divider(indent: 16, endIndent: 16, height: 1),
              _ItemRow(key: Key('$prefix-${item.id}'), item: item, cart: mine, open: o.isOpenNow, onAdd: onAdd),
            ],
          ],
        );

    return Stack(children: [
      ListView(padding: const EdgeInsets.only(bottom: 96), children: [
        _OutletHeader(outlet: o),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(children: [
            Expanded(
              child: TextField(
                onChanged: (v) => setState(() => _q = v),
                decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: 'Search in ${o.name.split(' - ').first}'),
              ),
            ),
            if (!o.isPureVeg) ...[
              const SizedBox(width: 8),
              const VegMark(veg: true),
              const SizedBox(width: 4),
              Text('Veg only', style: Theme.of(context).textTheme.labelLarge),
              Switch(key: const Key('veg-only'), value: _vegOnly, onChanged: (v) => setState(() => _vegOnly = v)),
            ],
          ]),
        ),
        if (mine != null && mine.lines.isNotEmpty) _GoesWellWith(menu: widget.menu, cart: mine, onAdd: onAdd),
        if (recommended.isNotEmpty) section('recommended', 'Recommended', recommended, 'rec'),
        for (final c in categories) section(c.category.id, c.category.name, c.items, 'item'),
        if (sections.isEmpty) const EmptyView(icon: Icons.no_food_outlined, title: 'No dishes match', message: 'Clear the search or the veg filter.'),
      ]),
      if (sections.length > 1)
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton.extended(
            heroTag: null,
            onPressed: () => _showSections(sections),
            icon: const Icon(Icons.menu_book_outlined),
            label: const Text('Menu'),
            tooltip: 'Jump to a menu section',
          ),
        ),
    ]);
  }
}

class _OutletHeader extends ConsumerWidget {
  const _OutletHeader({required this.outlet});
  final OutletDetail outlet;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = outlet;
    final place = ref.watch(placeProvider);
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final coupons = (ref.watch(outletCouponsProvider(o.id)).value ?? const <Coupon>[]).where((c) => c.eligible).toList();
    final km = distanceKm(place.lat, place.lng, o.lat, o.lng);
    Widget meta(IconData icon, String label) => Row(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 16, color: muted), const SizedBox(width: 4), Text(label, style: text.bodySmall?.copyWith(color: muted))]);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        AspectRatio(aspectRatio: 21 / 8, child: FoodImage(url: o.coverImageUrl, radius: 16, icon: o.isFoodCart ? Icons.storefront : Icons.restaurant)),
        const SizedBox(height: 12),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Semantics(header: true, child: Text(o.name, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700))),
              Text('${o.isFoodCart ? 'Food cart · ' : ''}${o.cuisines.join(', ')}', style: text.bodyMedium?.copyWith(color: muted)),
            ]),
          ),
          RatingPill(value: o.ratingAvg, count: o.ratingCount),
        ]),
        const SizedBox(height: 8),
        Wrap(spacing: 14, runSpacing: 4, children: [
          meta(Icons.place_outlined, '${o.addressLine2 ?? o.city} · ${km.toStringAsFixed(1)} km away'),
          meta(Icons.timer_outlined, 'Ready in ~${o.avgPrepTimeMins} min'),
          meta(Icons.currency_rupee, '${money(o.costForTwo, whole: true)} for two'),
          if (o.isPureVeg) Row(mainAxisSize: MainAxisSize.min, children: [const VegMark(veg: true, size: 14), const SizedBox(width: 4), Text('Pure veg', style: text.bodySmall)]),
        ]),
        if (o.isMobile) const Padding(padding: EdgeInsets.only(top: 10), child: Notice('Moves around — live location shown at checkout.', tone: NoticeTone.info)),
        if (!o.isOpenNow)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Notice(
              '${o.opensAt == null ? '' : '${o.opensAt}. '}You can browse the menu; ordering opens when the kitchen does.',
              title: 'Closed now',
            ),
          ),
        if (coupons.isNotEmpty) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 64,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: coupons.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, i) {
                final c = coupons[i];
                return Container(
                  width: 240,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border.all(color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.5)),
                    borderRadius: BorderRadius.circular(12),
                    color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.35),
                  ),
                  child: Row(children: [
                    Icon(Icons.local_offer_outlined, color: Theme.of(context).colorScheme.primary),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                        Text(c.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.titleSmall),
                        Text('Use ${c.code}${c.minOrderValue > 0 ? ' · above ${money(c.minOrderValue, whole: true)}' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: text.bodySmall?.copyWith(color: muted)),
                      ]),
                    ),
                  ]),
                );
              },
            ),
          ),
        ],
      ]),
    );
  }
}

class _ItemRow extends ConsumerStatefulWidget {
  const _ItemRow({super.key, required this.item, required this.cart, required this.open, required this.onAdd});

  final MenuItem item;
  final Cart? cart;
  final bool open;
  final Future<void> Function(MenuItem) onAdd;

  @override
  ConsumerState<_ItemRow> createState() => _ItemRowState();
}

class _ItemRowState extends ConsumerState<_ItemRow> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() fn) async {
    setState(() => _busy = true);
    try {
      await fn();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _change(int n, int qty, List<CartLine> lines) async {
    if (n > qty) return _run(() => widget.onAdd(widget.item));
    if (lines.length > 1) return showMessage(context, 'This dish has different customisations in your cart — change them from the cart.');
    await _run(() => ref.read(cartProvider.notifier).setQuantity(lines.first.lineId, n));
  }

  @override
  Widget build(BuildContext context) {
    final i = widget.item;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final lines = (widget.cart?.lines ?? const <CartLine>[]).where((l) => l.menuItemId == i.id).toList();
    final qty = lines.fold(0, (s, l) => s + l.quantity);
    final Widget action;
    if (!i.isAvailable) {
      action = Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, border: Border.all(color: Theme.of(context).colorScheme.outlineVariant), borderRadius: BorderRadius.circular(10)),
        child: Text('Sold out', style: text.labelMedium),
      );
    } else if (qty > 0) {
      action = QtyStepper(value: qty, label: i.name, busy: _busy || !widget.open, onChanged: (n) => _change(n, qty, lines));
    } else {
      action = Tooltip(
        message: widget.open ? 'Add ${i.name}' : 'Ordering opens when the kitchen does',
        child: OutlinedButton(
          key: Key('add-${i.id}'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(96, 38),
            backgroundColor: Theme.of(context).colorScheme.surface,
            foregroundColor: Theme.of(context).colorScheme.primary,
            textStyle: const TextStyle(fontWeight: FontWeight.w700),
          ),
          onPressed: !widget.open || _busy ? null : () => _run(() => widget.onAdd(i)),
          child: _busy ? const ButtonSpinner() : Semantics(label: 'Add ${i.name}', excludeSemantics: true, child: const Text('ADD')),
        ),
      );
    }
    return Opacity(
      opacity: i.isAvailable ? 1 : 0.55,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                VegMark(veg: i.isVeg),
                if (i.bestseller) ...[
                  const SizedBox(width: 8),
                  Icon(Icons.star_rounded, size: 14, color: Theme.of(context).colorScheme.primary),
                  Text('Bestseller', style: text.labelSmall?.copyWith(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w600)),
                ],
                if ((i.spiceLevel ?? 0) >= 2) ...[
                  const SizedBox(width: 8),
                  Semantics(
                    label: 'Spice level ${i.spiceLevel} of 3',
                    child: ExcludeSemantics(child: Row(children: [for (var k = 0; k < i.spiceLevel!; k++) Icon(Icons.local_fire_department, size: 13, color: muted)])),
                  ),
                ],
              ]),
              const SizedBox(height: 4),
              Text(i.name, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, children: [
                Text(money(i.price, whole: true), style: text.bodyMedium),
                if ((i.compareAtPrice ?? 0) > i.price)
                  Text(money(i.compareAtPrice, whole: true), style: text.bodySmall?.copyWith(color: muted, decoration: TextDecoration.lineThrough)),
                if (i.customisable) Text('Customisable', style: text.labelSmall?.copyWith(color: muted)),
              ]),
              if (i.description != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(i.description!, maxLines: 2, overflow: TextOverflow.ellipsis, style: text.bodySmall?.copyWith(color: muted))),
            ]),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 112,
            child: Column(children: [
              FoodImage(url: i.imageUrl, width: 112, height: 96, icon: Icons.fastfood_outlined),
              Transform.translate(offset: const Offset(0, -16), child: action),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _GoesWellWith extends ConsumerWidget {
  const _GoesWellWith({required this.menu, required this.cart, required this.onAdd});
  final Menu menu;
  final Cart cart;
  final Future<void> Function(MenuItem) onAdd;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = menu.outlet;
    final ids = (cart.lines.map((l) => l.menuItemId).toSet().toList()..sort()).join(',');
    final inCart = cart.lines.map((l) => l.menuItemId).toSet();
    final pairs = (ref.watch(pairingsProvider((outletId: o.id, itemIds: ids))).value ?? const <MenuItem>[])
        .where((i) => !inCart.contains(i.id) && i.isAvailable)
        // older servers don't say whether a suggestion is customisable: use the menu's item
        .map((i) => i.customisableFlag == null ? menu.item(i.id) ?? i : i)
        .take(4)
        .toList();
    if (pairs.isEmpty) return const SizedBox.shrink();
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Semantics(header: true, child: Text('Goes well with your order', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
            for (final i in pairs)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: FoodImage(url: i.imageUrl, width: 44, height: 44, radius: 8),
                title: Row(children: [VegMark(veg: i.isVeg, size: 13), const SizedBox(width: 6), Expanded(child: Text(i.name, overflow: TextOverflow.ellipsis))]),
                subtitle: Text(money(i.price, whole: true)),
                trailing: OutlinedButton(
                  style: OutlinedButton.styleFrom(minimumSize: const Size(64, 36)),
                  // the customise sheet needs the variants and add-ons from the menu
                  onPressed: o.isOpenNow ? () => onAdd(i.customisable ? menu.item(i.id) ?? i : i) : null,
                  child: Semantics(label: 'Add ${i.name}', excludeSemantics: true, child: const Text('Add')),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}

class _ReviewsTab extends ConsumerStatefulWidget {
  const _ReviewsTab({required this.outlet});
  final OutletDetail outlet;

  @override
  ConsumerState<_ReviewsTab> createState() => _ReviewsTabState();
}

class _ReviewsTabState extends ConsumerState<_ReviewsTab> {
  int _page = 1;

  @override
  Widget build(BuildContext context) {
    final o = widget.outlet;
    final arg = (outletId: o.id, page: _page);
    final list = ref.watch(reviewsProvider(arg));
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return ListView(padding: const EdgeInsets.all(16), children: [
      Row(children: [
        Text(o.ratingAvg.toStringAsFixed(1), style: text.displaySmall?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(width: 6),
        const Icon(Icons.star_rounded, color: Color(0xFFE8A317)),
        const SizedBox(width: 10),
        Text('from ${o.ratingCount} ratings', style: text.bodyMedium?.copyWith(color: muted)),
      ]),
      const SizedBox(height: 12),
      AsyncView<ReviewsPage>(
        value: list,
        onRetry: () => ref.invalidate(reviewsProvider(arg)),
        data: (p) => p.items.isEmpty
            ? const EmptyView(icon: Icons.rate_review_outlined, title: 'No reviews yet')
            : Column(children: [
                for (final r in p.items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            RatingPill(value: r.rating.toDouble()),
                            const Spacer(),
                            Text(date(r.createdAt), style: text.bodySmall?.copyWith(color: muted)),
                          ]),
                          if (r.comment != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(r.comment!)),
                          if (r.tags.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Wrap(spacing: 6, runSpacing: 6, children: [for (final t in r.tags) Chip(label: Text(humanize(t.replaceAll('-', '_'))), visualDensity: VisualDensity.compact)]),
                            ),
                          if (r.reply != null)
                            Container(
                              margin: const EdgeInsets.only(top: 8),
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(10)),
                              child: Text.rich(TextSpan(children: [const TextSpan(text: 'Reply from the restaurant: ', style: TextStyle(fontWeight: FontWeight.w600)), TextSpan(text: r.reply)])),
                            ),
                        ]),
                      ),
                    ),
                  ),
                Pager(page: p.page, totalPages: p.totalPages, onPage: (n) => setState(() => _page = n)),
              ]),
      ),
    ]);
  }
}

class _PlansTab extends ConsumerWidget {
  const _PlansTab({required this.outlet, required this.plans});
  final OutletDetail outlet;
  final List<SubscriptionPlan> plans;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: plans.length,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (context, i) {
        final p = plans[i];
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Expanded(child: Text(p.name, style: text.titleMedium)), VegMark(veg: p.isVeg)]),
              if (p.description != null) Text(p.description!, style: text.bodyMedium?.copyWith(color: muted)),
              const SizedBox(height: 6),
              Text('${p.slotLabel} · ${p.daysOfWeek.map((d) => weekdays[d % 7]).join(', ')} · ${money(p.pricePerMeal, whole: true)} a meal', style: text.bodySmall),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: Text(money(p.totalPrice, whole: true), style: text.titleLarge?.copyWith(fontWeight: FontWeight.w700))),
                FilledButton(
                  onPressed: () => ref.read(sessionProvider).value == null ? signInFirst(context) : showSubscribeSheet(context, plan: p, outletName: outlet.name),
                  child: const Text('Subscribe'),
                ),
              ]),
            ]),
          ),
        );
      },
    );
  }
}

class _InfoTab extends StatelessWidget {
  const _InfoTab({required this.outlet});
  final OutletDetail outlet;

  @override
  Widget build(BuildContext context) {
    final o = outlet;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    Widget block(String title, Widget child) => Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Semantics(header: true, child: Text(title, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
            const SizedBox(height: 4),
            DefaultTextStyle.merge(style: TextStyle(color: muted), child: child),
          ]),
        );
    final modes = [if (o.acceptsDelivery) 'Delivery', if (o.acceptsTakeaway) 'Takeaway', if (o.acceptsQrOrders) 'Table QR ordering'].join(' · ');
    return ListView(padding: const EdgeInsets.all(16), children: [
      if (o.description != null) block('About', Text(o.description!)),
      block('Address', Text([o.addressLine1, ?o.addressLine2, '${o.city} ${o.pincode}'].join(', '))),
      block(
        'Opening hours (IST)',
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          for (final d in const [1, 2, 3, 4, 5, 6, 0])
            Text('${weekdays[d]}: ${o.openingHours.where((h) => h.day == d).map((h) => '${clock(h.open)} – ${clock(h.close)}').join(', ').ifEmpty('Closed')}'),
          if (!o.isOpenNow) Padding(padding: const EdgeInsets.only(top: 4), child: StatusChip('CLOSED', label: o.opensAt == null ? 'Closed now' : 'Closed now · ${o.opensAt}')),
        ]),
      ),
      block('Ordering', Text('${modes.isEmpty ? 'Dine-in only' : modes}${o.minOrderValue > 0 ? ' · minimum order ${money(o.minOrderValue, whole: true)}' : ''}')),
      block('Licences', Text([if (o.fssaiNumber != null) 'FSSAI ${o.fssaiNumber}', if (o.gstin != null) 'GSTIN ${o.gstin}'].join('\n').ifEmpty('—'))),
      if (o.phone != null) OutlinedButton.icon(onPressed: () => callPhone(o.phone!), icon: const Icon(Icons.call_outlined), label: Text('Call ${o.name.split(' - ').first}')),
    ]);
  }
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}
