import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'support.dart';

class FakePushSource implements PushSource {
  FakePushSource(this.current);
  String? current;
  final refreshes = StreamController<String>.broadcast();
  final messages = StreamController<PushMessage>.broadcast();

  @override
  Future<String?> token() async => current;
  @override
  Stream<String> get tokenRefresh => refreshes.stream;
  @override
  Stream<PushMessage> get foregroundMessages => messages.stream;
}

/// The backend: auth plus device registrations, with the bearer each one carried.
FakeAdapter backend() => routes({
      'GET /auth/me': (_) => {'id': 'u1'},
      'POST /devices': (_) => {'ok': true},
      'DELETE /devices/tok-2': (_) => (204, null),
      'POST /auth/logout': (_) => (204, null),
    });

ProviderContainer container(FakeAdapter api, MemoryTokenStore tokens, PushSource push) {
  final c = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      appConfigProvider.overrideWithValue(testConfig),
      tokenStoreProvider.overrideWithValue(tokens),
      apiClientProvider.overrideWithValue(fakeClient(api, tokens)),
      pushSourceProvider.overrideWithValue(push),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

List<String> calls(FakeAdapter api) => [for (final o in api.calls) '${o.method} ${o.path}'];

void main() {
  test('registers the token after sign-in, again when it rotates, and removes it on sign-out', () async {
    final tokens = MemoryTokenStore()..write(Tokens(liveToken(), 'r1'));
    final api = backend();
    final push = FakePushSource('tok-1');
    final c = container(api, tokens, push);
    c.listen(pushRegistrationProvider, (_, _) {});
    await c.read(sessionProvider.future);

    expect(await c.read(pushRegistrationProvider.future), 'tok-1');
    final first = api.calls.singleWhere((o) => o.path == '/devices');
    expect(first.data, {'token': 'tok-1', 'platform': 'ANDROID', 'app': 'CUSTOMER'});
    expect(first.headers['authorization'], startsWith('Bearer '));

    push.refreshes.add('tok-2');
    await pumpEventQueue();
    expect(c.read(registeredPushTokenProvider), 'tok-2');
    expect([for (final o in api.calls.where((o) => o.path == '/devices')) (o.data as Map)['token']], ['tok-1', 'tok-2']);

    await c.read(sessionProvider.notifier).signOut();
    final out = calls(api).sublist(calls(api).indexOf('DELETE /devices/tok-2'));
    expect(out, ['DELETE /devices/tok-2', 'POST /auth/logout']);
    expect(api.calls.firstWhere((o) => o.method == 'DELETE').headers['authorization'], startsWith('Bearer '));
    expect(await c.read(pushRegistrationProvider.future), isNull);
    expect(c.read(registeredPushTokenProvider), isNull);
  });

  test('does nothing while signed out or without a token', () async {
    final api = backend();
    final signedOut = container(api, MemoryTokenStore(), FakePushSource('tok-1'));
    expect(await signedOut.read(pushRegistrationProvider.future), isNull);

    final noPush = container(api, MemoryTokenStore()..write(Tokens(liveToken(), 'r1')), FakePushSource(null));
    await noPush.read(sessionProvider.future);
    expect(await noPush.read(pushRegistrationProvider.future), isNull);
    expect(calls(api).where((c) => c.contains('/devices')), isEmpty);
  });

  test('without Firebase config the app runs and push stays off', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final push = FirebasePushSource();
    expect(await push.token(), isNull);
    expect(await push.tokenRefresh.isEmpty, isTrue);
  });

  testWidgets('shows a message that arrives while the app is open', (tester) async {
    final push = FakePushSource(null);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        appConfigProvider.overrideWithValue(testConfig),
        tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
        pushSourceProvider.overrideWithValue(push),
      ],
      child: MaterialApp(builder: (_, child) => PushListener(child: child!), home: const Scaffold()),
    ));
    push.messages.add((title: 'Order picked up', body: 'Ravi is on the way'));
    await tester.pump();
    expect(find.text('Order picked up\nRavi is on the way'), findsOneWidget);
  });
}
