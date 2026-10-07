import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/errors.dart';
import '../../core/json.dart';
import '../../core/ui.dart';
import '../menu/menu_models.dart';
import '../menu/menu_providers.dart';
import '../orders/orders_board.dart';
import '../outlets/outlet_providers.dart';
import 'bill.dart';
import 'receipt_page.dart';

typedef DiningTable = ({String id, String label});

/// Active tables for dine-in counter bills (GET merchant/outlets/{id}/tables).
final tablesProvider = FutureProvider.autoDispose<List<DiningTable>>((ref) async {
  final outletId = ref.watch(currentOutletIdProvider);
  if (outletId == null) return const [];
  final raw = await ref.watch(apiClientProvider).get<dynamic>('merchant/outlets/$outletId/tables');
  return [for (final t in rowsOf(raw)) if (boolOf(t['isActive'], true)) (id: str(t['id']), label: str(t['label']))];
});

/// Counter billing: tap dishes into a bill, take UPI / cash / card, print
/// the GST receipt. Built for food carts and quick-service counters.
class PosPage extends ConsumerStatefulWidget {
  const PosPage({super.key});

  @override
  ConsumerState<PosPage> createState() => _PosPageState();
}

class _PosPageState extends ConsumerState<PosPage> {
  String? _category;
  String _q = '';

  Future<void> _tap(MenuItem item) async {
    if (!item.hasOptions) {
      ref.read(billProvider.notifier).add(item);
      HapticFeedback.selectionClick();
      return;
    }
    final choice = await showModalBottomSheet<({String? variantId, List<String> addonIds})>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _OptionsSheet(item: item),
    );
    if (choice != null && mounted) ref.read(billProvider.notifier).add(item, variantId: choice.variantId, addonIds: choice.addonIds);
  }

  Future<void> _openBill() async {
    final receipt = await showModalBottomSheet<Receipt>(context: context, isScrollControlled: true, showDragHandle: true, useSafeArea: true, builder: (_) => const BillSheet());
    if (receipt != null && mounted) {
      await Navigator.of(context).push(MaterialPageRoute<void>(fullscreenDialog: true, builder: (_) => ReceiptPage(receipt: receipt)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final menu = ref.watch(menuProvider);
    final bill = ref.watch(billProvider);
    final openCount = ref.watch(ordersBoardProvider.select((b) => _counterOrders(b.value).length));

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Counter'),
          bottom: TabBar(tabs: [
            const Tab(text: 'New bill'),
            Tab(child: Row(mainAxisSize: MainAxisSize.min, children: [const Text('Open orders'), if (openCount > 0) ...[const SizedBox(width: 6), CountBadge(openCount)]])),
          ]),
        ),
        body: TabBarView(children: [
          AsyncView<List<MenuCategory>>(
            value: menu,
            onRetry: () => ref.invalidate(menuProvider),
            data: (cats) => _ItemPicker(
              categories: [for (final c in cats) if (c.isActive && c.items.any((i) => i.isAvailable)) c],
              category: _category,
              query: _q,
              onCategory: (c) => setState(() => _category = c),
              onQuery: (q) => setState(() => _q = q),
              onTap: _tap,
            ),
          ),
          const _OpenOrders(),
        ]),
        bottomNavigationBar: bill.isEmpty
            ? null
            : SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  child: FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                    onPressed: _openBill,
                    child: Row(children: [
                      const Icon(Icons.receipt_long),
                      const SizedBox(width: 8),
                      Text('${bill.count} item${bill.count == 1 ? '' : 's'}'),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Review bill · ${money(bill.subtotal)}',
                          textAlign: TextAlign.end,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ]),
                  ),
                ),
              ),
      ),
    );
  }
}

class _ItemPicker extends StatelessWidget {
  const _ItemPicker({required this.categories, required this.category, required this.query, required this.onCategory, required this.onQuery, required this.onTap});
  final List<MenuCategory> categories;
  final String? category;
  final String query;
  final ValueChanged<String> onCategory;
  final ValueChanged<String> onQuery;
  final ValueChanged<MenuItem> onTap;

  @override
  Widget build(BuildContext context) {
    final active = category ?? categories.firstOrNull?.id;
    final q = query.trim().toLowerCase();
    final items = q.isNotEmpty
        ? [for (final c in categories) for (final i in c.items) if (i.name.toLowerCase().contains(q)) i]
        : categories.where((c) => c.id == active).firstOrNull?.items ?? const <MenuItem>[];
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
        child: TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search dishes'), onChanged: onQuery),
      ),
      if (q.isEmpty)
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: [
              for (final c in categories)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(label: Text(c.name), selected: c.id == active, onSelected: (_) => onCategory(c.id)),
                ),
            ],
          ),
        ),
      Expanded(
        child: items.isEmpty
            ? const EmptyView(icon: Icons.no_food_outlined, title: 'No dishes', message: 'Nothing available here right now.')
            : GridView.builder(
                padding: const EdgeInsets.all(12),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 220, mainAxisExtent: 104, mainAxisSpacing: 8, crossAxisSpacing: 8),
                itemCount: items.length,
                itemBuilder: (_, i) => _ItemButton(item: items[i], onTap: () => onTap(items[i])),
              ),
      ),
    ]);
  }
}

class _ItemButton extends StatelessWidget {
  const _ItemButton({required this.item, required this.onTap});
  final MenuItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      enabled: item.isAvailable,
      label: '${item.name}, ${money(item.price, whole: true)}${item.hasOptions ? ', has options' : ''}${item.isAvailable ? '' : ', out of stock'}',
      excludeSemantics: true,
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: item.isAvailable ? onTap : null,
          child: Opacity(
            opacity: item.isAvailable ? 1 : 0.4,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Padding(padding: const EdgeInsets.only(top: 3), child: VegMark(veg: item.isVeg, size: 14)),
                  const SizedBox(width: 6),
                  Expanded(child: Text(item.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w600))),
                ]),
                Text('${money(item.price, whole: true)}${item.hasOptions ? ' +' : ''}', style: text.titleMedium),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// The bill: quantities, order type, table, customer, discount, payment, charge.
class BillSheet extends ConsumerStatefulWidget {
  const BillSheet({super.key});

  @override
  ConsumerState<BillSheet> createState() => _BillSheetState();
}

class _BillSheetState extends ConsumerState<BillSheet> {
  String _orderType = 'TAKEAWAY';
  String? _tableId;
  PayMethod _payment = PayMethod.upi;
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _discount = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _discount.dispose();
    super.dispose();
  }

  double get _discountValue => double.tryParse(_discount.text.trim()) ?? 0;

  Future<void> _charge() async {
    final outletId = ref.read(currentOutletIdProvider);
    final bill = ref.read(billProvider);
    if (outletId == null || bill.isEmpty) return;
    setState(() => _busy = true);
    try {
      final receipt = await chargeBill(
        ref.read(apiClientProvider),
        outletId: outletId,
        bill: bill,
        payment: _payment,
        orderType: _orderType,
        tableId: _tableId,
        customerName: _name.text.trim().isEmpty ? null : _name.text.trim(),
        customerPhone: _phone.text.trim().isEmpty ? null : _phone.text.trim(),
        discount: _discountValue,
      );
      ref.read(billProvider.notifier).clear();
      ref.read(ordersBoardProvider.notifier).refresh();
      if (mounted) Navigator.pop(context, receipt);
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bill = ref.watch(billProvider);
    final outlet = ref.watch(currentOutletProvider);
    final tables = _orderType == 'DINE_IN' ? ref.watch(tablesProvider).value ?? const <DiningTable>[] : const <DiningTable>[];
    final text = Theme.of(context).textTheme;
    final payable = bill.totalAfter(_discountValue);
    final packaging = _orderType == 'TAKEAWAY' ? (outlet?.packagingCharge ?? 0) : 0.0;

    if (bill.isEmpty) {
      return const SizedBox(height: 200, child: EmptyView(icon: Icons.receipt_long, title: 'Bill is empty', message: 'Tap dishes to add them.'));
    }
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          Text('Bill · ${bill.count} item${bill.count == 1 ? '' : 's'}', style: text.titleLarge),
          const SizedBox(height: 8),
          for (final l in bill.lines)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(l.label, style: text.bodyLarge),
                    Text(money(l.amount), style: text.bodySmall),
                  ]),
                ),
                IconButton.outlined(
                  tooltip: 'One less ${l.label}',
                  icon: Icon(l.quantity == 1 ? Icons.delete_outline : Icons.remove),
                  onPressed: () => ref.read(billProvider.notifier).bump(l.key, -1),
                ),
                SizedBox(width: 32, child: Text('${l.quantity}', textAlign: TextAlign.center, style: text.titleMedium)),
                IconButton.outlined(tooltip: 'One more ${l.label}', icon: const Icon(Icons.add), onPressed: () => ref.read(billProvider.notifier).bump(l.key, 1)),
              ]),
            ),
          const Divider(height: 24),
          SegmentedButton<String>(
            segments: [
              const ButtonSegment(value: 'TAKEAWAY', icon: Icon(Icons.shopping_bag_outlined), label: Text('Takeaway')),
              if (outlet?.acceptsDineIn ?? true) const ButtonSegment(value: 'DINE_IN', icon: Icon(Icons.restaurant), label: Text('Dine-in')),
            ],
            selected: {_orderType},
            onSelectionChanged: (s) => setState(() => _orderType = s.first),
          ),
          if (tables.isNotEmpty) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: _tableId,
              decoration: const InputDecoration(labelText: 'Table'),
              items: [
                const DropdownMenuItem(value: null, child: Text('No table')),
                for (final t in tables) DropdownMenuItem(value: t.id, child: Text('Table ${t.label}')),
              ],
              onChanged: (v) => setState(() => _tableId = v),
            ),
          ],
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            shape: const Border(),
            title: const Text('Customer & discount'),
            children: [
              TextField(controller: _name, decoration: const InputDecoration(labelText: 'Customer name')),
              const SizedBox(height: 8),
              TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Customer phone')),
              const SizedBox(height: 8),
              TextField(
                controller: _discount,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                decoration: const InputDecoration(labelText: 'Discount', prefixText: '₹ '),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 8),
            ],
          ),
          const SizedBox(height: 4),
          Text('Payment', style: text.titleSmall),
          const SizedBox(height: 6),
          SegmentedButton<PayMethod>(
            segments: const [
              ButtonSegment(value: PayMethod.upi, icon: Icon(Icons.qr_code_2), label: Text('UPI')),
              ButtonSegment(value: PayMethod.cash, icon: Icon(Icons.payments_outlined), label: Text('Cash')),
              ButtonSegment(value: PayMethod.card, icon: Icon(Icons.credit_card), label: Text('Card')),
            ],
            selected: {_payment},
            onSelectionChanged: (s) => setState(() => _payment = s.first),
          ),
          const SizedBox(height: 12),
          AmountRow('Subtotal', money(bill.subtotal)),
          if (_discountValue > 0) AmountRow('Discount', '-${money(bill.subtotal - payable)}'),
          AmountRow(_discountValue > 0 ? 'Bill total after discount' : 'Bill total', money(payable), bold: true),
          Text(
            packaging > 0 ? 'GST and ${money(packaging, whole: true)} packaging are added on the receipt.' : 'GST is added on the receipt.',
            style: text.bodySmall,
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
            onPressed: _busy ? null : _charge,
            icon: _busy ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.point_of_sale),
            label: Text('Charge · ${_payment.label}'),
          ),
        ],
      ),
    );
  }
}

/// Size and add-on choices, honouring each group's min / max.
class _OptionsSheet extends StatefulWidget {
  const _OptionsSheet({required this.item});
  final MenuItem item;

  @override
  State<_OptionsSheet> createState() => _OptionsSheetState();
}

class _OptionsSheetState extends State<_OptionsSheet> {
  late String? _variant = (widget.item.variants.where((v) => v.isDefault).firstOrNull ?? widget.item.variants.firstOrNull)?.id;
  final _addons = <String>{};

  bool get _valid => widget.item.addonGroups.every((g) {
        final n = g.addons.where((a) => _addons.contains(a.id)).length;
        return n >= g.minSelect && n <= g.maxSelect;
      });

  void _toggle(MenuAddonGroup g, String id) => setState(() {
        if (_addons.remove(id)) return;
        final inGroup = g.addons.map((a) => a.id).toSet();
        if (g.maxSelect == 1) {
          _addons.removeAll(inGroup);
          _addons.add(id);
        } else if (_addons.where(inGroup.contains).length < g.maxSelect) {
          _addons.add(id);
        }
      });

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
        Text(item.name, style: text.titleLarge),
        if (item.variants.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text('Size', style: text.titleSmall),
          RadioGroup<String>(
            groupValue: _variant,
            onChanged: (v) => setState(() => _variant = v),
            child: Column(children: [
              for (final v in item.variants.where((v) => v.isAvailable))
                RadioListTile<String>(value: v.id, title: Text(v.name), secondary: Text(money(item.price + v.priceDelta, whole: true)), contentPadding: EdgeInsets.zero),
            ]),
          ),
        ],
        for (final g in item.addonGroups) ...[
          const SizedBox(height: 12),
          Text(
            '${g.name} (${g.minSelect > 0 ? 'pick ${g.minSelect == g.maxSelect ? g.minSelect : '${g.minSelect}–${g.maxSelect}'}' : 'up to ${g.maxSelect}'})',
            style: text.titleSmall,
          ),
          for (final a in g.addons.where((a) => a.isAvailable))
            CheckboxListTile(
              value: _addons.contains(a.id),
              onChanged: (_) => _toggle(g, a.id),
              title: Text(a.name),
              secondary: Text('+${money(a.price, whole: true)}'),
              contentPadding: EdgeInsets.zero,
            ),
        ],
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _valid ? () => Navigator.pop(context, (variantId: _variant, addonIds: _addons.toList())) : null,
          child: const Text('Add to bill'),
        ),
      ]),
    );
  }
}

List<dynamic> _counterOrders(OrdersBoard? b) => b == null
    ? const []
    : [for (final o in [...b[Lane.preparing], ...b[Lane.ready]]) if (o.channel == 'POS' || o.channel == 'QR') o];

/// Counter and QR orders waiting to be handed over (POST pos/orders/{id}/complete).
class _OpenOrders extends ConsumerWidget {
  const _OpenOrders();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(ordersBoardProvider).value;
    final rows = [
      if (board != null)
        for (final o in [...board[Lane.ready], ...board[Lane.preparing]]) if (o.channel == 'POS' || o.channel == 'QR') o,
    ];
    if (rows.isEmpty) {
      return const EmptyView(icon: Icons.shopping_bag_outlined, title: 'No open counter orders', message: 'Counter and QR orders waiting to be handed over appear here.');
    }
    return RefreshIndicator(
      onRefresh: () => ref.read(ordersBoardProvider.notifier).refresh(),
      child: ListView.separated(
        padding: const EdgeInsets.all(12),
        itemCount: rows.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (_, i) {
          final o = rows[i];
          return Card(
            child: ListTile(
              title: Text(o.orderNumber, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  StatusChip(o.status),
                  Text('${humanize(o.type)} · ${o.customerName ?? 'Walk-in'} · ${money(o.total)}'),
                ]),
              ),
              trailing: ActionButton(
                label: 'Hand over',
                onPressed: () async {
                  await ref.read(apiClientProvider).post<dynamic>('pos/orders/${o.id}/complete');
                  await ref.read(ordersBoardProvider.notifier).refresh();
                  if (context.mounted) showMessage(context, '${o.orderNumber} handed over');
                },
              ),
            ),
          );
        },
      ),
    );
  }
}
