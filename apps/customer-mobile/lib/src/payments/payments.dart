import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../cart/models.dart';
import '../common/json.dart';
import '../common/widgets.dart';

enum PayPurpose { order, walletTopup, membership, mealSubscription }

extension on PayPurpose {
  String get wire => switch (this) {
        PayPurpose.order => 'ORDER',
        PayPurpose.walletTopup => 'WALLET_TOPUP',
        PayPurpose.membership => 'MEMBERSHIP',
        PayPurpose.mealSubscription => 'MEAL_SUBSCRIPTION',
      };
}

enum PayOutcome { paid, failed, cancelled }

class PayRequest {
  const PayRequest({required this.purpose, required this.method, this.referenceId, this.amount});

  final PayPurpose purpose;

  /// Order, membership or subscription id (not for wallet top-ups).
  final String? referenceId;

  /// Any method but cash on delivery.
  final PaymentMethod method;

  /// Wallet top-up amount.
  final double? amount;

  Json toJson() => {'purpose': purpose.wire, 'method': method.wire, 'referenceId': ?referenceId, 'amount': ?amount};
}

class PaymentIntent {
  const PaymentIntent({required this.paymentId, required this.state, required this.provider, required this.amount, this.sandbox = false, this.checkout = const {}});

  final String paymentId;
  final String state;
  final String provider;
  final double amount;
  final bool sandbox;

  /// Razorpay Checkout options (key, order_id, amount, prefill…).
  final Json checkout;

  String get description => optStr(checkout['description']) ?? 'FoodGrid payment';

  factory PaymentIntent.fromJson(Json j) => PaymentIntent(
        paymentId: str(j['paymentId']),
        state: str(j['state']),
        provider: str(j['provider']),
        amount: toNum(j['amount']),
        sandbox: toBool(j['sandbox']),
        checkout: asJson(j['checkout']),
      );
}

/// What Razorpay Checkout answered.
sealed class GatewayResult {
  const GatewayResult();
}

class GatewaySuccess extends GatewayResult {
  const GatewaySuccess({required this.orderId, required this.paymentId, required this.signature});
  final String orderId;
  final String paymentId;
  final String signature;
}

class GatewayFailure extends GatewayResult {
  const GatewayFailure({required this.cancelled, this.message});
  final bool cancelled;
  final String? message;
}

/// Opens the payment gateway's checkout.
abstract class PaymentGateway {
  Future<GatewayResult> open(Json options);
}

/// Razorpay Checkout through razorpay_flutter.
class RazorpayGateway implements PaymentGateway {
  @override
  Future<GatewayResult> open(Json options) {
    final rz = Razorpay();
    final done = Completer<GatewayResult>();
    void finish(GatewayResult r) {
      if (!done.isCompleted) done.complete(r);
    }

    rz.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) {
      finish(GatewaySuccess(orderId: r.orderId ?? str(options['order_id']), paymentId: r.paymentId ?? '', signature: r.signature ?? ''));
    });
    rz.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse r) {
      finish(GatewayFailure(cancelled: r.code == Razorpay.PAYMENT_CANCELLED, message: r.message));
    });
    rz.on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse r) {
      // external wallets settle outside the app; the order page shows the result
      finish(const GatewayFailure(cancelled: true, message: 'Finish paying in your wallet app'));
    });
    try {
      rz.open(options);
    } catch (e) {
      finish(GatewayFailure(cancelled: false, message: e.toString()));
    }
    return done.future.whenComplete(rz.clear);
  }
}

final paymentGatewayProvider = Provider<PaymentGateway>((ref) => RazorpayGateway());

/// Runs a payment end to end: creates the intent, then settles it from the
/// wallet, through Razorpay Checkout, or — on non-production gateways — a
/// sandbox sheet that simulates the bank's answer.
class Payments {
  Payments(this._api, this._gateway);
  final ApiClient _api;
  final PaymentGateway _gateway;

  Future<PayOutcome> pay(BuildContext context, PayRequest request) async {
    final intent = PaymentIntent.fromJson(asJson(await _api.post<dynamic>('payments/intents', body: request.toJson(), idempotencyKey: newIdempotencyKey())));
    if (intent.state == 'CAPTURED') return PayOutcome.paid;
    if (intent.state == 'FAILED') return PayOutcome.failed;
    if (intent.sandbox) {
      if (!context.mounted) return PayOutcome.cancelled;
      final outcome = await showModalBottomSheet<PayOutcome>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        builder: (_) => SandboxCheckoutSheet(intent: intent, api: _api),
      );
      return outcome ?? PayOutcome.cancelled;
    }
    final result = await _gateway.open(intent.checkout);
    switch (result) {
      case GatewaySuccess(:final orderId, :final paymentId, :final signature):
        try {
          await _api.post<dynamic>('payments/verify', body: {
            'paymentId': intent.paymentId,
            'razorpayOrderId': orderId,
            'razorpayPaymentId': paymentId,
            'razorpaySignature': signature,
          });
          return PayOutcome.paid;
        } catch (_) {
          return PayOutcome.failed;
        }
      case GatewayFailure(:final cancelled):
        return cancelled ? PayOutcome.cancelled : PayOutcome.failed;
    }
  }
}

final paymentsProvider = Provider<Payments>((ref) => Payments(ref.watch(apiClientProvider), ref.watch(paymentGatewayProvider)));

/// Human message for a payment that did not complete.
String payFailureMessage(PayOutcome o, {String retryHint = ''}) =>
    (o == PayOutcome.failed ? 'Payment failed' : 'Payment not completed') + (retryHint.isEmpty ? '' : ' — $retryHint');

/// Test-mode checkout: no money moves; the customer picks the bank's answer.
class SandboxCheckoutSheet extends StatefulWidget {
  const SandboxCheckoutSheet({super.key, required this.intent, required this.api});
  final PaymentIntent intent;
  final ApiClient api;

  @override
  State<SandboxCheckoutSheet> createState() => _SandboxCheckoutSheetState();
}

class _SandboxCheckoutSheetState extends State<SandboxCheckoutSheet> {
  bool? _busy;

  Future<void> _finish(bool success) async {
    setState(() => _busy = success);
    try {
      await widget.api.post<dynamic>('payments/sandbox/${widget.intent.paymentId}/complete', body: {'success': success});
      if (mounted) Navigator.of(context).pop(success ? PayOutcome.paid : PayOutcome.failed);
    } catch (e) {
      if (!mounted) return;
      showError(context, e);
      Navigator.of(context).pop(PayOutcome.failed);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final amount = money(widget.intent.amount);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Icon(Icons.science_outlined),
            const SizedBox(width: 8),
            Expanded(child: Text('Test payment · $amount', style: text.titleLarge)),
          ]),
          const SizedBox(height: 8),
          Text('${widget.intent.description}. This environment uses the payment sandbox, so no money moves — choose how the bank answers.', style: text.bodyMedium),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('sandbox-pay'),
            onPressed: _busy != null ? null : () => _finish(true),
            child: _busy == true ? const ButtonSpinner() : Text('Pay $amount'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            key: const Key('sandbox-fail'),
            onPressed: _busy != null ? null : () => _finish(false),
            child: _busy == false ? const ButtonSpinner() : const Text('Simulate failure'),
          ),
        ]),
      ),
    );
  }
}
