import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

FakeApi checkoutApi({bool open = true}) {
  final cart = cartJson(lines: [lineJson()]);
  return FakeApi()
    ..on('GET /cart', cart)
    ..on('GET /outlets/o-1', outletDetailJson(open: open))
    ..on('GET /users/me/addresses', [addressJson()])
    ..on('GET /wallets/me', {
      'wallet': {'id': 'w-1', 'balance': '400', 'status': 'ACTIVE'},
      'transactions': [],
      'meta': {'page': 1, 'pageSize': 1, 'total': 0, 'totalPages': 1},
    })
    ..on('POST /cart/quote', quoteJson(cart))
    // public browsing behind the checkout (home tab under the stack)
    ..on('GET /cms/banners', [])
    ..on('GET /recommendations/home', {'recommended': [], 'reorder': [], 'topRated': [], 'fastDelivery': []})
    ..on('GET /outlets/nearby', {'data': [], 'meta': {'page': 1, 'pageSize': 12, 'total': 0, 'totalPages': 1}});
}

void main() {
  testWidgets('checkout shows the bill with the waived delivery fee struck through', (tester) async {
    final api = checkoutApi();
    await pumpApp(tester, api, location: '/cart', signedIn: true);

    expect(find.text('Checkout'), findsOneWidget);
    expect(find.text('Margherita'), findsOneWidget);
    expect(find.text('Medium (10") · Extra Cheese'), findsOneWidget);

    // quoted for the default address with the chosen method
    final body = api.lastBody('POST /cart/quote') as Map;
    expect(body['orderType'], 'DELIVERY');
    expect(body['lat'], 12.92932);
    expect(body['lng'], 77.62639);
    expect(body['paymentMethod'], 'UPI');
    expect(body['tip'], 0);

    await scrollTo(tester, find.byKey(const Key('delivery-fee-waived')));
    final waived = find.byKey(const Key('delivery-fee-waived'));
    expect(find.descendant(of: waived, matching: find.text('FREE')), findsOneWidget);
    final struck = tester.widget<Text>(find.descendant(of: waived, matching: find.text('₹44.00')));
    expect(struck.style?.decoration, TextDecoration.lineThrough);
    expect(find.text('FoodGrid One discount'), findsOneWidget);
    expect(find.text('You save ₹66.95 on this order'), findsOneWidget);
    expect(find.text('Pay ₹495.00'), findsOneWidget);

    // a tip re-quotes
    await scrollTo(tester, find.widgetWithText(ChoiceChip, '₹30'));
    await tester.tapAndSettle(find.widgetWithText(ChoiceChip, '₹30'));
    expect((api.lastBody('POST /cart/quote') as Map)['tip'], 30);
  });

  testWidgets('a closed kitchen blocks paying and says when it opens', (tester) async {
    final api = checkoutApi(open: false);
    await pumpApp(tester, api, location: '/cart', signedIn: true);

    expect(textContaining('The kitchen is closed right now'), findsWidgets);
    final pay = tester.widget<FilledButton>(find.byKey(const Key('place-order')));
    expect(pay.onPressed, isNull);
  });

  testWidgets('place order, pay in the sandbox, land on live tracking', (tester) async {
    final api = checkoutApi()
      ..on('POST /orders', {
        'order': {'id': 'ord-1', 'orderNumber': 'ORD-261007-00042', 'status': 'PENDING_PAYMENT', 'total': '495', 'paymentStatus': 'PENDING'},
        'pricing': {},
        'payment': {'required': true, 'purpose': 'ORDER', 'referenceId': 'ord-1', 'amount': '495', 'method': 'UPI'},
      })
      ..on('POST /payments/intents', {
        'paymentId': 'pay-1',
        'state': 'CREATED',
        'provider': 'RAZORPAY',
        'amount': '495.00',
        'sandbox': true,
        'checkout': {'key': 'rzp_test_sandbox', 'order_id': 'order_sbx_1', 'amount': 49500, 'description': 'Order ORD-261007-00042'},
      })
      ..on('POST /payments/sandbox/pay-1/complete', {'ok': true})
      ..on('GET /orders/ord-1', orderDetailJson())
      ..on('GET /orders/ord-1/track', trackingJson());
    final h = await pumpApp(tester, api, location: '/cart', signedIn: true);

    await tester.tapAndPump(find.byKey(const Key('place-order')));

    // the order went out with an idempotency key and the address snapshot
    final order = api.callsTo('POST /orders').single;
    expect(order.headers['idempotency-key'], isNotEmpty);
    expect((order.data as Map)['paymentMethod'], 'UPI');
    expect(((order.data as Map)['deliveryAddress'] as Map)['line1'], '#208, 1st Cross');
    expect(api.lastBody('POST /payments/intents'), {'purpose': 'ORDER', 'method': 'UPI', 'referenceId': 'ord-1'});
    expect(api.callsTo('POST /payments/intents').single.headers['idempotency-key'], isNotEmpty);

    // the sandbox sheet simulates the bank; the checkout stays intact under it
    expect(find.text('Test payment · ₹495.00'), findsOneWidget);
    expect(find.text('Checkout'), findsOneWidget);
    await tester.tap(find.byKey(const Key('sandbox-pay')));
    await tester.pumpAndSettle();
    expect(api.lastBody('POST /payments/sandbox/pay-1/complete'), {'success': true});

    // the cart was not refetched while paying (that would tear the payment UI down)
    final log = api.log;
    final placed = log.indexOf('POST /orders');
    final paid = log.indexOf('POST /payments/sandbox/pay-1/complete');
    expect(log.sublist(placed, paid).where((c) => c == 'GET /cart'), isEmpty);

    // tracking for the new order
    expect(find.text('Waiting for the restaurant to confirm.'), findsOneWidget);
    expect(find.text('ORD-261007-00042 · 7 Oct, 3:30 pm'), findsOneWidget);
    expect(h.socket.subscribed, contains('ord-1'));
    await unmount(tester);
  });

  testWidgets('a failed sandbox payment still opens the order to retry from', (tester) async {
    final api = checkoutApi()
      ..on('POST /orders', {
        'order': {'id': 'ord-1', 'orderNumber': 'ORD-261007-00042', 'status': 'PENDING_PAYMENT', 'total': '495', 'paymentStatus': 'PENDING'},
        'payment': {'required': true, 'purpose': 'ORDER', 'referenceId': 'ord-1', 'amount': '495', 'method': 'UPI'},
      })
      ..on('POST /payments/intents', {'paymentId': 'pay-1', 'state': 'CREATED', 'provider': 'RAZORPAY', 'amount': '495.00', 'sandbox': true, 'checkout': {}})
      ..on('POST /payments/sandbox/pay-1/complete', {'ok': true})
      ..on('GET /orders/ord-1', orderDetailJson(status: 'PENDING_PAYMENT', paymentStatus: 'PENDING'))
      ..on('GET /orders/ord-1/track', trackingJson(status: 'PENDING_PAYMENT'));
    await pumpApp(tester, api, location: '/cart', signedIn: true);

    await tester.tapAndPump(find.byKey(const Key('place-order')));
    await tester.tap(find.byKey(const Key('sandbox-fail')));
    await tester.pumpAndSettle();

    expect(api.lastBody('POST /payments/sandbox/pay-1/complete'), {'success': false});
    expect(find.text('Complete the payment to send your order to the kitchen.'), findsOneWidget);
    expect(find.byKey(const Key('retry-payment')), findsOneWidget);
    expect(find.byKey(const Key('cancel-order')), findsOneWidget);
    await unmount(tester);
  });
}
