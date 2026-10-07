import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../app/sign_in_screen.dart';
import '../cart/cart_controller.dart';
import '../cart/models.dart';
import '../common/json.dart';
import '../common/widgets.dart';
import '../outlet/customise_sheet.dart';
import '../outlet/models.dart';
import '../payments/payments.dart';
import 'table_cart.dart';

/// Dine-in ordering from a table QR code: no sign-in needed to pay at the
/// counter; signed-in guests can pay online. The order goes straight to the kitchen.
class TableScreen extends ConsumerStatefulWidget {
  const TableScreen({super.key, required this.token});
  final String token;

  @override
  ConsumerState<TableScreen> createState() => _TableScreenState();
}

class _TableScreenState extends ConsumerState<TableScreen> {
  bool _vegOnly = false;

  TableCartController get _cart => ref.read(tableCartProvider(widget.token).notifier);

  void _onAdd(MenuItem item) {
    if (item.customisable) {
      showCustomiseSheet(context, item, (line) async {
        _cart.add(item, line);
        return true;
      });
    } else {
      _cart.add(item, AddLine(menuItemId: item.id, variantId: item.defaultVariant?.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final menu = ref.watch(tableMenuProvider(widget.token));
    final t = menu.value;
    if (t == null) {
      final error = menu.error;
      return Scaffold(
        appBar: AppBar(),
        body: error == null
            ? const Center(child: CircularProgressIndicator())
            : EmptyView(
                icon: Icons.table_restaurant_outlined,
                title: "This table code isn't active",
                message: error is ApiException && error.status == 404 ? 'Ask the staff for a fresh QR code.' : error.toString(),
                action: OutlinedButton(onPressed: () => ref.invalidate(tableMenuProvider(widget.token)), child: const Text('Try again')),
              ),
      );
    }
    final o = t.menu.outlet;
    final cart = ref.watch(tableCartProvider(widget.token));
    final signedIn = ref.watch(sessionProvider).value != null;
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(o.name, overflow: TextOverflow.ellipsis)),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 100), children: [
        Card(
          child: ListTile(
            leading: FoodImage(url: o.logoUrl ?? o.coverImageUrl, width: 52, height: 52, radius: 12),
            title: Text(o.name, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            subtitle: Text("Table ${t.tableLabel} · order from your phone, we'll bring it to you"),
          ),
        ),
        if (!o.isOpenNow) Padding(padding: const EdgeInsets.only(top: 12), child: Notice('The kitchen is closed right now${o.opensAt == null ? '' : ' — ${o.opensAt!.toLowerCase()}'}.')),
        if (cart.placed.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Card(
              child: Column(children: [
                for (final p in cart.placed)
                  ListTile(
                    leading: const Icon(Icons.check_circle, color: FoodGridTheme.goodText, semanticLabel: 'Sent'),
                    title: Text('${p.orderNumber} sent to the kitchen'),
                    subtitle: Text('${money(p.total)} ${p.paid ? 'paid' : 'to pay at the counter'}'),
                    trailing: signedIn ? TextButton(onPressed: () => context.push('/orders/${p.id}'), child: const Text('Track')) : null,
                  ),
              ]),
            ),
          ),
        if (!o.isPureVeg)
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Row(children: [VegMark(veg: true), SizedBox(width: 8), Text('Veg only')]),
            value: _vegOnly,
            onChanged: (v) => setState(() => _vegOnly = v),
          ),
        for (final c in t.menu.categories)
          if (c.items.any((i) => !_vegOnly || i.isVeg)) ...[
            SectionTitle(c.name, padding: const EdgeInsets.fromLTRB(0, 16, 0, 4)),
            Card(
              child: Column(children: [
                for (final (n, i) in c.items.where((i) => !_vegOnly || i.isVeg).indexed) ...[
                  if (n > 0) const Divider(height: 1),
                  _TableItemRow(item: i, cart: cart, open: o.isOpenNow, onAdd: _onAdd, onQty: _cart.setQuantity),
                ],
              ]),
            ),
          ],
      ]),
      bottomNavigationBar: cart.count == 0
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: FilledButton(
                  key: const Key('review-table-order'),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                  onPressed: () => showModalBottomSheet<void>(
                    context: context,
                    useRootNavigator: true,
                    isScrollControlled: true,
                    showDragHandle: true,
                    builder: (_) => PlaceTableOrderSheet(token: widget.token),
                  ),
                  child: Row(children: [
                    Expanded(child: Text('${cart.count} item${cart.count == 1 ? '' : 's'} · ${money(cart.subtotal, whole: true)}')),
                    const Text('Review order'),
                  ]),
                ),
              ),
            ),
    );
  }
}

class _TableItemRow extends StatelessWidget {
  const _TableItemRow({required this.item, required this.cart, required this.open, required this.onAdd, required this.onQty});
  final MenuItem item;
  final TableCart cart;
  final bool open;
  final void Function(MenuItem) onAdd;
  final void Function(String key, int n) onQty;

  @override
  Widget build(BuildContext context) {
    final i = item;
    final qty = cart.quantityOf(i.id);
    final only = cart.lines.where((l) => l.line.menuItemId == i.id).toList();
    final Widget action;
    if (!i.isAvailable) {
      action = const Text('Sold out');
    } else if (qty > 0 && only.length == 1 && !i.customisable) {
      action = QtyStepper(value: qty, label: i.name, max: 30, busy: !open, onChanged: (n) => onQty(only.first.key, n));
    } else {
      action = OutlinedButton(
        key: Key('table-add-${i.id}'),
        onPressed: open ? () => onAdd(i) : null,
        child: Semantics(label: 'Add ${i.name}', excludeSemantics: true, child: Text(qty > 0 ? 'Add more ($qty)' : 'ADD')),
      );
    }
    return Opacity(
      opacity: i.isAvailable ? 1 : 0.55,
      child: ListTile(
        leading: VegMark(veg: i.isVeg),
        title: Text(i.name),
        subtitle: Text(money(i.price, whole: true)),
        trailing: action,
      ),
    );
  }
}

/// Review the table order, name and payment, then send it to the kitchen.
class PlaceTableOrderSheet extends ConsumerStatefulWidget {
  const PlaceTableOrderSheet({super.key, required this.token});
  final String token;

  @override
  ConsumerState<PlaceTableOrderSheet> createState() => _PlaceTableOrderSheetState();
}

class _PlaceTableOrderSheetState extends ConsumerState<PlaceTableOrderSheet> {
  late final _name = TextEditingController(text: ref.read(sessionProvider).value?.user.name ?? '');
  final _phone = TextEditingController();
  final _notes = TextEditingController();
  bool _payNow = false;
  bool _busy = false;
  String? _error;
  String _idempotencyKey = newIdempotencyKey();

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit(TableCart cart) async {
    setState(() => (_busy = true, _error = null));
    String? opt(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    try {
      final res = asJson(await ref.read(apiClientProvider).post<dynamic>(
            'qr/${Uri.encodeComponent(widget.token)}/orders',
            body: {
              'items': [for (final l in cart.lines) l.line.toJson()],
              'customerName': ?opt(_name),
              'customerPhone': ?opt(_phone),
              'notes': ?opt(_notes),
              'payAtCounter': !_payNow,
            },
            idempotencyKey: _idempotencyKey,
          ));
      _idempotencyKey = newIdempotencyKey();
      final order = asJson(res['order']);
      final payment = res['payment'] is Map ? asJson(res['payment']) : null;
      var paid = false;
      if (payment != null && toBool(payment['required']) && mounted) {
        final outcome = await ref.read(paymentsProvider).pay(context, PayRequest(purpose: PayPurpose.order, referenceId: str(order['id']), method: PaymentMethod.upi));
        paid = outcome == PayOutcome.paid;
        if (!paid && mounted) showMessage(context, '${payFailureMessage(outcome)} — please pay at the counter');
      }
      ref.read(tableCartProvider(widget.token).notifier).placed(PlacedTableOrder(id: str(order['id']), orderNumber: str(order['orderNumber']), total: toNum(order['total']), paid: paid));
      if (!mounted) return;
      showMessage(context, 'Order ${str(order['orderNumber'])} sent to the kitchen');
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      // e.g. 409 OUTLET_CLOSED "The kitchen is closed right now"
      setState(() => (_busy = false, _error = e.toString()));
      showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(tableCartProvider(widget.token));
    final signedIn = ref.watch(sessionProvider).value != null;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.9),
          child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
            Text('Your order', style: text.titleLarge),
            Text('Taxes are added on the bill. Staff confirm and bring it to your table.', style: text.bodyMedium?.copyWith(color: muted)),
            const SizedBox(height: 8),
            for (final l in cart.lines)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(children: [
                  VegMark(veg: l.isVeg, size: 14),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(l.name),
                      if (l.detail.isNotEmpty) Text(l.detail, style: text.bodySmall?.copyWith(color: muted)),
                    ]),
                  ),
                  QtyStepper(value: l.quantity, label: l.name, max: 30, onChanged: (n) => ref.read(tableCartProvider(widget.token).notifier).setQuantity(l.key, n)),
                  SizedBox(width: 64, child: Text(money(l.unit * l.quantity, whole: true), textAlign: TextAlign.end)),
                ]),
              ),
            const Divider(),
            KeyValueRow('Item total', money(cart.subtotal), strong: true),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: TextField(controller: _name, maxLength: 60, decoration: const InputDecoration(labelText: 'Your name'))),
              const SizedBox(width: 12),
              Expanded(child: TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone (optional)'))),
            ]),
            TextField(controller: _notes, maxLength: 300, maxLines: 2, minLines: 1, decoration: const InputDecoration(labelText: 'Note for the kitchen (optional)')),
            Text('Payment', style: text.titleSmall),
            RadioGroup<bool>(
              groupValue: _payNow,
              onChanged: (v) => setState(() => _payNow = v ?? false),
              child: Column(children: [
                const RadioListTile<bool>(value: false, contentPadding: EdgeInsets.zero, title: Text('Pay at the counter')),
                RadioListTile<bool>(
                  value: true,
                  enabled: signedIn,
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Pay now with UPI or card'),
                  subtitle: signedIn ? null : const Text('Sign in to pay online'),
                  secondary: signedIn ? null : TextButton(onPressed: () => signInFirst(context), child: const Text('Sign in')),
                ),
              ]),
            ),
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Notice(_error!, tone: NoticeTone.critical)),
            const SizedBox(height: 12),
            FilledButton(
              key: const Key('send-to-kitchen'),
              onPressed: _busy || cart.lines.isEmpty ? null : () => _submit(cart),
              child: _busy ? const ButtonSpinner() : const Text('Send to kitchen'),
            ),
          ]),
        ),
      ),
    );
  }
}
