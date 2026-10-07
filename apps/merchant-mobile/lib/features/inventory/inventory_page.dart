import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/errors.dart';
import '../../core/json.dart';
import '../../core/permissions.dart';
import '../../core/ui.dart';
import '../outlets/outlet_providers.dart';
import 'inventory_models.dart';
import 'inventory_providers.dart';

/// Stock levels for the outlet with low-stock alerts, category chips and
/// quick receive / wastage / stock-count actions.
class InventoryPage extends ConsumerStatefulWidget {
  const InventoryPage({super.key});

  @override
  ConsumerState<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends ConsumerState<InventoryPage> {
  String? _category;
  String? _status;
  String _q = '';
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  StockFilter get _filter => (category: _category, status: _status, q: _q);

  void _refresh() {
    ref.invalidate(inventorySummaryProvider);
    ref.invalidate(ingredientsProvider(_filter));
  }

  @override
  Widget build(BuildContext context) {
    final summary = ref.watch(inventorySummaryProvider);
    final list = ref.watch(ingredientsProvider(_filter));
    final canManage = ref.watch(permissionsProvider).can(Perm.inventoryManage);
    final s = summary.value;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Inventory'),
        actions: [IconButton(tooltip: 'Refresh stock', icon: const Icon(Icons.refresh), onPressed: _refresh)],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          _refresh();
          await ref.read(ingredientsProvider(_filter).future);
        },
        child: CustomScrollView(slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (summary.hasError && s == null) StaleBanner(error: summary.error!, onRetry: () => ref.invalidate(inventorySummaryProvider)),
                Row(children: [
                  Expanded(child: KpiTile(label: 'Stock value', value: s == null ? '—' : moneyCompact(s.totalValue), hint: s == null ? null : '${s.totalItems} ingredients')),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _AlertTile(
                      label: 'Low stock',
                      count: s?.lowStock,
                      icon: Icons.trending_down,
                      selected: _status == 'LOW',
                      onTap: () => setState(() => _status = _status == 'LOW' ? null : 'LOW'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _AlertTile(
                      label: 'Out of stock',
                      count: s?.outOfStock,
                      icon: Icons.remove_shopping_cart_outlined,
                      critical: true,
                      selected: _status == 'OUT',
                      onTap: () => setState(() => _status = _status == 'OUT' ? null : 'OUT'),
                    ),
                  ),
                ]),
                if (s != null && s.expiringSoon.isNotEmpty) _Expiring(batches: s.expiringSoon),
                const SizedBox(height: 12),
                TextField(
                  controller: _search,
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search ingredients or SKU'),
                  textInputAction: TextInputAction.search,
                  onSubmitted: (v) => setState(() => _q = v.trim()),
                ),
                const SizedBox(height: 8),
              ]),
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 48,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  for (final c in [null, ...inventoryChips])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(label: Text(c == null ? 'All' : humanize(c)), selected: _category == c, onSelected: (_) => setState(() => _category = c)),
                    ),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Wrap(spacing: 8, children: [
                for (final (value, label) in const [(null, 'Any status'), ('LOW', 'Low'), ('OUT', 'Out'), ('OK', 'OK')])
                  FilterChip(label: Text(label), selected: _status == value, onSelected: (_) => setState(() => _status = value)),
              ]),
            ),
          ),
          AsyncView.sliver(
            value: list,
            onRetry: _refresh,
            data: (value) => value.isEmpty
                ? const SliverFillRemaining(hasScrollBody: false, child: EmptyView(icon: Icons.inventory_2_outlined, title: 'No ingredients match', message: 'Try another category or status.'))
                : SliverPadding(
                    padding: const EdgeInsets.only(bottom: 24),
                    sliver: SliverList.separated(
                      itemCount: value.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (_, i) => _IngredientTile(ingredient: value[i], canManage: canManage, onChanged: _refresh),
                    ),
                  ),
          ),
        ]),
      ),
    );
  }
}

class _AlertTile extends StatelessWidget {
  const _AlertTile({required this.label, required this.count, required this.icon, required this.selected, required this.onTap, this.critical = false});
  final String label;
  final int? count;
  final IconData icon;
  final bool selected;
  final bool critical;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final alert = (count ?? 0) > 0;
    final color = alert ? (critical ? FoodGridTheme.critical : FoodGridTheme.warning) : scheme.outline;
    return Semantics(
      button: true,
      selected: selected,
      label: '$label: ${count ?? 'loading'}. ${selected ? 'Showing only these' : 'Show only these'}',
      excludeSemantics: true,
      child: Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: selected ? scheme.primary : color.withValues(alpha: 0.6), width: selected ? 2 : 1)),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(icon, size: 16, color: alert ? color : scheme.onSurfaceVariant),
                const SizedBox(width: 4),
                Flexible(child: Text(label, style: Theme.of(context).textTheme.labelMedium, overflow: TextOverflow.ellipsis)),
              ]),
              const SizedBox(height: 4),
              Text(count?.toString() ?? '—', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Expiring extends StatelessWidget {
  const _Expiring({required this.batches});
  final List<ExpiringBatch> batches;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(top: 8),
        child: ExpansionTile(
          leading: const Icon(Icons.event_busy_outlined),
          title: Text('${batches.length} batch${batches.length == 1 ? '' : 'es'} expiring soon'),
          shape: const Border(),
          children: [
            for (final b in batches)
              ListTile(
                dense: true,
                title: Text('${b.ingredient} · ${qty(b.remainingQty, b.unit)}'),
                trailing: Text('${dateTime(b.expiresAt)} · ${money(b.value, whole: true)}'),
              ),
          ],
        ),
      );
}

class _IngredientTile extends ConsumerWidget {
  const _IngredientTile({required this.ingredient, required this.canManage, required this.onChanged});
  final Ingredient ingredient;
  final bool canManage;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final i = ingredient;
    final (status, label) = i.chip;
    return ListTile(
      title: Text(i.name, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text('${humanize(i.category)} · reorder at ${qty(i.reorderLevel, i.unit)}'),
      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text(qty(i.currentStock, i.unit), style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 2),
        StatusChip(status, label: label),
      ]),
      onTap: canManage
          ? () async {
              final action = await showModalBottomSheet<StockAction>(
                context: context,
                showDragHandle: true,
                builder: (context) => SafeArea(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    ListTile(title: Text(i.name, style: Theme.of(context).textTheme.titleLarge), subtitle: Text('In stock: ${qty(i.currentStock, i.unit)}')),
                    ListTile(leading: const Icon(Icons.move_to_inbox_outlined), title: const Text('Receive stock'), onTap: () => Navigator.pop(context, StockAction.receive)),
                    ListTile(leading: const Icon(Icons.delete_outline), title: const Text('Record wastage'), onTap: () => Navigator.pop(context, StockAction.wastage)),
                    ListTile(leading: const Icon(Icons.fact_check_outlined), title: const Text('Stock count'), onTap: () => Navigator.pop(context, StockAction.count)),
                  ]),
                ),
              );
              if (action == null || !context.mounted) return;
              final saved = await showModalBottomSheet<bool>(
                context: context,
                isScrollControlled: true,
                showDragHandle: true,
                builder: (_) => StockActionSheet(action: action, ingredient: i),
              );
              if (saved == true) onChanged();
            }
          : null,
    );
  }
}

/// Quantity (+ cost for receipts) and a reason, then the matching POST.
class StockActionSheet extends ConsumerStatefulWidget {
  const StockActionSheet({super.key, required this.action, required this.ingredient});
  final StockAction action;
  final Ingredient ingredient;

  @override
  ConsumerState<StockActionSheet> createState() => _StockActionSheetState();
}

class _StockActionSheetState extends ConsumerState<StockActionSheet> {
  late final _qty = TextEditingController(text: widget.action == StockAction.count ? _plain(widget.ingredient.currentStock) : '');
  late final _cost = TextEditingController(text: widget.ingredient.avgUnitCost.toStringAsFixed(2));
  late final _reason = TextEditingController(text: switch (widget.action) {
    StockAction.wastage => 'Spoiled',
    StockAction.count => 'Daily stock count',
    StockAction.receive => '',
  });
  bool _busy = false;

  static String _plain(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toString();

  @override
  void dispose() {
    _qty.dispose();
    _cost.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final quantity = double.tryParse(_qty.text.trim());
    final cost = double.tryParse(_cost.text.trim());
    if (quantity == null || quantity < 0 || (widget.action != StockAction.count && quantity == 0)) {
      showError(context, 'Enter a quantity');
      return;
    }
    if (widget.action != StockAction.receive && _reason.text.trim().isEmpty) {
      showError(context, 'Enter a reason');
      return;
    }
    final outletId = ref.read(currentOutletIdProvider);
    if (outletId == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(inventoryRepositoryProvider).submit(
            widget.action,
            outletId: outletId,
            ingredient: widget.ingredient,
            quantity: quantity,
            unitCost: cost,
            reason: _reason.text.trim().isEmpty ? null : _reason.text.trim(),
          );
      if (!mounted) return;
      showMessage(context, '${widget.action.done}: ${widget.ingredient.name}');
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final i = widget.ingredient;
    final unit = i.unit.toLowerCase();
    final decimal = [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))];
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('${widget.action.title}: ${i.name}', style: Theme.of(context).textTheme.titleLarge),
        Text('Currently ${qty(i.currentStock, i.unit)} in stock', style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 16),
        TextField(
          controller: _qty,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: decimal,
          decoration: InputDecoration(labelText: widget.action == StockAction.count ? 'Counted quantity ($unit)' : 'Quantity ($unit)'),
        ),
        if (widget.action == StockAction.receive) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _cost,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: decimal,
            decoration: InputDecoration(labelText: 'Cost per $unit (₹, before GST)', prefixText: '₹ '),
          ),
        ],
        const SizedBox(height: 12),
        TextField(controller: _reason, decoration: InputDecoration(labelText: widget.action == StockAction.receive ? 'Note (optional)' : 'Reason')),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save'),
        ),
      ]),
    );
  }
}
