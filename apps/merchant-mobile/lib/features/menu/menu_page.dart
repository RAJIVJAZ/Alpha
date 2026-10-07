import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/errors.dart';
import '../../core/permissions.dart';
import '../../core/ui.dart';
import 'menu_models.dart';
import 'menu_providers.dart';

/// Quick in / out of stock switches for the outlet's dishes, with search.
class MenuPage extends ConsumerStatefulWidget {
  const MenuPage({super.key});

  @override
  ConsumerState<MenuPage> createState() => _MenuPageState();
}

class _MenuPageState extends ConsumerState<MenuPage> {
  final _search = TextEditingController();
  String _q = '';
  bool _offOnly = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _set(List<String> ids, bool on, String what) async {
    try {
      await ref.read(menuProvider.notifier).setAvailability(ids, on);
      if (mounted) showMessage(context, '$what ${on ? 'back in stock' : 'marked out of stock'}');
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final menu = ref.watch(menuProvider);
    final canToggle = ref.watch(permissionsProvider).can(Perm.kdsOperate);
    final cats = menu.value ?? const <MenuCategory>[];
    final total = cats.fold(0, (s, c) => s + c.items.length);
    final off = cats.fold(0, (s, c) => s + c.items.where((i) => !i.isAvailable).length);

    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Menu'),
          if (menu.hasValue) Text('$total dishes · $off out of stock', style: Theme.of(context).textTheme.bodySmall),
        ]),
        actions: [IconButton(tooltip: 'Refresh menu', icon: const Icon(Icons.refresh), onPressed: () => ref.invalidate(menuProvider))],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: TextField(
            controller: _search,
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: 'Search dishes',
              suffixIcon: _q.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear search',
                      icon: const Icon(Icons.clear),
                      onPressed: () => setState(() {
                        _search.clear();
                        _q = '';
                      }),
                    ),
            ),
            onChanged: (v) => setState(() => _q = v.trim().toLowerCase()),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(children: [
            FilterChip(label: Text('Out of stock only ($off)'), selected: _offOnly, onSelected: (v) => setState(() => _offOnly = v)),
          ]),
        ),
        if (!canToggle) const Padding(padding: EdgeInsets.fromLTRB(12, 8, 12, 0), child: PermissionNote("Your role can view the menu but can't change stock.")),
        Expanded(
          child: AsyncView<List<MenuCategory>>(
            value: menu,
            onRetry: () => ref.invalidate(menuProvider),
            data: (cats) {
              if (cats.isEmpty) {
                return const EmptyView(icon: Icons.menu_book_outlined, title: 'No menu yet', message: 'Add categories and dishes from the web dashboard.');
              }
              final sections = [
                for (final c in cats)
                  (c, [for (final i in c.items) if ((_q.isEmpty || i.name.toLowerCase().contains(_q)) && (!_offOnly || !i.isAvailable)) i]),
              ].where((s) => s.$2.isNotEmpty).toList();
              if (sections.isEmpty) return const EmptyView(icon: Icons.search_off, title: 'No dishes match');
              return RefreshIndicator(
                onRefresh: () => ref.refresh(menuProvider.future),
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 24),
                  children: [
                    for (final (cat, items) in sections) ...[
                      SectionHeader(
                        cat.name,
                        count: cat.items.length,
                        trailing: canToggle
                            ? PopupMenuButton<bool>(
                                tooltip: 'Whole category',
                                icon: const Icon(Icons.more_vert),
                                onSelected: (on) => _set([for (final i in cat.items) i.id], on, cat.name),
                                itemBuilder: (_) => const [
                                  PopupMenuItem(value: true, child: Text('All in stock')),
                                  PopupMenuItem(value: false, child: Text('All out of stock')),
                                ],
                              )
                            : null,
                      ),
                      for (final item in items) _MenuRow(item: item, canToggle: canToggle, onChanged: (on) => _set([item.id], on, item.name)),
                    ],
                  ],
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({required this.item, required this.canToggle, required this.onChanged});
  final MenuItem item;
  final bool canToggle;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final status = item.isAvailable ? 'In stock' : 'Out of stock';
    final subtitle = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('${money(item.price, whole: true)} · ${humanize(item.kdsStation)} station', style: text.bodyMedium?.copyWith(color: muted)),
      const SizedBox(height: 4),
      Wrap(spacing: 6, children: [
        StatusChip(item.isAvailable ? 'IN_STOCK' : 'OUT_OF_STOCK', label: status),
        if (item.isRecommended) const StatusChip('BESTSELLER', label: 'Bestseller', tone: Tone.info),
      ]),
    ]);
    final title = Row(children: [
      VegMark(veg: item.isVeg),
      const SizedBox(width: 8),
      Expanded(child: Text(item.name, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600))),
    ]);
    if (!canToggle) return ListTile(title: title, subtitle: subtitle);
    return SwitchListTile(
      title: title,
      subtitle: subtitle,
      value: item.isAvailable,
      onChanged: onChanged,
    );
  }
}
