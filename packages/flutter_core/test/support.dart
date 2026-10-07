import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

const testConfig = AppConfig(app: ClientApp.customer, apiUrl: 'http://api.test/api/v1');

/// An unsigned JWT carrying [claims] (clients only decode them).
String jwt(Map<String, dynamic> claims) {
  String part(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${part({'alg': 'none'})}.${part(claims)}.sig';
}

/// A token for user [sub] that is valid for another hour.
String liveToken({String sub = 'u1', Map<String, dynamic> claims = const {}}) =>
    jwt({'sub': sub, 'roles': ['CUSTOMER'], 'exp': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000, ...claims});

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

/// Routes `METHOD /path` to canned answers; anything else is a 404.
FakeAdapter routes(Map<String, Object? Function(RequestOptions o)> table) => FakeAdapter((o) async {
      final answer = table['${o.method} ${o.path}'];
      if (answer == null) return (404, {'statusCode': 404, 'message': 'No fake for ${o.method} ${o.path}'});
      final body = answer(o);
      return body is (int, Object?) ? body : (200, body);
    });

/// An [ApiClient] over [adapter] (also used for refreshes).
ApiClient fakeClient(FakeAdapter adapter, TokenStore tokens, {void Function()? onSessionExpired}) => ApiClient(
      config: testConfig,
      tokens: tokens,
      dio: Dio()..httpClientAdapter = adapter,
      refreshDio: Dio()..httpClientAdapter = adapter,
      onSessionExpired: onSessionExpired,
    );
