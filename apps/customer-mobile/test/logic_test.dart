import 'package:customer_mobile/src/app/router.dart';
import 'package:customer_mobile/src/common/hours.dart';
import 'package:customer_mobile/src/common/links.dart';
import 'package:customer_mobile/src/outlet/models.dart';
import 'package:customer_mobile/src/table/table_cart.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'support.dart';

void main() {
  test('banner and push deep links map to app routes', () {
    expect(appRoute('foodgrid://offers/WELCOME50'), '/cart?coupon=WELCOME50');
    expect(appRoute('foodgrid://collections/south-indian'), '/search?q=south+indian');
    expect(appRoute('foodgrid://outlets/spice-garden-koramangala'), '/outlets/spice-garden-koramangala');
    expect(appRoute('foodgrid://orders/abc'), '/orders/abc');
    expect(appRoute('foodgrid://membership'), '/membership');
    expect(appRoute('https://example.com'), isNull);
    expect(appRoute(null), isNull);
  });

  test('table tokens come from QR links or bare codes', () {
    expect(parseTableToken('https://foodgrid.in/t/OJLDvPvsvl4BgWGt'), 'OJLDvPvsvl4BgWGt');
    expect(parseTableToken('http://localhost:3000/t/abc_DEF-123?x=1'), 'abc_DEF-123');
    expect(parseTableToken('  OJLDvPvsvl4BgWGt '), 'OJLDvPvsvl4BgWGt');
    expect(parseTableToken('https://foodgrid.in/r/some-outlet'), isNull);
    expect(parseTableToken('no spaces allowed'), isNull);
    expect(parseTableToken(''), isNull);
  });

  test('next opening is computed in IST', () {
    final hours = [for (var d = 0; d < 7; d++) OpeningHours(day: d, open: '11:30', close: '23:30')];
    // 02:39 IST on a Wednesday → later today
    expect(nextOpening(hours, now: DateTime.utc(2026, 10, 6, 21, 9)), 'Opens 11:30 am');
    // 23:45 IST → tomorrow
    expect(nextOpening(hours, now: DateTime.utc(2026, 10, 7, 18, 15)), 'Opens tomorrow 11:30 am');
    // only Mondays, asked on a Wednesday
    expect(nextOpening([const OpeningHours(day: 1, open: '09:00', close: '17:00')], now: DateTime.utc(2026, 10, 7, 6)), 'Opens Mon 9 am');
    expect(nextOpening(const []), isNull);
  });

  test('unit price adds the variant delta and add-ons', () {
    const item = MenuItem(id: 'i', name: 'Margherita', price: 249, variants: [
      Variant(id: 'reg', name: 'Regular', isDefault: true),
      Variant(id: 'med', name: 'Medium', priceDelta: 150),
    ], addonGroups: [
      AddonGroup(id: 'g', name: 'Toppings', maxSelect: 3, addons: [Addon(id: 'cheese', name: 'Cheese', price: 60), Addon(id: 'olive', name: 'Olive', price: 40)]),
    ]);
    expect(item.customisable, isTrue);
    expect(item.defaultVariant?.id, 'reg');
    expect(item.unitPrice(variantId: 'med', addonIds: ['cheese', 'olive']), 499);
  });

  test('private pages redirect to sign-in; splash waits for the session', () {
    final signedOut = const AsyncData<Session?>(null);
    expect(sessionRedirect(signedOut, Uri.parse('/cart?coupon=X')), '/login?from=%2Fcart%3Fcoupon%3DX');
    expect(sessionRedirect(signedOut, Uri.parse('/orders/o-1')), startsWith('/login?from='));
    expect(sessionRedirect(signedOut, Uri.parse('/outlets/x')), isNull);
    expect(sessionRedirect(signedOut, Uri.parse('/t/token')), isNull);
    expect(sessionRedirect(const AsyncLoading<Session?>(), Uri.parse('/wallet')), '/splash?from=%2Fwallet');
    expect(sessionRedirect(signedOut, Uri.parse('/splash?from=%2Foutlets%2Fx')), '/outlets/x');
  });

  testWidgets('a signed-out customer opening the cart is asked to sign in', (tester) async {
    await pumpApp(tester, FakeApi(), location: '/cart');
    expect(find.text('Sign in to FoodGrid'), findsOneWidget);
    expect(find.text('Mobile number'), findsOneWidget);
  });
}
