import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../account/addresses.dart';
import '../common/json.dart';
import '../common/widgets.dart';
import '../orders/providers.dart';
import '../outlet/models.dart';
import '../outlet/providers.dart';
import '../payments/payments.dart';
import 'address_form.dart';
import 'bill.dart';
import 'cart_controller.dart';
import 'checkout_providers.dart';
import 'coupons_sheet.dart';
import 'models.dart';

const _tips = [0, 20, 30, 50];

/// Cart and checkout: delivery or takeaway, address, tip, coupon, payment
/// method and the live bill; places the order and pays for it.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key, this.coupon});

  /// Coupon to apply on arrival (banner deep links).
  final String? coupon;

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  String _orderType = 'DELIVERY';
  String? _addressId;
  int _tip = 0;
  PaymentMethod _method = PaymentMethod.upi;
  final _notes = TextEditingController();
  bool _placing = false;
  bool _couponTried = false;
  String? _busyLine;
  String _idempotencyKey = newIdempotencyKey();

  /// The cart as it was when the order was placed. The server empties the cart
  /// on checkout; showing this snapshot until payment finishes keeps the page
  /// (and the payment sheet above it) from being torn down.
  Cart? _frozen;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  void _maybeApplyCoupon(Cart c) {
    final code = widget.coupon;
    if (code == null || code.isEmpty || _couponTried || c.isEmpty || c.couponCode != null) return;
    _couponTried = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await ref.read(cartProvider.notifier).applyCoupon(code);
        if (mounted) showMessage(context, '${code.toUpperCase()} applied');
      } catch (e) {
        if (mounted) showError(context, e);
      }
    });
  }

  Future<void> _changeLine(CartLine l, int n) async {
    setState(() => _busyLine = l.lineId);
    try {
      await ref.read(cartProvider.notifier).setQuantity(l.lineId, n);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busyLine = null);
    }
  }

  Future<void> _place({required Cart cart, required String orderType, required PaymentMethod method, required Address? address}) async {
    final delivery = orderType == 'DELIVERY';
    setState(() => (_placing = true, _frozen = cart));
    final CheckoutResult res;
    try {
      final note = _notes.text.trim();
      res = CheckoutResult.fromJson(asJson(await ref.read(apiClientProvider).post<dynamic>(
        'orders',
        body: {
          'orderType': orderType,
          'paymentMethod': method.wire,
          if (delivery && _tip > 0) 'tip': _tip,
          if (note.isNotEmpty) 'specialInstructions': note,
          if (delivery && address != null) 'deliveryAddress': address.toSnapshot(),
        },
        idempotencyKey: _idempotencyKey,
      )));
    } catch (e) {
      if (!mounted) return;
      showError(context, e);
      setState(() => (_placing = false, _frozen = null));
      ref.invalidate(cartProvider);
      return;
    }
    _idempotencyKey = newIdempotencyKey();
    if (res.paymentRequired && method != PaymentMethod.cod && mounted) {
      try {
        final outcome = await ref.read(paymentsProvider).pay(context, PayRequest(purpose: PayPurpose.order, referenceId: res.orderId, method: method));
        if (outcome != PayOutcome.paid && mounted) showMessage(context, payFailureMessage(outcome, retryHint: 'you can retry from the order page'));
      } catch (e) {
        if (mounted) showError(context, e);
      }
    }
    if (!mounted) return;
    // the order exists now; only after paying refresh the (server-emptied) cart,
    // while the snapshot keeps this page and the payment sheet intact
    ref.invalidate(cartProvider);
    ref.invalidate(orderHistoryProvider);
    context.pushReplacement('/orders/${res.orderId}');
  }

  @override
  Widget build(BuildContext context) {
    final cartState = ref.watch(cartProvider);
    final c = _frozen ?? cartState.value;
    if (c == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cart')),
        body: AsyncView<Cart>(value: cartState, onRetry: () => ref.invalidate(cartProvider), data: (_) => const SizedBox.shrink()),
      );
    }
    if (c.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cart')),
        body: EmptyView(
          icon: Icons.shopping_bag_outlined,
          title: 'Your cart is empty',
          message: 'Add dishes from a restaurant or food cart near you.',
          action: FilledButton(onPressed: () => context.go('/'), child: const Text('Find food')),
        ),
      );
    }
    _maybeApplyCoupon(c);

    final outlet = c.outletId == null ? null : ref.watch(outletByIdProvider(c.outletId!)).value;
    final addresses = ref.watch(addressesProvider);
    final addressList = addresses.value ?? const <Address>[];
    final balance = ref.watch(walletBalanceProvider).value;

    // the outlet decides what's possible
    final orderType = outlet != null && !outlet.acceptsDelivery
        ? 'TAKEAWAY'
        : outlet != null && !outlet.acceptsTakeaway
            ? 'DELIVERY'
            : _orderType;
    final delivery = orderType == 'DELIVERY';
    final method = !delivery && _method == PaymentMethod.cod ? PaymentMethod.upi : _method;
    final address = addressList.where((a) => a.id == _addressId).firstOrNull ?? addressList.where((a) => a.isDefault).firstOrNull ?? addressList.firstOrNull;

    final canQuote = !delivery || address != null;
    final QuoteArgs args = (
      orderType: orderType,
      lat: delivery ? address?.lat : null,
      lng: delivery ? address?.lng : null,
      tip: delivery ? _tip : 0,
      method: method.wire,
      cart: c.signature,
    );
    final quote = canQuote && _frozen == null ? ref.watch(quoteProvider(args)) : null;
    final q = quote?.value;
    final pricing = q?.cart.pricing;
    final total = pricing?.total ?? 0;
    final walletShort = method == PaymentMethod.wallet && (balance ?? 0) < total;
    final dq = q?.delivery;
    String? blocker;
    if (outlet != null && !outlet.isOpenNow) {
      blocker = 'The kitchen is closed right now${outlet.opensAt == null ? '' : ' · ${outlet.opensAt}'}';
    } else if (outlet != null && outlet.minOrderValue > (pricing?.subtotal ?? c.itemsTotal)) {
      blocker = 'Minimum order is ${money(outlet.minOrderValue, whole: true)}';
    } else if (delivery && addresses.hasValue && address == null) {
      blocker = 'Add a delivery address';
    } else if (delivery && dq != null && !dq.serviceable) {
      blocker = dq.reason ?? 'This address is too far for delivery';
    } else if (walletShort) {
      blocker = 'Wallet balance is too low — pick another way to pay';
    }
    final fetching = quote != null && quote.isLoading;
    final canPay = blocker == null && pricing != null && !fetching && !_placing;
    final payLabel = method == PaymentMethod.cod ? 'Place order' : 'Pay ${pricing == null ? '' : money(pricing.total)}';
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: AbsorbPointer(
        absorbing: _placing,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
          _CartLines(cart: c, outlet: outlet, busyLine: _busyLine, onChange: _changeLine),
          if (outlet != null && outlet.acceptsDelivery && outlet.acceptsTakeaway) ...[
            const SizedBox(height: 16),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'DELIVERY', label: Text('Delivery'), icon: Icon(Icons.delivery_dining_outlined)),
                ButtonSegment(value: 'TAKEAWAY', label: Text('Takeaway'), icon: Icon(Icons.shopping_bag_outlined)),
              ],
              selected: {orderType},
              onSelectionChanged: (s) => setState(() => _orderType = s.first),
            ),
          ],
          const SizedBox(height: 16),
          if (delivery)
            _Section(
              title: 'Deliver to',
              trailing: TextButton.icon(
                onPressed: () async {
                  final saved = await showAddressForm(context);
                  if (saved != null && mounted) setState(() => _addressId = saved.id);
                },
                icon: const Icon(Icons.add),
                label: const Text('New address'),
              ),
              child: addresses.isLoading && !addresses.hasValue
                  ? const LinearProgressIndicator()
                  : addresses.hasError && !addresses.hasValue
                      ? ErrorView(error: addresses.error!, onRetry: () => ref.invalidate(addressesProvider))
                      : RadioGroup<String>(
                          groupValue: address?.id,
                          onChanged: (v) => setState(() => _addressId = v),
                          child: Column(children: [
                            if (addressList.isEmpty) Text('No saved addresses yet.', style: text.bodyMedium?.copyWith(color: muted)),
                            for (final a in addressList)
                              RadioListTile<String>(
                                value: a.id,
                                contentPadding: EdgeInsets.zero,
                                title: Text(a.label),
                                subtitle: Text(a.oneLine),
                              ),
                            if (dq != null && dq.serviceable)
                              Align(
                                alignment: Alignment.centerLeft,
                                child: Text('Arrives in about ${dq.etaMins} min · ${dq.distanceKm.toStringAsFixed(1)} km', style: text.bodySmall?.copyWith(color: muted)),
                              ),
                          ]),
                        ),
            )
          else
            _Section(
              title: 'Pick up',
              child: Text('Pick up from ${outlet?.name ?? c.outletName ?? 'the restaurant'}${outlet == null ? '' : ', ${outlet.addressLine1}'}. We\'ll tell you when it\'s ready.'),
            ),
          if (delivery) ...[
            const SizedBox(height: 12),
            _Section(
              title: 'Tip your rider',
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Wrap(spacing: 8, children: [
                  for (final t in _tips) ChoiceChip(label: Text(t == 0 ? 'No tip' : money(t, whole: true)), selected: _tip == t, onSelected: (_) => setState(() => _tip = t)),
                ]),
                const SizedBox(height: 4),
                Text('The whole tip goes to your rider.', style: text.bodySmall?.copyWith(color: muted)),
              ]),
            ),
          ],
          const SizedBox(height: 12),
          _Section(
            title: 'Offers',
            child: c.couponCode != null
                ? Row(children: [
                    Icon(Icons.local_offer, color: Theme.of(context).colorScheme.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${c.couponCode} applied', style: text.titleSmall),
                        if (q?.couponValid == false) Text(q?.couponReason ?? 'This coupon does not apply to this order', style: text.bodySmall?.copyWith(color: FoodGridTheme.critical)),
                      ]),
                    ),
                    TextButton.icon(
                      onPressed: () async {
                        try {
                          await ref.read(cartProvider.notifier).removeCoupon();
                        } catch (e) {
                          if (context.mounted) showError(context, e);
                        }
                      },
                      icon: const Icon(Icons.close),
                      label: const Text('Remove'),
                    ),
                  ])
                : OutlinedButton.icon(
                    onPressed: c.outletId == null ? null : () => showCouponsSheet(context, c.outletId!),
                    icon: const Icon(Icons.local_offer_outlined),
                    label: const Text('Apply a coupon'),
                  ),
          ),
          const SizedBox(height: 12),
          _Section(
            title: 'Pay with',
            child: RadioGroup<PaymentMethod>(
              groupValue: method,
              onChanged: (m) => setState(() => _method = m ?? _method),
              child: Column(children: [
                for (final m in PaymentMethod.values)
                  if (m != PaymentMethod.cod || delivery)
                    RadioListTile<PaymentMethod>(
                      key: Key('method-${m.wire}'),
                      value: m,
                      // the wallet can't pay more than its balance
                      enabled: m != PaymentMethod.wallet || balance == null || balance >= total,
                      contentPadding: EdgeInsets.zero,
                      secondary: Icon(switch (m) {
                        PaymentMethod.upi => Icons.phone_android,
                        PaymentMethod.card => Icons.credit_card,
                        PaymentMethod.netbanking => Icons.account_balance_outlined,
                        PaymentMethod.wallet => Icons.account_balance_wallet_outlined,
                        PaymentMethod.cod => Icons.payments_outlined,
                      }),
                      title: Text(m.label),
                      subtitle: m == PaymentMethod.wallet
                          ? Text(
                              balance == null ? 'Balance —' : 'Balance ${money(balance)}${balance < total ? ' — not enough for this order' : ''}',
                              style: TextStyle(color: balance != null && balance < total ? FoodGridTheme.critical : null),
                            )
                          : m.hint == null
                              ? null
                              : Text(m.hint!),
                    ),
              ]),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notes,
            maxLength: 300,
            maxLines: 2,
            minLines: 1,
            decoration: const InputDecoration(labelText: 'Instructions for the restaurant (optional)', hintText: 'Ring the bell, no cutlery…'),
          ),
          const SizedBox(height: 4),
          _Section(
            title: 'Bill details',
            child: quote?.hasError == true && q == null
                ? ErrorView(error: quote!.error!, onRetry: () => ref.invalidate(quoteProvider(args)))
                : pricing != null
                    ? Bill(pricing: pricing, delivery: delivery, member: q?.isMember ?? false, waivedDeliveryFee: dq?.deliveryFee)
                    : !canQuote
                        ? Text('Add an address to see delivery charges.', style: text.bodyMedium?.copyWith(color: muted))
                        : const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator())),
          ),
          if (blocker != null) Padding(padding: const EdgeInsets.only(top: 12), child: Notice(blocker)),
          const SizedBox(height: 8),
          Text('Cancel free of charge until the restaurant accepts your order.', style: text.bodySmall?.copyWith(color: muted)),
        ]),
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          decoration: BoxDecoration(border: Border(top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant))),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(pricing == null ? '—' : money(pricing.total), style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                Text(blocker ?? 'Total to pay', maxLines: 1, overflow: TextOverflow.ellipsis, style: text.bodySmall?.copyWith(color: muted)),
              ]),
            ),
            FilledButton(
              key: const Key('place-order'),
              onPressed: canPay ? () => _place(cart: c, orderType: orderType, method: method, address: address) : null,
              child: _placing ? const ButtonSpinner() : Text(payLabel),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.trailing});
  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Semantics(header: true, child: Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)))),
            ?trailing,
          ]),
          const SizedBox(height: 6),
          child,
        ]),
      ),
    );
  }
}

class _CartLines extends ConsumerWidget {
  const _CartLines({required this.cart, required this.outlet, required this.busyLine, required this.onChange});
  final Cart cart;
  final OutletDetail? outlet;
  final String? busyLine;
  final void Function(CartLine line, int quantity) onChange;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return _Section(
      title: cart.outletName ?? 'Your cart',
      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
        if (outlet != null) TextButton(onPressed: () => context.push('/outlets/${outlet!.slug}'), child: const Text('Add more')),
        TextButton(
          onPressed: () async {
            if (!await confirm(context, title: 'Clear your cart?', confirmLabel: 'Clear', destructive: true)) return;
            try {
              await ref.read(cartProvider.notifier).clear();
            } catch (e) {
              if (context.mounted) showError(context, e);
            }
          },
          child: const Text('Clear'),
        ),
      ]),
      child: Column(children: [
        if (cart.removedItems.isNotEmpty)
          Padding(padding: const EdgeInsets.only(bottom: 8), child: Notice('Removed because they are unavailable now: ${cart.removedItems.join(', ')}')),
        for (final l in cart.lines)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(children: [
              VegMark(veg: l.isVeg, size: 14),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l.name, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                  if (l.detail.isNotEmpty) Text(l.detail, style: text.bodySmall?.copyWith(color: muted)),
                ]),
              ),
              QtyStepper(value: l.quantity, label: l.name, busy: busyLine == l.lineId, onChanged: (n) => onChange(l, n)),
              SizedBox(width: 78, child: Text(money(l.totalPrice), textAlign: TextAlign.end, style: text.bodyMedium)),
            ]),
          ),
      ]),
    );
  }
}
