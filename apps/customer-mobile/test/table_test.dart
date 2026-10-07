import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

FakeApi tableApi({required Reply Function() onOrder}) {
  return FakeApi()
    ..on('GET /qr/tok123456', {
      'table': {'id': 't-1', 'label': 'T4', 'seats': 4},
      'outlet': outletDetailJson(),
      'recommended': [],
      'categories': [
        {
          'id': 'c-1',
          'name': 'Starters',
          'description': null,
          'items': [
            {
              'id': 'i-tikka',
              'categoryId': 'c-1',
              'name': 'Paneer Tikka',
              'description': null,
              'imageUrl': null,
              'price': '289',
              'compareAtPrice': null,
              'isVeg': true,
              'isAvailable': true,
              'isRecommended': true,
              'tags': [],
              'spiceLevel': 2,
              'variants': [],
              'addonGroups': [],
            },
          ],
        },
      ],
    })
    ..onCall('POST /qr/tok123456/orders', (_) => onOrder());
}

void main() {
  testWidgets('table ordering sends the local cart to the kitchen, paying at the counter', (tester) async {
    final api = tableApi(onOrder: () => (201, {
          'order': {'id': 'ord-9', 'orderNumber': 'ORD-261007-00050', 'total': '303.45'},
          'payment': null,
        }));
    final h = await pumpApp(tester, api, location: '/t/tok123456');

    expect(textContaining('Table T4'), findsOneWidget);
    await tester.tapAndSettle(find.byKey(const Key('table-add-i-tikka')));
    await tester.tapAndSettle(find.byTooltip('Add one more Paneer Tikka'));
    expect(find.text('2 items · ₹578'), findsOneWidget);

    await tester.tapAndSettle(find.byKey(const Key('review-table-order')));
    await tester.enterText(find.widgetWithText(TextField, 'Your name'), 'Asha');
    await tester.tapAndSettle(find.byKey(const Key('send-to-kitchen')));

    final call = api.callsTo('POST /qr/tok123456/orders').single;
    expect(call.data, {
      'items': [
        {'menuItemId': 'i-tikka', 'quantity': 2},
      ],
      'customerName': 'Asha',
      'payAtCounter': true,
    });
    expect(call.headers['idempotency-key'], isNotEmpty);
    expect(find.text('ORD-261007-00050 sent to the kitchen'), findsOneWidget);
    expect(find.text('₹303.45 to pay at the counter'), findsOneWidget);
    // the table's orders survive a restart
    expect(h.store.values['fg.table.tok123456'], contains('ORD-261007-00050'));
  });

  testWidgets('a closed kitchen answers 409 OUTLET_CLOSED and the message is shown', (tester) async {
    final api = tableApi(onOrder: () => (409, {'statusCode': 409, 'code': 'OUTLET_CLOSED', 'message': 'The kitchen is closed right now'}));
    await pumpApp(tester, api, location: '/t/tok123456');

    await tester.tapAndSettle(find.byKey(const Key('table-add-i-tikka')));
    await tester.tapAndSettle(find.byKey(const Key('review-table-order')));
    await tester.tapAndSettle(find.byKey(const Key('send-to-kitchen')));

    // inline in the sheet and as a snackbar
    expect(find.text('The kitchen is closed right now'), findsNWidgets(2));
    expect(find.byKey(const Key('send-to-kitchen')), findsOneWidget);
  });

  testWidgets('paying now needs sign-in', (tester) async {
    final api = tableApi(onOrder: () => (500, null));
    await pumpApp(tester, api, location: '/t/tok123456');

    await tester.tapAndSettle(find.byKey(const Key('table-add-i-tikka')));
    await tester.tapAndSettle(find.byKey(const Key('review-table-order')));

    expect(find.text('Sign in to pay online'), findsOneWidget);
    final payNow = tester.widget<RadioListTile<bool>>(find.widgetWithText(RadioListTile<bool>, 'Pay now with UPI or card'));
    expect(payNow.enabled, isFalse);
  });

  testWidgets('an unknown table code says so', (tester) async {
    final api = FakeApi();
    await pumpApp(tester, api, location: '/t/nope-nope');

    expect(find.text("This table code isn't active"), findsOneWidget);
    expect(find.text('Ask the staff for a fresh QR code.'), findsOneWidget);
  });
}
