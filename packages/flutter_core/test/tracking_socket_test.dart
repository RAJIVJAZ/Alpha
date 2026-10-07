import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'support.dart';

void main() {
  test('rider:location reaches only the order it belongs to', () async {
    final wire = FakeSocketTransport();
    final socket = TrackingSocket(wire, () async => 'token-1');
    addTearDown(socket.dispose);
    final a = <Map<String, dynamic>>[];
    final b = <Map<String, dynamic>>[];
    socket.onOrder('rider:location', 'A').listen(a.add);
    socket.onOrder('rider:location', 'B').listen(b.add);

    await socket.subscribeOrder('A');
    expect(wire.token, 'token-1');
    expect(wire.sentAs('order:subscribe'), [
      {'orderId': 'A'},
    ]);
    // an older server sends no orderId: fine while one order is watched
    wire.receive('rider:location', {'lat': 1, 'lng': 1});
    await socket.subscribeOrder('B');
    // two orders watched: only tagged events count
    wire.receive('rider:location', {'lat': 2, 'lng': 2});
    wire.receive('rider:location', {'orderId': 'B', 'deliveryId': 'd2', 'lat': 3, 'lng': 3});
    wire.receive('rider:location', {'orderId': 'A', 'deliveryId': 'd1', 'lat': 4, 'lng': 4});
    await pumpEventQueue();

    expect(a.map((e) => e['lat']), [1, 4]);
    expect(b.map((e) => e['lat']), [3]);
  });

  test('outlet rooms are joined, re-joined after a reconnect and left', () async {
    final wire = FakeSocketTransport();
    final socket = TrackingSocket(wire, () async => 'token-1');
    addTearDown(socket.dispose);
    final fresh = <Map<String, dynamic>>[];
    final moved = <Map<String, dynamic>>[];
    socket.onOutlet('order:new', 'o1').listen(fresh.add);
    socket.onOutlet('order:status', 'o1').listen(moved.add);

    await socket.subscribeOutlet('o1');
    await socket.subscribeOutlet('o1'); // once is enough
    expect(wire.sentAs('outlet:subscribe'), [
      {'outletId': 'o1'},
    ]);

    wire.receive('order:new', {'orderId': 'x1', 'orderNumber': 'ORD-1', 'outletId': 'o1', 'status': 'PLACED', 'total': '511.00', 'placedAt': '2026-10-07T10:00:00Z'});
    wire.receive('order:new', {'orderId': 'x2', 'orderNumber': 'ORD-2', 'outletId': 'o2', 'status': 'PLACED'});
    wire.receive('order:status', {'orderId': 'x1', 'orderNumber': 'ORD-1', 'outletId': 'o1', 'status': 'ACCEPTED'});
    await pumpEventQueue();
    expect(fresh.map((e) => e['orderNumber']), ['ORD-1']);
    expect(moved.map((e) => e['status']), ['ACCEPTED']);

    wire.reconnect();
    expect(wire.sentAs('outlet:subscribe'), hasLength(2));

    socket.unsubscribeOutlet('o1');
    expect(wire.sentAs('outlet:unsubscribe'), [
      {'outletId': 'o1'},
    ]);
    wire.reconnect();
    expect(wire.sentAs('outlet:subscribe'), hasLength(2));
  });

  test('signed out, nothing connects; the next call tries again', () async {
    final wire = FakeSocketTransport();
    String? token;
    final socket = TrackingSocket(wire, () async => token);
    addTearDown(socket.dispose);

    await socket.subscribeOrder('A');
    expect(socket.connected, isFalse);
    token = 'token-1';
    await socket.connect();
    expect(socket.connected, isTrue);
    expect(wire.sentAs('order:subscribe'), [
      {'orderId': 'A'},
    ]);
  });

  test('signing out disconnects and forgets the rooms; signing in again uses the new token', () async {
    final tokens = MemoryTokenStore();
    await tokens.write(Tokens(liveToken(sub: 'u1'), 'r1'));
    final wire = FakeSocketTransport();
    final backend = routes({
      'GET /auth/me': (_) => {'id': 'u1'},
      'POST /auth/logout': (_) => {'ok': true},
    });
    final c = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        appConfigProvider.overrideWithValue(testConfig),
        tokenStoreProvider.overrideWithValue(tokens),
        apiClientProvider.overrideWithValue(fakeClient(backend, tokens)),
        socketTransportProvider.overrideWithValue(wire),
      ],
    );
    addTearDown(c.dispose);
    await c.read(sessionProvider.future);
    final socket = c.read(trackingSocketProvider);
    await socket.subscribeOutlet('o1');
    expect(wire.connected, isTrue);

    await c.read(sessionProvider.notifier).signOut();
    expect(wire.connected, isFalse);
    wire.receive('order:new', {'outletId': 'o1'}); // a late packet goes nowhere

    final next = liveToken(sub: 'u2');
    await tokens.write(Tokens(next, 'r2'));
    backend.calls.clear();
    await c.read(sessionProvider.notifier).reload();
    await socket.subscribeOrder('A');
    expect(wire.token, next);
    // only the new user's room is joined
    expect(wire.sent.last.$1, 'order:subscribe');
    expect(wire.sent.last.$2, {'orderId': 'A'});
    expect(wire.sentAs('outlet:subscribe'), hasLength(1));
  });
}
