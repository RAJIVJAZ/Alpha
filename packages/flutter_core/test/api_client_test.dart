import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

String _jwt(Map<String, dynamic> claims) {
  String part(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${part({'alg': 'none'})}.${part(claims)}.sig';
}

/// Answers requests from a handler and records them.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler);
  final Future<(int, Object?)> Function(RequestOptions o) handler;
  final calls = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add(options);
    final (status, body) = await handler(options);
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  const config = AppConfig(app: ClientApp.customer, apiUrl: 'http://api.test/api/v1');

  test('claims decode roles, tenant and expiry from an access token', () {
    final exp = DateTime.now().add(const Duration(minutes: 15)).millisecondsSinceEpoch ~/ 1000;
    final c = Claims.fromToken(_jwt({'sub': 'u1', 'roles': ['CUSTOMER', 'RIDER'], 'tenantType': 'RESTAURANT', 'exp': exp}))!;
    expect(c.sub, 'u1');
    expect(c.hasRole('RIDER'), isTrue);
    expect(c.tenantType, 'RESTAURANT');
    expect(c.isExpired(), isFalse);
    expect(Claims.fromToken('not-a-jwt'), isNull);
  });

  test('error envelopes become ApiExceptions with code and message', () async {
    final dio = Dio()..httpClientAdapter = FakeAdapter((o) async => (409, {'statusCode': 409, 'code': 'CART_OUTLET_MISMATCH', 'message': 'Your cart has items from another restaurant'}));
    final api = ApiClient(config: config, tokens: MemoryTokenStore(), dio: dio);
    await expectLater(
      api.post<dynamic>('cart/items', body: {}),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'CART_OUTLET_MISMATCH').having((e) => e.status, 'status', 409)),
    );
  });

  test('concurrent 401s share one refresh, then retry with the new token', () async {
    final store = MemoryTokenStore();
    await store.write(const Tokens('old', 'refresh-1'));
    final api = Dio()
      ..httpClientAdapter = FakeAdapter((o) async {
        final auth = o.headers['authorization'];
        return auth == 'Bearer new' ? (200, {'ok': o.path}) : (401, {'statusCode': 401, 'message': 'expired'});
      });
    var refreshes = 0;
    final refresh = Dio()
      ..httpClientAdapter = FakeAdapter((o) async {
        refreshes++;
        await Future<void>.delayed(const Duration(milliseconds: 20));
        return (200, {'tokens': {'accessToken': 'new', 'refreshToken': 'refresh-2'}});
      });
    final client = ApiClient(config: config, tokens: store, dio: api, refreshDio: refresh);
    final results = await Future.wait([client.get<Map<String, dynamic>>('a'), client.get<Map<String, dynamic>>('b'), client.get<Map<String, dynamic>>('c')]);
    expect(results.map((r) => r['ok']), ['/a', '/b', '/c']);
    expect(refreshes, 1);
    expect((await store.read())!.refreshToken, 'refresh-2');
  });

  test('a rejected refresh token ends the session', () async {
    final store = MemoryTokenStore();
    await store.write(const Tokens('old', 'revoked'));
    var expired = false;
    final client = ApiClient(
      config: config,
      tokens: store,
      dio: Dio()..httpClientAdapter = FakeAdapter((o) async => (401, {'statusCode': 401, 'message': 'expired'})),
      refreshDio: Dio()..httpClientAdapter = FakeAdapter((o) async => (401, {'statusCode': 401, 'message': 'revoked'})),
      onSessionExpired: () => expired = true,
    );
    await expectLater(client.get<dynamic>('orders'), throwsA(isA<ApiException>().having((e) => e.isUnauthorized, 'unauthorized', isTrue)));
    expect(expired, isTrue);
    expect(await store.read(), isNull);
  });

  test('idempotency keys and query cleanup reach the wire', () async {
    final adapter = FakeAdapter((o) async => (201, {'id': 'x'}));
    final client = ApiClient(config: config, tokens: MemoryTokenStore(), dio: Dio()..httpClientAdapter = adapter);
    await client.post<dynamic>('orders', body: {'a': 1}, idempotencyKey: 'k-1');
    await client.get<dynamic>('outlets/nearby', query: {'lat': 12.9, 'type': null, 'q': ''});
    expect(adapter.calls[0].headers['idempotency-key'], 'k-1');
    expect(adapter.calls[1].queryParameters, {'lat': 12.9});
  });
}
