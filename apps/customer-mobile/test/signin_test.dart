import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

void main() {
  testWidgets('OTP sign-in from a guarded page continues to that page', (tester) async {
    final api = FakeApi()
      ..on('POST /auth/otp/request', {'phone': '+91******0001', 'resendAfterSeconds': 30, 'devCode': '123456'})
      ..on('POST /auth/otp/verify', {
        'tokens': {'accessToken': fakeJwt(), 'refreshToken': 'r-1'},
        'user': {'id': 'u-1', 'name': 'Aarav Sharma'},
      })
      ..on('GET /auth/me', {'id': 'u-1', 'name': 'Aarav Sharma', 'phone': '+919845000001', 'roles': ['CUSTOMER']})
      ..on('GET /users/me/addresses', [])
      ..on('GET /cart', cartJson());
    await pumpApp(tester, api, location: '/cart');

    expect(find.text('Sign in to FoodGrid'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Mobile number'), '98450 00001');
    await tester.tapAndSettle(find.text('Send code'));
    expect(api.lastBody('POST /auth/otp/request'), {'phone': '+919845000001'});
    expect(find.text('Development code: 123456'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '123456');
    await tester.tapAndSettle(find.text('Verify and sign in'));
    expect(api.lastBody('POST /auth/otp/verify'), {'phone': '+919845000001', 'code': '123456'});

    // back on the cart, now signed in
    expect(find.text('Your cart is empty'), findsOneWidget);
    expect(find.text('Sign in to FoodGrid'), findsNothing);
  });

  testWidgets('signing out from Account returns home as a guest', (tester) async {
    final api = FakeApi()
      ..on('GET /users/me', {'id': 'u-1', 'name': 'Aarav Sharma', 'phone': '+919845000001', 'email': 'a@example.com', 'referralCode': 'FGAARA100'})
      ..on('GET /users/me/addresses', [])
      ..on('GET /cart', cartJson())
      ..on('GET /notifications', {'data': [], 'unread': 0, 'meta': {'page': 1, 'totalPages': 1, 'total': 0}})
      ..on('POST /auth/logout', {'ok': true})
      ..on('GET /cms/banners', [])
      ..on('GET /recommendations/home', {'recommended': [], 'reorder': [], 'topRated': [], 'fastDelivery': []})
      ..on('GET /outlets/nearby', {'data': [], 'meta': {'page': 1, 'pageSize': 12, 'total': 0, 'totalPages': 1}});
    await pumpApp(tester, api, location: '/account', signedIn: true);

    expect(find.text('Aarav Sharma'), findsOneWidget);
    await tester.tapAndSettle(find.text('Sign out'));
    await tester.tapAndSettle(find.widgetWithText(FilledButton, 'Sign out'));

    expect(api.callsTo('POST /auth/logout'), hasLength(1));
    expect(find.text('Restaurants and food carts near you'), findsOneWidget);
    expect(find.byTooltip('Notifications'), findsNothing);
  });
}
