import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers.dart';

Map<String, dynamic> _item(String id, String name, String price, {bool available = true, bool veg = true}) => {
      'id': id,
      'categoryId': 'c1',
      'name': name,
      'description': null,
      'price': price,
      'isVeg': veg,
      'isAvailable': available,
      'isRecommended': false,
      'kdsStation': 'MAIN',
      'variants': [],
      'addonGroups': [],
    };

List<Map<String, dynamic>> menuJson() => [
      {
        'id': 'c1',
        'name': 'Starters',
        'isActive': true,
        'items': [_item('i1', 'Paneer Tikka', '289'), _item('i2', 'Chicken Tikka', '329', veg: false, available: false)],
      },
      {
        'id': 'c2',
        'name': 'Breads',
        'isActive': true,
        'items': [_item('i3', 'Butter Naan', '69')],
      },
    ];

void main() {
  testWidgets('switching a dish off posts bulk availability and updates the row', (tester) async {
    final backend = baseBackend();
    backend.get('/merchant/outlets/o1/menu', menuJson());
    backend.post('/merchant/items/availability', {'updated': 1});
    await pumpMerchantApp(tester, backend, accessToken: merchantToken(role: 'CHEF'));
    await openTab(tester, 'Menu');

    expect(find.text('3 dishes · 1 out of stock'), findsOneWidget);
    await tester.tap(find.widgetWithText(SwitchListTile, 'Paneer Tikka'));
    await tester.pumpAndSettle();

    expect(backend.lastBody('POST', '/merchant/items/availability'), {
      'itemIds': ['i1'],
      'isAvailable': false,
    });
    expect(find.text('3 dishes · 2 out of stock'), findsOneWidget);
    expect(find.text('Paneer Tikka marked out of stock'), findsOneWidget);
  });

  testWidgets('a refused change rolls back; search narrows the list', (tester) async {
    final backend = baseBackend();
    backend.get('/merchant/outlets/o1/menu', menuJson());
    backend.post('/merchant/items/availability', {'statusCode': 403, 'code': 'PERMISSION_DENIED', 'message': 'Missing permission', 'details': ['kds:operate']}, status: 403);
    await pumpMerchantApp(tester, backend, accessToken: merchantToken(role: 'CASHIER'));
    await openTab(tester, 'Menu');

    await tester.tap(find.widgetWithText(SwitchListTile, 'Butter Naan'));
    await tester.pumpAndSettle();
    expect(find.text("Your role can't run the kitchen display. Ask the owner or a manager."), findsOneWidget);
    expect(tester.widget<SwitchListTile>(find.widgetWithText(SwitchListTile, 'Butter Naan')).value, isTrue);

    await tester.enterText(find.widgetWithText(TextField, 'Search dishes'), 'tikka');
    await tester.pumpAndSettle();
    expect(find.text('Butter Naan'), findsNothing);
    expect(find.text('Paneer Tikka'), findsOneWidget);
    expect(find.text('Chicken Tikka'), findsOneWidget);
  });

  testWidgets('roles without kitchen access see stock but no switches', (tester) async {
    final backend = baseBackend();
    backend.get('/merchant/outlets/o1/menu', menuJson());
    await pumpMerchantApp(tester, backend, accessToken: merchantToken(role: 'ACCOUNTANT'));
    await openTab(tester, 'Menu');

    expect(find.byType(SwitchListTile), findsNothing);
    expect(find.text('Out of stock'), findsOneWidget);
    expect(find.text("Your role can view the menu but can't change stock."), findsOneWidget);
  });
}
