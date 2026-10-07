import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../cart/bill.dart';
import '../cart/models.dart';
import '../common/json.dart';
import '../common/links.dart';
import '../common/widgets.dart';
import '../payments/payments.dart';
import 'models.dart';
import 'providers.dart';
import 'review_form.dart';
import 'tracking_map.dart';

/// Order detail and live tracking: status, ETA, delivery OTP, map with the
/// rider's live pin, timeline, call buttons, cancel, retry payment and review.
class OrderScreen extends ConsumerStatefulWidget {
  const OrderScreen({super.key, required this.orderId, this.rate = false});

  final String orderId;

  /// Opened from "Rate": scroll to the review form.
  final bool rate;

  @override
  ConsumerState<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends ConsumerState<OrderScreen> {
  Timer? _poll;
  late final TrackingSocket _socket;
  final _subs = <StreamSubscription<Map<String, dynamic>>>[];
  ({double lat, double lng})? _riderLive;
  final _reviewKey = GlobalKey();

  String get id => widget.orderId;

  @override
  void initState() {
    super.initState();
    // poll while the order is moving; the socket adds the rider's live pin
    _poll = Timer.periodic(const Duration(seconds: 10), (_) {
      final status = ref.read(trackingProvider(id)).value?.status ?? ref.read(orderProvider(id)).value?.status;
      if (status == null || activeStatuses.contains(status)) ref.invalidate(trackingProvider(id));
    });
    _socket = ref.read(trackingSocketProvider);
    _subs.add(_socket.onOrder('rider:location', id).listen((e) {
      final lat = optNum(e['lat']);
      final lng = optNum(e['lng']);
      if (lat != null && lng != null && mounted) setState(() => _riderLive = (lat: lat, lng: lng));
    }));
    _subs.add(_socket.onOrder('delivery:status', id).listen((_) {
      if (!mounted) return;
      ref.invalidate(trackingProvider(id));
      ref.invalidate(orderProvider(id));
    }));
    _socket.subscribeOrder(id).catchError((Object _) {});
    if (widget.rate) {
      WidgetsBinding.instance.addPostFrameCallback((_) => Future<void>.delayed(const Duration(milliseconds: 400), _scrollToReview));
    }
  }

  void _scrollToReview() {
    final ctx = _reviewKey.currentContext;
    if (ctx != null && ctx.mounted) Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 300));
  }

  @override
  void dispose() {
    _poll?.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    _socket.unsubscribeOrder(id);
    super.dispose();
  }

  void _refresh() {
    ref.invalidate(orderProvider(id));
    ref.invalidate(trackingProvider(id));
    ref.invalidate(orderHistoryProvider);
  }

  @override
  Widget build(BuildContext context) {
    final order = ref.watch(orderProvider(id));
    final track = ref.watch(trackingProvider(id));
    // the order row lags the tracking snapshot; refresh it when the status moves on
    ref.listen(trackingProvider(id), (prev, next) {
      final o = ref.read(orderProvider(id)).value;
      final t = next.value;
      if (o != null && t != null && t.status != o.status && prev?.value?.status != t.status) {
        ref.invalidate(orderProvider(id));
        ref.invalidate(orderHistoryProvider);
      }
    });
    final o = order.value;
    return Scaffold(
      appBar: AppBar(title: Text(o?.outletName ?? 'Order')),
      body: o == null
          ? order.hasError
              ? ErrorView(error: order.error!, onRetry: () => ref.invalidate(orderProvider(id)))
              : const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () async {
                _refresh();
                await ref.read(orderProvider(id).future).catchError((Object _) => o);
              },
              child: _OrderBody(
                order: o,
                tracking: _withLiveRider(track.value),
                reviewKey: _reviewKey,
                onChanged: _refresh,
              ),
            ),
    );
  }

  Tracking? _withLiveRider(Tracking? t) {
    final live = _riderLive;
    final rider = t?.rider;
    if (t == null || live == null || rider == null) return t;
    return t.withRider(rider.at(live.lat, live.lng));
  }
}

class _OrderBody extends StatelessWidget {
  const _OrderBody({required this.order, required this.tracking, required this.reviewKey, required this.onChanged});

  final OrderDetail order;
  final Tracking? tracking;
  final GlobalKey reviewKey;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final o = order;
    final t = tracking;
    final status = t?.status ?? o.status;
    final live = activeStatuses.contains(status);
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(o.outletName, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            Text('${o.orderNumber} · ${dateTime(o.placedAt ?? o.createdAt)}', style: text.bodySmall?.copyWith(color: muted)),
          ]),
        ),
        StatusChip(status, label: statusLabel(status)),
      ]),
      const SizedBox(height: 12),
      _StatusHero(order: o, tracking: t),
      if (o.awaitingPayment) ...[const SizedBox(height: 12), _RetryPayment(order: o, onPaid: onChanged)],
      if (live && o.isDelivery && t != null) ...[const SizedBox(height: 12), TrackingMap(tracking: t)],
      if (live && t?.rider != null) ...[const SizedBox(height: 12), _RiderCard(rider: t!.rider!)],
      const SizedBox(height: 12),
      _Timeline(order: o, tracking: t),
      if (o.isDone && o.reviewRating == null) ...[const SizedBox(height: 12), ReviewForm(key: reviewKey, order: o, onDone: onChanged)],
      if (o.reviewRating != null)
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text('You rated this order ${o.reviewRating} ★${o.reviewComment == null ? '' : ' — “${o.reviewComment}”'}', style: text.bodyMedium?.copyWith(color: muted)),
        ),
      const SizedBox(height: 12),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Items', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            for (final i in o.items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Padding(padding: const EdgeInsets.only(top: 2), child: VegMark(veg: i.isVeg, size: 14)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${i.quantity} × ${i.name}'),
                      if (i.detail.isNotEmpty) Text(i.detail, style: text.bodySmall?.copyWith(color: muted)),
                    ]),
                  ),
                  Text(money(i.totalPrice)),
                ]),
              ),
            const Divider(),
            Bill(pricing: o.pricing, delivery: o.isDelivery),
            const SizedBox(height: 6),
            Text('Paid by ${humanize(o.paymentMethod)} · ${humanize(o.paymentStatus)}', style: text.bodySmall?.copyWith(color: muted)),
          ]),
        ),
      ),
      if (o.isDelivery && o.deliveryLine != null) ...[
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            leading: const Icon(Icons.home_outlined),
            title: Text('Delivering to ${o.deliveryLabel ?? 'your address'}'),
            subtitle: Text(o.deliveryLine!),
          ),
        ),
      ],
      if (o.specialInstructions != null) ...[
        const SizedBox(height: 12),
        Card(child: ListTile(leading: const Icon(Icons.notes), title: const Text('Instructions'), subtitle: Text(o.specialInstructions!))),
      ],
      const SizedBox(height: 16),
      if (o.canCancel) _CancelButton(orderId: o.id, onDone: onChanged),
      if (o.outletPhone != null)
        OutlinedButton.icon(onPressed: () => callPhone(o.outletPhone!), icon: const Icon(Icons.call_outlined), label: const Text('Call the restaurant')),
      TextButton(onPressed: () => context.push('/outlets/${o.outletSlug}'), child: Text('Visit ${o.outletName}')),
    ]);
  }
}

class _StatusHero extends StatelessWidget {
  const _StatusHero({required this.order, required this.tracking});
  final OrderDetail order;
  final Tracking? tracking;

  @override
  Widget build(BuildContext context) {
    final o = order;
    final t = tracking;
    final status = t?.status ?? o.status;
    final live = activeStatuses.contains(status);
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final message = switch (status) {
      'PENDING_PAYMENT' => 'Complete the payment to send your order to the kitchen.',
      'PLACED' => 'Waiting for the restaurant to confirm.',
      'ACCEPTED' => 'The restaurant has accepted your order.',
      'PREPARING' => 'Your food is being prepared.',
      'READY' => o.isDelivery ? (t?.rider != null ? '${t!.rider!.firstName} is picking it up.' : 'Ready — assigning a rider.') : 'Ready for pickup at the counter.',
      'PICKED_UP' || 'OUT_FOR_DELIVERY' => 'Your order is on the way.',
      'DELIVERED' => 'Delivered. Enjoy your meal!',
      'COMPLETED' => 'Completed. Enjoy your meal!',
      'CANCELLED' => o.cancelReason != null ? 'Cancelled: ${o.cancelReason}' : 'This order was cancelled. Any payment is refunded to the original method.',
      'REJECTED' => o.cancelReason != null
          ? "The restaurant couldn't take it: ${o.cancelReason}. Your payment is refunded."
          : "The restaurant couldn't take this order. Your payment is refunded.",
      _ => statusLabel(status),
    };
    final fg = live ? scheme.onPrimary : scheme.onSurface;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: live ? scheme.primary : scheme.surfaceContainerLow,
          border: live ? null : Border.all(color: scheme.outlineVariant),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(message, style: text.titleMedium?.copyWith(color: fg, fontWeight: FontWeight.w700)),
          if (live && o.isDelivery && t?.etaMins != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text.rich(
                TextSpan(style: text.bodyMedium?.copyWith(color: fg), children: [
                  const TextSpan(text: 'Arriving in about '),
                  TextSpan(text: '${t!.etaMins}', style: text.headlineSmall?.copyWith(color: fg, fontWeight: FontWeight.w800)),
                  const TextSpan(text: ' min'),
                ]),
              ),
            ),
          if (t?.deliveryOtp != null) ...[
            const SizedBox(height: 10),
            Text('Share this code with your rider at the door:', style: text.bodyMedium?.copyWith(color: fg)),
            const SizedBox(height: 6),
            Semantics(
              label: 'Delivery code ${t!.deliveryOtp!.split('').join(' ')}',
              excludeSemantics: true,
              child: Container(
                key: const Key('delivery-otp'),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
                child: Text(t.deliveryOtp!, style: text.headlineSmall?.copyWith(color: Colors.black, fontWeight: FontWeight.w800, letterSpacing: 6, fontFeatures: const [FontFeature.tabularFigures()])),
              ),
            ),
          ],
        ]),
      ),
    );
  }
}

class _RiderCard extends StatelessWidget {
  const _RiderCard({required this.rider});
  final RiderInfo rider;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(child: Icon(Icons.delivery_dining, color: Theme.of(context).colorScheme.primary)),
        title: Text(rider.name),
        subtitle: Text('${rider.rating.toStringAsFixed(1)} ★${rider.vehicleNumber == null ? '' : ' · ${rider.vehicleNumber}'}'),
        trailing: rider.phone.isEmpty
            ? null
            : OutlinedButton.icon(
                onPressed: () => callPhone(rider.phone),
                icon: const Icon(Icons.call_outlined),
                label: Semantics(label: 'Call ${rider.name}', excludeSemantics: true, child: const Text('Call')),
              ),
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.order, required this.tracking});
  final OrderDetail order;
  final Tracking? tracking;

  @override
  Widget build(BuildContext context) {
    final o = order;
    final t = tracking;
    final delivery = o.isDelivery;
    DateTime? at(Set<String> s) => t?.reached(s);
    final steps = [
      (label: 'Order placed', at: at({'PLACED'})),
      (label: 'Accepted by the restaurant', at: at({'ACCEPTED'})),
      (label: 'Being prepared', at: at({'PREPARING'})),
      (label: delivery ? 'Picked up by your rider' : 'Ready for pickup', at: delivery ? at({'PICKED_UP', 'OUT_FOR_DELIVERY'}) : at({'READY'})),
      (label: delivery ? 'Delivered' : 'Collected', at: at({'DELIVERED', 'COMPLETED'})),
    ];
    final stopped = o.status == 'CANCELLED' || o.status == 'REJECTED';
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Semantics(
          label: 'Order progress',
          container: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (final (i, s) in steps.indexed)
              Semantics(
                container: true,
                label: '${s.label}, ${s.at != null ? 'done at ${time(s.at)}' : 'pending'}',
                excludeSemantics: true,
                child: IntrinsicHeight(
                  child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Column(children: [
                      Icon(s.at != null ? Icons.check_circle : Icons.radio_button_unchecked, size: 22, color: s.at != null ? FoodGridTheme.good : Theme.of(context).colorScheme.outline),
                      if (i < steps.length - 1)
                        Expanded(child: Container(width: 2, margin: const EdgeInsets.symmetric(vertical: 2), color: s.at != null ? FoodGridTheme.good : Theme.of(context).colorScheme.outlineVariant)),
                    ]),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(s.label, style: text.bodyMedium?.copyWith(color: s.at == null ? muted : null, fontWeight: s.at == null ? null : FontWeight.w600)),
                          if (s.at != null) Text(time(s.at), style: text.bodySmall?.copyWith(color: muted)),
                        ]),
                      ),
                    ),
                  ]),
                ),
              ),
            if (stopped) StatusChip(o.status, label: statusLabel(o.status)),
          ]),
        ),
      ),
    );
  }
}

class _RetryPayment extends ConsumerStatefulWidget {
  const _RetryPayment({required this.order, required this.onPaid});
  final OrderDetail order;
  final VoidCallback onPaid;

  @override
  ConsumerState<_RetryPayment> createState() => _RetryPaymentState();
}

class _RetryPaymentState extends ConsumerState<_RetryPayment> {
  late PaymentMethod _method = widget.order.paymentMethod == 'COD' ? PaymentMethod.upi : PaymentMethod.fromWire(widget.order.paymentMethod);
  bool _busy = false;

  Future<void> _pay() async {
    setState(() => _busy = true);
    try {
      final r = await ref.read(paymentsProvider).pay(context, PayRequest(purpose: PayPurpose.order, referenceId: widget.order.id, method: _method));
      if (!mounted) return;
      if (r == PayOutcome.paid) {
        showMessage(context, 'Payment received — your order is with the kitchen');
        widget.onPaid();
      } else {
        showMessage(context, payFailureMessage(r));
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Notice('Complete the payment to send this order to the kitchen.', title: 'Payment pending'),
          const SizedBox(height: 12),
          DropdownButtonFormField<PaymentMethod>(
            initialValue: _method,
            decoration: const InputDecoration(labelText: 'Pay with'),
            items: [for (final m in PaymentMethod.values) if (m != PaymentMethod.cod) DropdownMenuItem(value: m, child: Text(m.label))],
            onChanged: (m) => setState(() => _method = m ?? _method),
          ),
          const SizedBox(height: 10),
          FilledButton(key: const Key('retry-payment'), onPressed: _busy ? null : _pay, child: _busy ? const ButtonSpinner() : Text('Pay ${money(widget.order.total)}')),
        ]),
      ),
    );
  }
}

const _cancelReasons = ['Ordered by mistake', 'Want to change items', 'Delivery is taking too long', 'Changed my mind'];

class _CancelButton extends ConsumerStatefulWidget {
  const _CancelButton({required this.orderId, required this.onDone});
  final String orderId;
  final VoidCallback onDone;

  @override
  ConsumerState<_CancelButton> createState() => _CancelButtonState();
}

class _CancelButtonState extends ConsumerState<_CancelButton> {
  bool _busy = false;

  Future<void> _cancel() async {
    var reason = _cancelReasons.first;
    final ok = await confirm(
      context,
      title: 'Cancel this order?',
      confirmLabel: 'Cancel order',
      destructive: true,
      content: StatefulBuilder(
        builder: (context, setLocal) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('You can cancel free of charge until the restaurant accepts it.'),
          const SizedBox(height: 8),
          RadioGroup<String>(
            groupValue: reason,
            onChanged: (v) => setLocal(() => reason = v ?? reason),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              for (final r in _cancelReasons) RadioListTile<String>(value: r, title: Text(r), contentPadding: EdgeInsets.zero, dense: true),
            ]),
          ),
        ]),
      ),
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).post<dynamic>('orders/${widget.orderId}/cancel', body: {'reason': reason});
      if (!mounted) return;
      showMessage(context, 'Order cancelled — any payment is refunded to the original method');
      widget.onDone();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: OutlinedButton.icon(
          key: const Key('cancel-order'),
          style: OutlinedButton.styleFrom(foregroundColor: FoodGridTheme.critical),
          onPressed: _busy ? null : _cancel,
          icon: _busy ? const ButtonSpinner() : const Icon(Icons.cancel_outlined),
          label: const Text('Cancel order'),
        ),
      );
}
