import 'package:flutter_test/flutter_test.dart';
import 'package:merchant_mobile/features/menu/menu_models.dart';
import 'package:merchant_mobile/features/pos/bill.dart';

import 'helpers.dart';

const _momos = MenuItem(
  id: 'm2',
  name: 'Veg Momos',
  price: 120,
  variants: [MenuVariant(id: 'v8', name: '8 pcs', priceDelta: 40, isDefault: true)],
  addonGroups: [
    MenuAddonGroup(id: 'g1', name: 'Dips', maxSelect: 2, addons: [MenuAddon(id: 'a1', name: 'Schezwan dip', price: 15), MenuAddon(id: 'a2', name: 'Mayo', price: 10)]),
  ],
);
const _chai = MenuItem(id: 'm1', name: 'Masala Chai', price: 49);

Map<String, dynamic> _menu() => {
      'id': 'c1',
      'name': 'Snacks',
      'isActive': true,
      'items': [
        {'id': 'm1', 'categoryId': 'c1', 'name': 'Masala Chai', 'price': '49', 'isVeg': true, 'isAvailable': true, 'kdsStation': 'MAIN', 'variants': [], 'addonGroups': []},
        {'id': 'm3', 'categoryId': 'c1', 'name': 'Bun Maska', 'price': '60', 'isVeg': true, 'isAvailable': true, 'kdsStation': 'MAIN', 'variants': [], 'addonGroups': []},
        {'id': 'm4', 'categoryId': 'c1', 'name': 'Samosa', 'price': '30', 'isVeg': true, 'isAvailable': false, 'kdsStation': 'MAIN', 'variants': [], 'addonGroups': []},
      ],
    };

void main() {
  group('bill', () {
    test('same item and options merge; options change the unit price', () {
      var bill = const Bill(idempotencyKey: 'k');
      bill = bill.add(_chai).add(_chai).add(_momos, variantId: 'v8', addonIds: ['a2', 'a1']).add(_momos, variantId: 'v8', addonIds: ['a1', 'a2']);
      expect(bill.lines, hasLength(2));
      expect(bill.lines[0].quantity, 2);
      expect(bill.lines[1].unitPrice, 120 + 40 + 15 + 10);
      expect(bill.lines[1].label, 'Veg Momos · 8 pcs · Schezwan dip · Mayo');
      expect(bill.count, 4);
      expect(bill.subtotal, 2 * 49 + 2 * 185);
      expect(bill.toItemsJson(), [
        {'menuItemId': 'm1', 'quantity': 2},
        {'menuItemId': 'm2', 'quantity': 2, 'variantId': 'v8', 'addonIds': ['a1', 'a2']},
      ]);
    });

    test('quantities step down to removal; discounts never go below zero', () {
      var bill = const Bill(idempotencyKey: 'k').add(_chai);
      expect(bill.totalAfter(20), 29);
      expect(bill.totalAfter(500), 0);
      bill = bill.bump(bill.lines.first.key, -1);
      expect(bill.isEmpty, isTrue);
    });
  });

  testWidgets('a counter bill totals up, charges with an idempotency key and shows the GST receipt', (tester) async {
    final backend = baseBackend(
      user: userJson(memberships: [
        {'tenantId': 't2', 'tenantName': 'Momo Wagon', 'tenantType': 'FOOD_CART', 'role': 'CASHIER'},
      ]),
      outlets: [outletJson(id: 'o1', name: 'Momo Wagon - Koramangala', type: 'FOOD_CART')],
    );
    backend.get('/merchant/outlets/o1/menu', [_menu()]);
    backend.post('/pos/orders', {
      'order': {'id': 'new', 'orderNumber': 'ORD-261007-00012'},
      'receipt': {
        'orderNumber': 'ORD-261007-00012',
        'outlet': {'name': 'Momo Wagon - Koramangala', 'address': '80 Feet Road', 'gstin': '29AAJCM1234P1ZI', 'fssai': '11223344556677'},
        'items': [
          {'name': 'Masala Chai', 'qty': 2, 'rate': '49', 'amount': '98'},
          {'name': 'Bun Maska', 'qty': 1, 'rate': '60', 'amount': '60'},
        ],
        'subtotal': '158',
        'discount': '0',
        'packaging': '25',
        'cgst': '4.58',
        'sgst': '4.58',
        'roundOff': '-0.16',
        'total': '192',
        'paymentMethod': 'CASH',
        'issuedAt': '2026-10-07T08:30:00.000Z',
      },
    }, status: 201);
    await pumpMerchantApp(tester, backend, accessToken: merchantToken(tenantId: 't2', tenantType: 'FOOD_CART', role: 'CASHIER'));
    await openTab(tester, 'Counter');

    await tester.tap(find.text('Masala Chai'));
    await tester.tap(find.text('Masala Chai'));
    await tester.tap(find.text('Bun Maska'));
    await tester.tap(find.text('Samosa')); // out of stock: ignored
    await tester.pumpAndSettle();
    expect(find.text('Review bill · ₹158.00'), findsOneWidget);
    expect(find.text('3 items'), findsOneWidget);

    await tester.tap(find.text('Review bill · ₹158.00'));
    await tester.pumpAndSettle();
    expect(find.text('Bill total'), findsOneWidget);
    expect(find.text('₹158.00'), findsWidgets);
    expect(find.text('GST and ₹25 packaging are added on the receipt.'), findsOneWidget);

    await tester.tap(find.text('Cash'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Charge · Cash'));
    await tester.pumpAndSettle();

    final call = backend.callsTo('POST', '/pos/orders').single;
    expect(call.headers['idempotency-key'], isA<String>().having((k) => k.length, 'length', greaterThan(10)));
    expect(call.data, {
      'outletId': 'o1',
      'items': [
        {'menuItemId': 'm1', 'quantity': 2},
        {'menuItemId': 'm3', 'quantity': 1},
      ],
      'paymentMethod': 'CASH',
      'orderType': 'TAKEAWAY',
    });

    // receipt: GST split and packaging as the server computed them
    expect(find.text('Paid · ORD-261007-00012'), findsOneWidget);
    expect(find.text('GSTIN 29AAJCM1234P1ZI'), findsOneWidget);
    expect(find.text('CGST'), findsOneWidget);
    expect(find.text('SGST'), findsOneWidget);
    expect(find.text('4.58'), findsNWidgets(2));
    expect(find.text('Packaging'), findsOneWidget);
    expect(find.text('25.00'), findsOneWidget);
    expect(find.text('Total (Cash)'), findsOneWidget);
    expect(find.text('₹192.00'), findsOneWidget);

    // next bill starts empty with a fresh key
    await tester.tap(find.text('Next bill'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Review bill'), findsNothing);
  });
}
