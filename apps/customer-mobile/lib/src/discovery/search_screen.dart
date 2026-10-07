import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../common/widgets.dart';
import 'models.dart';
import 'outlet_card.dart';
import 'providers.dart';

/// Search with debounced live suggestions; submitting shows outlets and dishes.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key, this.query});

  /// The submitted search (from the route's `q`).
  final String? query;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

enum _Show { all, outlets, dishes }

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final _controller = TextEditingController(text: widget.query ?? '');
  final _focus = FocusNode();
  Timer? _debounce;
  String _typed = '';
  _Show _show = _Show.all;

  @override
  void initState() {
    super.initState();
    if ((widget.query ?? '').isEmpty) WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void didUpdateWidget(SearchScreen old) {
    super.didUpdateWidget(old);
    if (old.query != widget.query) {
      _controller.text = widget.query ?? '';
      _typed = '';
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () {
      if (mounted) setState(() => _typed = v.trim());
    });
  }

  void _submit(String q) {
    final query = q.trim();
    _debounce?.cancel();
    _focus.unfocus();
    setState(() => _typed = '');
    if (query.isEmpty) return;
    context.go(Uri(path: '/search', queryParameters: {'q': query}).toString());
  }

  @override
  Widget build(BuildContext context) {
    final submitted = (widget.query ?? '').trim();
    final suggesting = _typed.length >= 2 && _typed != submitted;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        title: TextField(
          controller: _controller,
          focusNode: _focus,
          textInputAction: TextInputAction.search,
          onChanged: _onChanged,
          onSubmitted: _submit,
          decoration: InputDecoration(
            hintText: 'Search for biryani, pizza, momos…',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: IconButton(
              tooltip: 'Clear search',
              icon: const Icon(Icons.close),
              onPressed: () {
                _controller.clear();
                setState(() => _typed = '');
                _focus.requestFocus();
              },
            ),
          ),
        ),
      ),
      body: suggesting
          ? _Suggestions(query: _typed, onSearch: _submit)
          : submitted.isEmpty
              ? const EmptyView(icon: Icons.search, title: 'Search FoodGrid', message: 'Find restaurants, food carts and dishes that deliver to you.')
              : _Results(query: submitted, show: _show, onShow: (s) => setState(() => _show = s)),
    );
  }
}

class _Suggestions extends ConsumerWidget {
  const _Suggestions({required this.query, required this.onSearch});
  final String query;
  final ValueChanged<String> onSearch;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(suggestionsProvider(query));
    final data = s.value;
    return ListView(children: [
      ListTile(leading: const Icon(Icons.search), title: Text('Search for “$query”'), onTap: () => onSearch(query)),
      if (data == null && s.isLoading) const LinearProgressIndicator(),
      if (data != null) ...[
        for (final o in data.outlets)
          ListTile(
            leading: Icon(o.type == 'FOOD_CART' ? Icons.storefront_outlined : Icons.restaurant_outlined),
            title: Text(o.name),
            subtitle: Text(o.type == 'FOOD_CART' ? 'Food cart' : 'Restaurant'),
            onTap: () => context.push('/outlets/${o.slug}'),
          ),
        for (final c in data.cuisines) ListTile(leading: const Icon(Icons.local_dining_outlined), title: Text(c), subtitle: const Text('Cuisine'), onTap: () => onSearch(c)),
        for (final d in data.dishes) ListTile(leading: const Icon(Icons.ramen_dining_outlined), title: Text(d), subtitle: const Text('Dish'), onTap: () => onSearch(d)),
      ],
    ]);
  }
}

class _Results extends ConsumerWidget {
  const _Results({required this.query, required this.show, required this.onShow});
  final String query;
  final _Show show;
  final ValueChanged<_Show> onShow;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final res = ref.watch(searchProvider(query));
    return AsyncView<SearchResult>(
      value: res,
      onRetry: () => ref.invalidate(searchProvider(query)),
      data: (r) {
        if (r.outlets.isEmpty && r.dishes.isEmpty) {
          return EmptyView(icon: Icons.search_off, title: 'No matches for “$query”', message: 'Check the spelling, or try a cuisine like “South Indian”.');
        }
        final text = Theme.of(context).textTheme;
        return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Wrap(spacing: 8, children: [
              for (final s in _Show.values)
                ChoiceChip(
                  label: Text(switch (s) { _Show.all => 'All', _Show.outlets => 'Restaurants', _Show.dishes => 'Dishes' }),
                  selected: show == s,
                  onSelected: (_) => onShow(s),
                ),
            ]),
          ),
          if (show != _Show.dishes && r.outlets.isNotEmpty) ...[
            const SectionTitle('Restaurants and food carts'),
            for (final o in r.outlets) Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 20), child: OutletCard(outlet: o)),
          ],
          if (show != _Show.outlets && r.dishes.isNotEmpty) ...[
            const SectionTitle('Dishes'),
            for (final d in r.dishes)
              Opacity(
                opacity: d.outlet.isOpen ? 1 : 0.6,
                child: ListTile(
                  leading: FoodImage(url: d.imageUrl, width: 56, height: 56, radius: 10),
                  title: Row(children: [VegMark(veg: d.isVeg, size: 14), const SizedBox(width: 6), Expanded(child: Text(d.name, overflow: TextOverflow.ellipsis))]),
                  subtitle: Text('${money(d.price, whole: true)} · ${d.outlet.name} · ${d.outlet.etaMins} min${d.outlet.isOpen ? '' : ' · closed now'}', style: text.bodySmall),
                  onTap: () {
                    if (d.outlet.sponsored) reportAdClick(ref.read(apiClientProvider), d.outlet.adCampaignId);
                    context.push('/outlets/${d.outlet.slug}');
                  },
                ),
              ),
          ],
        ]);
      },
    );
  }
}
