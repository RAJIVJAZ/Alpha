import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'support.dart';

FakeAdapter otpBackend() => routes({
      'POST /auth/otp/request': (_) => {'phone': '+91******0001', 'resendAfterSeconds': 30, 'devCode': '123456'},
    });

Future<MemoryTokenStore> pumpLogin(WidgetTester tester, FakeAdapter backend, Widget login) async {
  final tokens = MemoryTokenStore();
  await tester.pumpWidget(ProviderScope(
    retry: (_, _) => null,
    overrides: [
      appConfigProvider.overrideWithValue(testConfig),
      tokenStoreProvider.overrideWithValue(tokens),
      apiClientProvider.overrideWithValue(fakeClient(backend, tokens)),
    ],
    child: MaterialApp(home: login),
  ));
  await tester.pumpAndSettle();
  return tokens;
}

Future<void> requestCode(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField), '98450 00001');
  await tester.tap(find.text('Send code'));
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
}

FakeAdapter signInBackend({List<Map<String, dynamic>> memberships = const []}) => routes({
      'POST /auth/otp/request': (_) => {'phone': '+91******0001', 'resendAfterSeconds': 30},
      'POST /auth/otp/verify': (_) => {
            'tokens': {'accessToken': liveToken(), 'refreshToken': 'r1'},
          },
      'GET /auth/me': (_) => {'id': 'u1', 'name': 'Rohit', 'roles': ['CUSTOMER'], 'memberships': memberships},
      'POST /auth/logout': (_) => {'ok': true},
    });

Future<void> verify(WidgetTester tester) async {
  await requestCode(tester);
  await tester.enterText(find.byType(TextField), '123456');
  await tester.tap(find.text('Verify and sign in'));
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 10));
  }
}

void main() {
  testWidgets('the change-number / resend row wraps on a 320 px phone at 200% text', (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await pumpLogin(tester, otpBackend(), const LoginScreen(title: 'Sign in'));
    await requestCode(tester);

    // a Row here overflowed (and failed this test with a RenderFlex error)
    expect(find.text('Change number'), findsOneWidget);
    expect(find.text('Resend in 30s'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the async authorize hook sees the memberships and can refuse the account', (tester) async {
    final backend = signInBackend();
    final seen = <SessionUser>[];
    final tokens = await pumpLogin(
      tester,
      backend,
      LoginScreen(
        title: 'Sign in',
        authorizeUser: (user) async {
          seen.add(user);
          return user.memberships.isEmpty ? 'No business on this account.' : null;
        },
      ),
    );
    await verify(tester);

    expect(seen.single.id, 'u1');
    expect(find.text('No business on this account.'), findsOneWidget);
    expect(backend.calls.where((c) => c.path == '/auth/logout'), hasLength(1));
    expect(await tokens.read(), isNull);
  });

  testWidgets('a sign-in loads the session and calls onSignedIn', (tester) async {
    final backend = signInBackend(memberships: [
      {'tenantId': 't1', 'tenantName': 'Spice Garden', 'tenantType': 'RESTAURANT', 'tenantStatus': 'ACTIVE', 'role': 'OWNER', 'outletIds': ['o1']},
    ]);
    Session? signedIn;
    await pumpLogin(
      tester,
      backend,
      LoginScreen(
        title: 'Sign in',
        authorize: (claims) => null,
        authorizeUser: (user) async => null,
        onSignedIn: (s) => signedIn = s,
      ),
    );
    await verify(tester);

    expect(signedIn?.claims.sub, 'u1');
    final m = signedIn!.user.memberships.single;
    expect(m.tenantStatus, 'ACTIVE');
    expect(m.outletIds, ['o1']);
  });

  testWidgets('the synchronous claims check still refuses before auth/me', (tester) async {
    final backend = signInBackend();
    await pumpLogin(tester, backend, LoginScreen(title: 'Sign in', authorize: (claims) => claims.hasRole('RIDER') ? null : 'Riders only.'));
    await verify(tester);

    expect(find.text('Riders only.'), findsOneWidget);
    expect(backend.calls.where((c) => c.path == '/auth/me'), isEmpty);
  });

  testWidgets('a notice and a close button are optional', (tester) async {
    var closed = false;
    await pumpLogin(tester, otpBackend(), LoginScreen(title: 'Sign in', notice: 'You were signed out.', onClose: () => closed = true));

    expect(find.text('You were signed out.'), findsOneWidget);
    await tester.tap(find.byTooltip('Close'));
    expect(closed, isTrue);
  });
}
