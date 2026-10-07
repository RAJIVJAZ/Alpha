import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:merchant_mobile/features/orders/order.dart';
import 'package:merchant_mobile/features/orders/orders_board.dart';

import 'helpers.dart';

void main() {
  group('board grouping', () {
    MerchantOrder o(String id, String status, {int minsAgo = 5}) => MerchantOrder.fromJson(
          orderJson(id, 'ORD-$id', status, placedAt: DateTime.utc(2026, 10, 7, 12).subtract(Duration(minutes: minsAgo))),
        );

    test('orders fall into New, Preparing, Ready and Done today', () {
      final lanes = OrdersBoard.group([
        o('a', 'PLACED'),
        o('b', 'ACCEPTED'),
        o('c', 'PREPARING'),
        o('d', 'READY'),
        o('e', 'OUT_FOR_DELIVERY'),
        o('f', 'DELIVERED'),
        o('g', 'COMPLETED'),
        o('h', 'CANCELLED'),
        o('i', 'PENDING_PAYMENT'), // never on the board
      ]);
      expect(lanes[Lane.fresh]!.map((e) => e.id), ['a']);
      expect(lanes[Lane.preparing]!.map((e) => e.id), unorderedEquals(['b', 'c']));
      expect(lanes[Lane.ready]!.map((e) => e.id), ['d']);
      expect(lanes[Lane.done]!.map((e) => e.id), unorderedEquals(['e', 'f', 'g', 'h']));
    });

    test('new orders are oldest first, done most recent first, duplicates dropped', () {
      final lanes = OrdersBoard.group([o('new', 'PLACED', minsAgo: 1), o('old', 'PLACED', minsAgo: 9), o('old', 'PLACED', minsAgo: 9), o('d1', 'COMPLETED', minsAgo: 50), o('d2', 'COMPLETED', minsAgo: 10)]);
      expect(lanes[Lane.fresh]!.map((e) => e.id), ['old', 'new']);
      expect(lanes[Lane.done]!.map((e) => e.id), ['d2', 'd1']);
    });

    test('add-ons parse from snapshots and from plain names', () {
      final order = o('a', 'PLACED');
      expect(order.items[1].options, 'Full · Extra mint chutney');
      expect(order.items[1].notes, 'Less spicy');
      expect(order.discount, 0);
      expect(order.total, 511);
    });
  });

  testWidgets('the board groups live orders and accepting sends the chosen prep time', (tester) async {
    final backend = baseBackend();
    backend.on('GET', '/merchant/orders', (req) {
      final statuses = req.queryParameters['status'] as List;
      if (statuses.contains('PLACED')) {
        return page([
          orderJson('p1', 'ORD-1001', 'PLACED', type: 'TAKEAWAY'),
          orderJson('p2', 'ORD-1002', 'PREPARING'),
          orderJson('p3', 'ORD-1003', 'ACCEPTED'),
          orderJson('p4', 'ORD-1004', 'READY', type: 'DINE_IN'),
        ]);
      }
      return page([orderJson('p5', 'ORD-0999', 'COMPLETED')]);
    });
    backend.post('/merchant/orders/p1/accept', {'id': 'p1', 'status': 'ACCEPTED'});
    await pumpMerchantApp(tester, backend);

    // the web board's filters: outlet + statuses; done today limited to the IST day
    final queries = backend.callsTo('GET', '/merchant/orders').map((c) => c.queryParameters).toList();
    expect(queries.first['outletId'], 'o1');
    expect(queries.first['status'], ['PLACED', 'ACCEPTED', 'PREPARING', 'READY']);
    final done = queries.firstWhere((q) => (q['status'] as List).contains('COMPLETED'));
    expect(done['from'], istToday());
    expect(done['to'], istToday());

    // lane tabs carry counts
    expect(find.bySemanticsLabel(RegExp(r'^New, 1\b')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^Preparing, 2\b')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^Ready, 1\b')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^Done today, 1\b')), findsOneWidget);
    // the orders tab badge shows one waiting order
    expect(find.descendant(of: find.byType(NavigationBar), matching: find.text('1')), findsWidgets);

    // New lane shows the order with items, add-ons and notes
    expect(find.text('ORD-1001'), findsOneWidget);
    expect(find.textContaining('Extra mint chutney'), findsWidgets);
    expect(find.textContaining('Less spicy'), findsWidgets);

    await tester.tap(find.widgetWithText(FilledButton, 'Accept'));
    await tester.pumpAndSettle();
    expect(find.text('Accept ORD-1001'), findsOneWidget);
    await tester.tap(find.text('30 min'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Accept order'));
    await tester.pumpAndSettle();

    expect(backend.lastBody('POST', '/merchant/orders/p1/accept'), {'prepTimeMins': 30});
    expect(find.text('ORD-1001: accepted'), findsOneWidget);

    // other lanes
    await tester.tap(find.bySemanticsLabel(RegExp(r'^Ready, 1\b')));
    await tester.pumpAndSettle();
    expect(find.text('ORD-1004'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Served'), findsOneWidget); // dine-in hand-over
  });

  testWidgets('a chef sees new orders but no accept / reject', (tester) async {
    final backend = baseBackend();
    backend.get('/merchant/orders', page([orderJson('p1', 'ORD-1001', 'PLACED')]));
    await pumpMerchantApp(tester, backend, accessToken: merchantToken(role: 'CHEF'));

    expect(find.text('ORD-1001'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Accept'), findsNothing);
    expect(find.text('Reject'), findsNothing);
    expect(find.text('Waiting for a manager or cashier to accept'), findsOneWidget);
    // a chef has no counter tab, but does have the kitchen
    expect(find.text('Counter'), findsNothing);
    expect(find.text('Kitchen'), findsOneWidget);
  });

  testWidgets('a 403 from the API is explained', (tester) async {
    final backend = baseBackend();
    backend.get('/merchant/orders', page([orderJson('p1', 'ORD-1001', 'PLACED', type: 'TAKEAWAY')]));
    backend.post('/merchant/orders/p1/reject', {
      'statusCode': 403,
      'code': 'PERMISSION_DENIED',
      'message': 'Missing permission',
      'details': ['orders:manage'],
    }, status: 403);
    await pumpMerchantApp(tester, backend);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Reject'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kitchen too busy'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reject order'));
    await tester.pumpAndSettle();

    expect(backend.lastBody('POST', '/merchant/orders/p1/reject'), {'reason': 'Kitchen too busy'});
    expect(find.text("Your role can't manage orders. Ask the owner or a manager."), findsOneWidget);
  });

  testWidgets('a newly placed order rings once and shows a banner', (tester) async {
    final backend = baseBackend();
    final app = await pumpMerchantApp(tester, backend);
    expect(app.alerter.alerts, isEmpty);

    backend.get('/merchant/orders', page([orderJson('n1', 'ORD-2001', 'PLACED')]));
    await refreshBoard(tester, app);
    expect(app.alerter.alerts, [1]);
    expect(find.text('New order ORD-2001'), findsOneWidget);

    // the same order on the next poll does not ring again
    await refreshBoard(tester, app);
    expect(app.alerter.alerts, [1]);
  });

  testWidgets("the server's own 403 wording is shown when it sends one", (tester) async {
    final backend = baseBackend();
    backend.get('/merchant/orders', page([orderJson('p1', 'ORD-1001', 'PLACED', type: 'TAKEAWAY')]));
    backend.post('/merchant/orders/p1/reject', {
      'statusCode': 403,
      'code': 'PERMISSION_DENIED',
      'message': "Your role can't manage orders. Ask the business owner for access.",
      'details': ['orders:manage'],
    }, status: 403);
    await pumpMerchantApp(tester, backend);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Reject'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kitchen too busy'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reject order'));
    await tester.pumpAndSettle();

    expect(find.text("Your role can't manage orders. Ask the business owner for access."), findsOneWidget);
  });

  testWidgets("the outlet's socket room refreshes the board at once: order:new chimes, order:status moves it", (tester) async {
    final backend = baseBackend();
    final app = await pumpMerchantApp(tester, backend);
    expect(app.socket.sentAs('outlet:subscribe'), [
      {'outletId': 'o1'},
    ]);
    final polls = backend.callsTo('GET', '/merchant/orders').length;

    backend.get('/merchant/orders', page([orderJson('n1', 'ORD-2001', 'PLACED')]));
    app.socket.receive('order:new', {'orderId': 'n1', 'orderNumber': 'ORD-2001', 'outletId': 'o1', 'status': 'PLACED', 'total': '511.00', 'placedAt': '2026-10-07T10:00:00Z'});
    await tester.pumpAndSettle();
    expect(backend.callsTo('GET', '/merchant/orders').length, polls + 2); // active + done today
    expect(app.alerter.alerts, [1]);
    expect(find.text('New order ORD-2001'), findsOneWidget);

    // another outlet's order is not ours
    app.socket.receive('order:new', {'orderId': 'x9', 'orderNumber': 'ORD-9', 'outletId': 'o2', 'status': 'PLACED'});
    await tester.pumpAndSettle();
    expect(backend.callsTo('GET', '/merchant/orders').length, polls + 2);

    backend.get('/merchant/orders', page([orderJson('n1', 'ORD-2001', 'ACCEPTED')]));
    app.socket.receive('order:status', {'orderId': 'n1', 'orderNumber': 'ORD-2001', 'outletId': 'o1', 'status': 'ACCEPTED'});
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp(r'^New, 0\b')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^Preparing, 1\b')), findsOneWidget);
    expect(app.alerter.alerts, [1]);
  });
}
