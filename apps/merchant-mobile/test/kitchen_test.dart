import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:merchant_mobile/features/kitchen/ticket.dart';

import 'helpers.dart';

Map<String, dynamic> _ticket(String id, int number, String status, int elapsedSeconds, {String station = 'MAIN'}) => {
      'id': id,
      'orderId': 'ord-$id',
      'orderNumber': 'ORD-$number',
      'ticketNumber': number,
      'station': station,
      'status': status,
      'orderType': 'DINE_IN',
      'createdAt': DateTime.now().toUtc().subtract(Duration(seconds: elapsedSeconds)).toIso8601String(),
      'elapsedSeconds': elapsedSeconds,
      'items': [
        {'name': 'Butter Chicken', 'quantity': 2, 'variant': 'Half', 'addons': ['Extra gravy'], 'notes': 'No cream'},
      ],
    };

void main() {
  test('ticket age follows the kitchen SLA', () {
    expect(TicketAge.of(5 * 60, 'QUEUED'), TicketAge.onTime);
    expect(TicketAge.of(13 * 60, 'IN_PROGRESS'), TicketAge.dueSoon);
    expect(TicketAge.of(21 * 60, 'QUEUED'), TicketAge.overdue);
    expect(TicketAge.of(40 * 60, 'READY'), TicketAge.onTime); // ready tickets are waiting, not late
    expect(elapsedLabel(65), '1:05');
    expect(elapsedLabel(3725), '1:02:05');
  });

  testWidgets('the KDS shows overdue tickets and bumps a ready one', (tester) async {
    final backend = baseBackend();
    backend.get('/kds/tickets', [
      _ticket('k1', 12, 'READY', 300, station: 'TANDOOR'),
      _ticket('k2', 13, 'QUEUED', 25 * 60),
      _ticket('k3', 14, 'QUEUED', 60),
    ]);
    backend.post('/kds/tickets/k1/bump', {'id': 'k1', 'status': 'SERVED'});
    await pumpMerchantApp(tester, backend, accessToken: merchantToken(role: 'CHEF'));
    await openTab(tester, 'Kitchen');

    final query = backend.callsTo('GET', '/kds/tickets').last.queryParameters;
    expect(query['outletId'], 'o1');
    expect(query.containsKey('station'), isFalse);

    // queued tickets: oldest first, the late one says so with icon and word
    expect(find.text('#13'), findsOneWidget);
    expect(find.text('Overdue'), findsOneWidget);
    expect(find.text('On time'), findsOneWidget);
    expect(find.textContaining('Half · Extra gravy'), findsWidgets);
    expect(find.text('Note: No cream'), findsWidgets);
    expect(tester.getTopLeft(find.text('#13')).dy, lessThan(tester.getTopLeft(find.text('#14')).dy));

    await tester.tap(find.bySemanticsLabel(RegExp(r'^Ready, 1 tickets')));
    await tester.pumpAndSettle();
    expect(find.text('#12'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Served'));
    await tester.pumpAndSettle();

    expect(backend.callsTo('POST', '/kds/tickets/k1/bump'), hasLength(1));
    expect(backend.callsTo('GET', '/kds/tickets').length, greaterThanOrEqualTo(2)); // refreshed after the bump

    // station filter goes to the API
    await tester.tap(find.widgetWithText(ChoiceChip, 'Tandoor'));
    await tester.pumpAndSettle();
    expect(backend.callsTo('GET', '/kds/tickets').last.queryParameters['station'], 'TANDOOR');
  });
}
