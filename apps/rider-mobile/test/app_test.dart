import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:rider_mobile/src/duty/rider_events.dart';

import 'helpers.dart';

Map<String, dynamic> meJson({List<String> roles = const ['RIDER']}) => {'id': 'u-rider', 'name': 'Ishaan Bhat', 'phone': '+919740010101', 'roles': roles, 'memberships': []};

Future<TestRig> signedInRig() async {
  final rig = TestRig();
  await rig.tokens.write(Tokens(riderToken(), 'refresh-1'));
  rig.api.on('GET', '/auth/me', (_) => meJson());
  dutyRoutes(rig.api, current: () => [deliveryJson(status: 'AT_PICKUP')]);
  rig.api.on('GET', '/riders/me/deliveries', (_) => {
        'data': [
          {...deliveryJson(id: 'old1', status: 'DELIVERED'), 'deliveredAt': '2026-10-06T17:51:00.000Z'},
        ],
        'meta': {'page': 1, 'pageSize': 30, 'total': 710, 'totalPages': 24},
      });
  return rig;
}

void main() {
  testWidgets('without a session the app opens on rider sign-in', (tester) async {
    final rig = TestRig();
    await rig.pumpApp(tester, width: 600);

    expect(find.text('FoodGrid Rider'), findsOneWidget);
    expect(find.text('Send code'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
  });

  testWidgets('a number without the RIDER role is refused and signed straight out', (tester) async {
    final rig = TestRig();
    rig.api
      ..on('POST', '/auth/otp/request', (_) => {'phone': '+91******0199', 'resendAfterSeconds': 30, 'devCode': '123456'})
      ..on('POST', '/auth/otp/verify', (_) => {
            'tokens': {'accessToken': riderToken(roles: ['CUSTOMER']), 'refreshToken': 'r1'},
            'user': meJson(roles: ['CUSTOMER']),
          })
      ..on('POST', '/auth/logout', (_) => {'ok': true});

    await rig.pumpApp(tester, width: 600);
    await tester.enterText(find.byType(TextField), '9740010199');
    await tester.tap(find.text('Send code'));
    await settle(tester);
    expect(find.text('Development code: 123456'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '123456');
    await tester.tap(find.text('Verify and sign in'));
    await settle(tester);

    expect(find.text('This number is not registered as a FoodGrid rider.'), findsOneWidget);
    expect(rig.api.called('POST', '/auth/logout'), hasLength(1));
    expect(await rig.tokens.read(), isNull);
    expect(find.byType(NavigationBar), findsNothing);
  });

  testWidgets('a stored rider session lands on Duty with the five tabs', (tester) async {
    final rig = await signedInRig();
    await rig.pumpApp(tester);

    expect(find.byType(NavigationBar), findsOneWidget);
    for (final tab in ['Duty', 'Earnings', 'Performance', 'Demand', 'Trips']) {
      expect(find.descendant(of: find.byType(NavigationBar), matching: find.text(tab)), findsOneWidget);
    }
    expect(find.text('Hi, Ishaan'), findsOneWidget);
    expect(find.text('4.6 ★ · 710 deliveries'), findsOneWidget);
    expect(find.text('Order picked up'), findsOneWidget);

    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Trips')));
    await settle(tester);

    expect(find.text('710 deliveries'), findsOneWidget);
    expect(find.text('Spice Garden - Koramangala → Neha Singh'), findsOneWidget);
    expect(find.text('₹57.60'), findsOneWidget, reason: 'earning plus tip');
    expect(find.text('Delivered'), findsOneWidget);
    expect(find.textContaining(dateTime('2026-10-06T17:51:00.000Z')), findsOneWidget);
  });

  testWidgets('socket events refresh offers and tell the rider about cancellations', (tester) async {
    final rig = await signedInRig();
    var offered = false;
    rig.api.on('GET', '/riders/me/offers', (_) => offered ? [offerJson()] : []);
    await rig.pumpApp(tester);

    // on another tab, a new offer is announced with a way back to Duty
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Trips')));
    await settle(tester);
    offered = true;
    rig.events.add(RiderEvent('offer:new', {'deliveryId': 'd1', 'orderNumber': 'ORD-261007-00005'}));
    await settle(tester);
    expect(find.text('New order offer'), findsOneWidget);

    await tester.tap(find.text('View'));
    await settle(tester);
    expect(find.text('Earn ₹45.00'), findsOneWidget);

    rig.events.add(RiderEvent('delivery:cancelled', {'deliveryId': 'd1', 'orderNumber': 'ORD-261007-00005'}));
    await settle(tester);
    expect(find.text('Order ORD-261007-00005 was cancelled — no need to continue'), findsOneWidget);
  });

  testWidgets('signing out goes offline first and returns to sign-in', (tester) async {
    final rig = await signedInRig();
    rig.api
      ..on('GET', '/riders/me/deliveries/current', (_) => [])
      ..on('POST', '/riders/me/offline', (_) => {'online': false})
      ..on('POST', '/auth/logout', (_) => {'ok': true});
    await rig.pumpApp(tester, width: 600);

    await tester.tap(find.byTooltip('Sign out'));
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await settle(tester);

    expect(rig.api.postPaths(), containsAllInOrder(['/riders/me/offline', '/auth/logout']));
    expect(find.text('Send code'), findsOneWidget);
    expect(await rig.tokens.read(), isNull);
  });
}
