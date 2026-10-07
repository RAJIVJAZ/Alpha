import 'package:customer_mobile/src/orders/tracking_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'support.dart';

void main() {
  testWidgets('tracking shows the status, ETA, delivery OTP, rider and map', (tester) async {
    final api = FakeApi()
      ..on('GET /orders/ord-2', orderDetailJson(id: 'ord-2', status: 'OUT_FOR_DELIVERY'))
      ..on('GET /orders/ord-2/track', trackingJson(id: 'ord-2', status: 'OUT_FOR_DELIVERY', otp: '6181', rider: true, eta: 12));
    final h = await pumpApp(tester, api, location: '/orders/ord-2', signedIn: true);

    expect(find.text('Your order is on the way.'), findsOneWidget);
    expect(find.widgetWithText(StatusChip, 'On the way'), findsOneWidget);
    expect(textContaining('Arriving in about 12 min'), findsOneWidget);
    expect(find.text('Share this code with your rider at the door:'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('delivery-otp')), matching: find.text('6181')), findsOneWidget);
    expect(find.text('Aadhya Iyer'), findsOneWidget);
    expect(find.byType(FlutterMap), findsOneWidget);
    expect(find.byType(TrackingMap), findsOneWidget);

    // timeline: placed → accepted → preparing → picked up done; delivered pending
    expect(find.bySemanticsLabel(RegExp(r'^Picked up by your rider, done at')), findsOneWidget);
    expect(find.bySemanticsLabel('Delivered, pending'), findsOneWidget);

    // live rider pin over the socket, for this order only
    expect(h.socket.sentAs('order:subscribe'), [
      {'orderId': 'ord-2'},
    ]);
    h.socket.receive('rider:location', {'orderId': 'ord-9', 'deliveryId': 'd-9', 'lat': 13.1, 'lng': 77.7});
    h.socket.receive('rider:location', {'orderId': 'ord-2', 'deliveryId': 'd-2', 'lat': 12.92, 'lng': 77.63, 'heading': 90});
    await tester.pump();
    await tester.pump();
    final pins = tester.widget<MarkerLayer>(find.byType(MarkerLayer)).markers.map((m) => (m.point.latitude, m.point.longitude));
    expect(pins, contains((12.92, 77.63)));
    expect(pins, isNot(contains((13.1, 77.7))));

    // polled every 10 seconds while active
    final before = api.callsTo('GET /orders/ord-2/track').length;
    await tester.pump(const Duration(seconds: 10));
    await tester.pump();
    expect(api.callsTo('GET /orders/ord-2/track').length, greaterThan(before));

    await unmount(tester);
    expect(h.socket.sentAs('order:unsubscribe'), [
      {'orderId': 'ord-2'},
    ]);
  });

  testWidgets('a placed order can be cancelled with a reason', (tester) async {
    var cancelled = false;
    final api = FakeApi()
      ..onCall('GET /orders/ord-3', (_) => (200, orderDetailJson(id: 'ord-3', status: cancelled ? 'CANCELLED' : 'PLACED')))
      ..onCall('GET /orders/ord-3/track', (_) => (200, trackingJson(id: 'ord-3', status: cancelled ? 'CANCELLED' : 'PLACED')))
      ..onCall('POST /orders/ord-3/cancel', (_) {
        cancelled = true;
        return (200, {'ok': true});
      })
      ..on('GET /orders', {'data': [], 'meta': {'page': 1, 'totalPages': 1, 'total': 0}});
    await pumpApp(tester, api, location: '/orders/ord-3', signedIn: true);

    await scrollTo(tester, find.byKey(const Key('cancel-order')));
    await tester.tapAndSettle(find.byKey(const Key('cancel-order')));
    await tester.tapAndSettle(find.text('Changed my mind'));
    await tester.tapAndSettle(find.widgetWithText(FilledButton, 'Cancel order'));

    expect(api.lastBody('POST /orders/ord-3/cancel'), {'reason': 'Changed my mind'});
    expect(find.text('This order was cancelled. Any payment is refunded to the original method.'), findsOneWidget);
    expect(find.byKey(const Key('cancel-order')), findsNothing);
    await unmount(tester);
  });

  testWidgets('a delivered order takes a review', (tester) async {
    final api = FakeApi()
      ..on('GET /orders/ord-4', orderDetailJson(id: 'ord-4', status: 'DELIVERED'))
      ..on('GET /orders/ord-4/track', trackingJson(id: 'ord-4', status: 'DELIVERED', eta: null))
      ..on('POST /orders/ord-4/review', {'id': 'rev-1'})
      ..on('GET /orders', {'data': [], 'meta': {'page': 1, 'totalPages': 1, 'total': 0}});
    await pumpApp(tester, api, location: '/orders/ord-4', signedIn: true);

    expect(find.text('Delivered. Enjoy your meal!'), findsOneWidget);
    await scrollTo(tester, find.byKey(const Key('submit-review')));
    await tester.tapAndSettle(find.byTooltip('Overall rating: 5 stars'));
    await tester.tapAndSettle(find.byTooltip('Food rating: 4 stars'));
    await tester.tapAndSettle(find.widgetWithText(FilterChip, 'Tasty'));
    await tester.tapAndSettle(find.byKey(const Key('submit-review')));

    expect(api.lastBody('POST /orders/ord-4/review'), {
      'rating': 5,
      'foodRating': 4,
      'tags': ['tasty'],
    });
    await unmount(tester);
  });

  testWidgets('an order without an ETA shows none', (tester) async {
    final api = FakeApi()
      ..on('GET /orders/ord-5', orderDetailJson(id: 'ord-5', status: 'PREPARING'))
      ..on('GET /orders/ord-5/track', trackingJson(id: 'ord-5', status: 'PREPARING', eta: null));
    await pumpApp(tester, api, location: '/orders/ord-5', signedIn: true);

    expect(find.text('Your food is being prepared.'), findsOneWidget);
    expect(textContaining('Arriving in'), findsNothing);
    await unmount(tester);
  });
}
