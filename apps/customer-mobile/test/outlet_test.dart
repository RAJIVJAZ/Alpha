import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

Map<String, dynamic> item(String id, String name, String price, {List<Map<String, dynamic>> variants = const [], List<Map<String, dynamic>> groups = const []}) => {
      'id': id,
      'categoryId': 'c-1',
      'name': name,
      'description': null,
      'imageUrl': null,
      'price': price,
      'compareAtPrice': null,
      'isVeg': true,
      'isAvailable': true,
      'isRecommended': false,
      'tags': ['bestseller'],
      'spiceLevel': null,
      'variants': variants,
      'addonGroups': groups,
    };

final margherita = item('i-margherita', 'Margherita', '249', variants: [
  {'id': 'v-reg', 'name': 'Regular (7")', 'priceDelta': '0', 'isDefault': true, 'isAvailable': true},
  {'id': 'v-med', 'name': 'Medium (10")', 'priceDelta': '150', 'isDefault': false, 'isAvailable': true},
], groups: [
  {
    'id': 'g-top',
    'name': 'Extra toppings',
    'minSelect': 0,
    'maxSelect': 3,
    'addons': [
      {'id': 'a-cheese', 'name': 'Extra Cheese', 'price': '60', 'isVeg': true, 'isAvailable': true},
      {'id': 'a-olive', 'name': 'Black Olives', 'price': '40', 'isVeg': true, 'isAvailable': true},
    ],
  },
]);

FakeApi menuApi({bool open = true}) {
  return FakeApi()
    ..on('GET /outlets/pizza-republic/menu', {
      'outlet': outletDetailJson(open: open),
      'recommended': [],
      'categories': [
        {
          'id': 'c-1',
          'name': 'Pizzas & sides',
          'description': null,
          'items': [item('i-garlic', 'Garlic Bread', '129'), margherita],
        },
      ],
    })
    ..on('GET /outlets/o-1/subscription-plans', [])
    ..on('GET /coupons', [])
    ..on('GET /users/me/addresses', [])
    ..on('GET /recommendations/dishes', [])
    ..on('GET /cart', cartJson());
}

void main() {
  testWidgets('adding a plain dish posts the menu item to the cart', (tester) async {
    final api = menuApi()..on('POST /cart/items', cartJson(lines: [lineJson(itemId: 'i-garlic', name: 'Garlic Bread', unit: '129.00', variant: null, addons: [])]));
    await pumpApp(tester, api, location: '/outlets/pizza-republic', signedIn: true);

    expect(find.text('Pizza Republic - HSR Layout'), findsWidgets);
    await tester.tapAndSettle(find.byKey(const Key('add-i-garlic')));

    expect(api.lastBody('POST /cart/items'), {'menuItemId': 'i-garlic', 'quantity': 1});
    // the row turns into a stepper and the cart bar appears
    expect(find.bySemanticsLabel('1 in cart'), findsOneWidget);
    expect(find.text('1 item · ₹129'), findsOneWidget);
  });

  testWidgets('customising a dish sends its variant and add-ons with a live price', (tester) async {
    final api = menuApi()..on('POST /cart/items', cartJson(lines: [lineJson()]));
    await pumpApp(tester, api, location: '/outlets/pizza-republic', signedIn: true);

    await tester.tapAndSettle(find.byKey(const Key('add-i-margherita')));
    expect(find.text('Add · ₹249'), findsOneWidget);

    await tester.tapAndSettle(find.byKey(const Key('variant-v-med')));
    await tester.tapAndSettle(find.byKey(const Key('addon-a-cheese')));
    expect(find.text('Add · ₹459'), findsOneWidget);

    await tester.tapAndSettle(find.byKey(const Key('customise-add')));
    expect(api.lastBody('POST /cart/items'), {
      'menuItemId': 'i-margherita',
      'quantity': 1,
      'variantId': 'v-med',
      'addonIds': ['a-cheese'],
    });
    expect(find.byKey(const Key('customise-add')), findsNothing);
  });

  testWidgets('a cart from another outlet asks first, then retries with replace', (tester) async {
    var attempts = 0;
    final api = menuApi()
      ..onCall('POST /cart/items', (RequestOptions o) {
        attempts++;
        return attempts == 1
            ? (409, {'statusCode': 409, 'code': 'CART_OUTLET_MISMATCH', 'message': 'Your cart has items from another outlet. Replace them?'})
            : (200, cartJson(lines: [lineJson(itemId: 'i-garlic', name: 'Garlic Bread', unit: '129.00', variant: null, addons: [])]));
      });
    await pumpApp(tester, api, location: '/outlets/pizza-republic', signedIn: true);

    // the row keeps its spinner while the dialog asks, so pump frames instead of settling
    await tester.tap(find.byKey(const Key('add-i-garlic')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Start a new cart?'), findsOneWidget);
    await tester.tap(find.text('Start new cart'));
    await tester.pumpAndSettle();

    final bodies = [for (final c in api.callsTo('POST /cart/items')) c.data];
    expect(bodies, [
      {'menuItemId': 'i-garlic', 'quantity': 1},
      {'menuItemId': 'i-garlic', 'quantity': 1, 'replace': true},
    ]);
  });

  testWidgets('signed-out customers are sent to sign in before adding', (tester) async {
    final api = menuApi();
    await pumpApp(tester, api, location: '/outlets/pizza-republic');

    await tester.tapAndSettle(find.byKey(const Key('add-i-garlic')));

    expect(find.text('Sign in to FoodGrid'), findsOneWidget);
    expect(api.callsTo('POST /cart/items'), isEmpty);
  });

  testWidgets('a closed outlet shows when it opens and disables adding', (tester) async {
    final api = menuApi(open: false);
    await pumpApp(tester, api, location: '/outlets/pizza-republic', signedIn: true);

    expect(find.text('Closed now'), findsOneWidget);
    expect(textContaining('Opens'), findsOneWidget);
    final add = tester.widget<OutlinedButton>(find.byKey(const Key('add-i-garlic')));
    expect(add.onPressed, isNull);
  });

  testWidgets('suggestions say whether they are customisable: plain ones add at once, others open the sheet', (tester) async {
    final api = menuApi()
      ..on('GET /cart', cartJson(lines: [lineJson(itemId: 'i-garlic', name: 'Garlic Bread', unit: '129.00', variant: null, addons: [])]))
      // suggestions carry no variants or add-ons, only the flag
      ..on('GET /recommendations/dishes', [
        {...item('i-coke', 'Coke (300 ml)', '60'), 'customisable': false},
        {...item('i-margherita', 'Margherita', '249'), 'customisable': true},
      ])
      ..on('POST /cart/items', cartJson(lines: [lineJson(itemId: 'i-garlic', name: 'Garlic Bread', unit: '129.00', variant: null, addons: [])]));
    await pumpApp(tester, api, location: '/outlets/pizza-republic', signedIn: true);

    final card = find.ancestor(of: find.text('Goes well with your order'), matching: find.byType(Card));
    final adds = find.descendant(of: card, matching: find.widgetWithText(OutlinedButton, 'Add'));
    expect(adds, findsNWidgets(2));

    // not on the menu at all: the flag alone decides
    await tester.tapAndSettle(adds.at(0));
    expect(api.lastBody('POST /cart/items'), {'menuItemId': 'i-coke', 'quantity': 1});

    await tester.tapAndSettle(adds.at(1));
    expect(find.byKey(const Key('variant-v-med')), findsOneWidget);
    expect(find.text('Add · ₹249'), findsOneWidget);
  });
}
