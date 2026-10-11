import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:merchant_mobile/features/auth/authorize.dart';

import 'helpers.dart';

const _memberships = [
  {'tenantId': 't1', 'tenantName': 'Spice Garden', 'tenantType': 'RESTAURANT', 'role': 'OWNER'},
  {'tenantId': 't2', 'tenantName': 'Momo Wagon', 'tenantType': 'FOOD_CART', 'role': 'MANAGER'},
  {'tenantId': 't3', 'tenantName': 'Cowberry Dairy', 'tenantType': 'SUPPLIER', 'role': 'OWNER'},
];

/// A token without a business, as auth-service issues for several memberships.
final _noTenantToken = jwt({'name': 'Rohit Malhotra'});

void main() {
  test('login accepts restaurant, food cart and business-less tokens only', () {
    expect(authorizeMerchant(Claims.fromToken(merchantToken())!), isNull);
    expect(authorizeMerchant(Claims.fromToken(merchantToken(tenantType: 'FOOD_CART'))!), isNull);
    expect(authorizeMerchant(Claims.fromToken(_noTenantToken)!), isNull);
    expect(authorizeMerchant(Claims.fromToken(merchantToken(tenantType: 'SUPPLIER'))!), contains('supplier account'));
  });

  test('a rejected business is not offered', () {
    final rejected = Membership.fromJson({..._memberships[0], 'tenantStatus': 'REJECTED'});
    final pending = Membership.fromJson({..._memberships[1], 'tenantStatus': 'PENDING_APPROVAL'});
    expect(eligibleMemberships([rejected, pending]).map((m) => m.tenantId), ['t2']);
  });

  testWidgets('the picker lists eligible businesses and switches with switch-tenant', (tester) async {
    final backend = baseBackend(user: userJson(memberships: [for (final m in _memberships) {...m}]));
    final switched = merchantToken(tenantId: 't2', tenantType: 'FOOD_CART', role: 'MANAGER');
    // the login shape, with the refresh token rotated into the same session
    backend.post('/auth/switch-tenant', {
      'tokens': {'accessToken': switched, 'refreshToken': 'refresh-2', 'expiresIn': 900, 'tokenType': 'Bearer'},
      'user': userJson(memberships: [for (final m in _memberships) {...m}]),
    });
    backend.get('/merchant/outlets', [outletJson(id: 'c1', name: 'Momo Wagon - Koramangala', type: 'FOOD_CART')]);
    final app = await pumpMerchantApp(tester, backend, accessToken: _noTenantToken);

    expect(find.text('Choose business'), findsOneWidget);
    expect(find.text('Spice Garden'), findsOneWidget);
    expect(find.text('Momo Wagon'), findsOneWidget);
    expect(find.text('Cowberry Dairy'), findsNothing); // suppliers use the web dashboard
    expect(backend.callsTo('GET', '/merchant/outlets'), isEmpty); // nothing merchant-side before a business is chosen

    await tester.tap(find.text('Momo Wagon'));
    await tester.pumpAndSettle();

    expect(backend.lastBody('POST', '/auth/switch-tenant'), {'tenantId': 't2'});
    final tokens = await app.tokens.read();
    expect(tokens!.accessToken, switched);
    expect(tokens.refreshToken, 'refresh-2');
    // session reloaded with the new business; its only outlet opens straight away
    expect(backend.callsTo('GET', '/auth/me').length, greaterThanOrEqualTo(2));
    expect(find.text('Momo Wagon - Koramangala'), findsOneWidget);
    expect(find.text('Counter'), findsOneWidget); // managers bill at the counter
  });

  testWidgets('a single eligible business opens automatically', (tester) async {
    final backend = baseBackend(user: userJson(memberships: [{..._memberships[0]}, {..._memberships[2]}]));
    // an older auth-service: a bare access token, the refresh token kept
    backend.post('/auth/switch-tenant', {'accessToken': merchantToken(), 'expiresIn': 900, 'tokenType': 'Bearer'});
    await pumpMerchantApp(tester, backend, accessToken: _noTenantToken);

    expect(backend.lastBody('POST', '/auth/switch-tenant'), {'tenantId': 't1'});
    expect(find.text('Spice Garden - Indiranagar'), findsOneWidget);
  });

  testWidgets('without a restaurant or food cart the user is signed out with a reason', (tester) async {
    final backend = baseBackend(user: userJson(memberships: [{..._memberships[2]}]));
    backend.post('/auth/logout', {});
    final app = await pumpMerchantApp(tester, backend, accessToken: _noTenantToken);

    expect(backend.callsTo('POST', '/auth/switch-tenant'), isEmpty);
    expect(await app.tokens.read(), isNull);
    expect(find.text(notMerchantMessage), findsOneWidget);
  });

  testWidgets('several outlets ask which one, and the choice is remembered', (tester) async {
    final backend = baseBackend(outlets: [outletJson(), outletJson(id: 'o2', name: 'Spice Garden - Koramangala', isOpen: false)]);
    await pumpMerchantApp(tester, backend);

    expect(find.text('Choose outlet'), findsOneWidget);
    await tester.tap(find.text('Spice Garden - Koramangala'));
    await tester.pumpAndSettle();
    expect(find.text('Spice Garden - Koramangala'), findsOneWidget); // orders app bar
    expect(find.text('Closed: not taking new orders'), findsOneWidget);
    final orderQueries = backend.callsTo('GET', '/merchant/orders');
    expect(orderQueries.last.queryParameters['outletId'], 'o2');
  });

  testWidgets('sign-in refuses an account with no restaurant or food cart', (tester) async {
    final backend = baseBackend(user: userJson(memberships: [{..._memberships[2]}]));
    backend.post('/auth/password', {
      'tokens': {'accessToken': _noTenantToken, 'refreshToken': 'r-9'},
    });
    backend.post('/auth/logout', {});
    final app = await pumpMerchantApp(tester, backend);
    await app.tokens.clear();
    await app.container.read(sessionProvider.notifier).signOut();
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Email'), 'owner@cowberry.demo');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'FoodGrid@2026');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.text(notMerchantMessage), findsOneWidget);
    expect(await app.tokens.read(), isNull);
    expect(find.text('Choose business'), findsNothing);
  });

  testWidgets('a pending invitation can be accepted from the picker', (tester) async {
    final invited = {..._memberships[0], 'role': 'CHEF'};
    final backend = baseBackend(user: userJson(memberships: []));
    backend.get('/tenants/invites', [
      {'id': 'm1', 'role': 'CHEF', 'tenant': {'id': 't1', 'name': 'Spice Garden', 'type': 'RESTAURANT', 'city': 'Bengaluru'}},
      {'id': 'm9', 'role': 'OWNER', 'tenant': {'id': 't3', 'name': 'Cowberry Dairy', 'type': 'SUPPLIER', 'city': null}},
    ]);
    backend.post('/tenants/invites/m1/accept', {'id': 'm1', 'status': 'ACTIVE'});
    backend.post('/auth/switch-tenant', {
      'tokens': {'accessToken': merchantToken(role: 'CHEF'), 'refreshToken': 'refresh-2', 'expiresIn': 900, 'tokenType': 'Bearer'},
      'user': userJson(memberships: [invited]),
    });
    final app = await pumpMerchantApp(tester, backend, accessToken: _noTenantToken);

    expect(find.text('You have been invited to join'), findsOneWidget);
    expect(find.text('Spice Garden'), findsOneWidget);
    expect(find.text('Cowberry Dairy'), findsNothing); // supplier invites belong to the web dashboard
    expect(await app.tokens.read(), isNotNull); // not signed out while an invitation waits

    backend.get('/auth/me', userJson(memberships: [invited]));
    await tester.tap(find.text('Accept'));
    await tester.pumpAndSettle();

    expect(backend.callsTo('POST', '/tenants/invites/m1/accept'), hasLength(1));
    expect(backend.lastBody('POST', '/auth/switch-tenant'), {'tenantId': 't1'});
  });
}
