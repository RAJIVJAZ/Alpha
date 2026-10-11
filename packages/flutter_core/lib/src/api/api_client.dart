import 'dart:async';

import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import '../auth/claims.dart';
import '../auth/token_store.dart';
import '../config.dart';
import 'api_exception.dart';

const _uuid = Uuid();

/// A fresh key for retry-safe POSTs (checkout, payments, payouts).
String newIdempotencyKey() => _uuid.v4();

/// JSON client for the FoodGrid gateway.
///
/// Adds the bearer token, renews it once on a 401 (one refresh shared by
/// concurrent requests), retries the original request, and turns failures
/// into [ApiException]s. When the refresh token is rejected the stored
/// session is cleared and [onSessionExpired] fires.
class ApiClient {
  ApiClient({required this.config, required this.tokens, Dio? dio, Dio? refreshDio, this.onSessionExpired})
      : _dio = dio ?? Dio(),
        _refreshDio = refreshDio ?? Dio() {
    for (final d in [_dio, _refreshDio]) {
      d.options
        ..baseUrl = config.apiUrl
        ..connectTimeout = const Duration(seconds: 10)
        ..receiveTimeout = const Duration(seconds: 20)
        ..headers['accept'] = 'application/json';
    }
    _dio.interceptors.add(QueuedInterceptorsWrapper(onRequest: _onRequest));
    _dio.interceptors.add(InterceptorsWrapper(onError: _onError));
  }

  final AppConfig config;
  final TokenStore tokens;
  final void Function()? onSessionExpired;
  final Dio _dio;
  final Dio _refreshDio;
  Completer<Tokens?>? _refreshing;

  Future<void> _onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final t = await tokens.read();
    if (t != null && options.extra['noAuth'] != true) options.headers['authorization'] = 'Bearer ${t.accessToken}';
    handler.next(options);
  }

  Future<void> _onError(DioException e, ErrorInterceptorHandler handler) async {
    final req = e.requestOptions;
    if (e.response?.statusCode != 401 || req.extra['retried'] == true || req.extra['noAuth'] == true) return handler.next(e);
    final renewed = await refresh();
    if (renewed == null) return handler.next(e);
    try {
      req.extra['retried'] = true;
      req.headers['authorization'] = 'Bearer ${renewed.accessToken}';
      handler.resolve(await _dio.fetch<dynamic>(req));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }

  /// Rotates the refresh token. Concurrent callers share one request.
  Future<Tokens?> refresh() {
    final pending = _refreshing;
    if (pending != null) return pending.future;
    final c = _refreshing = Completer<Tokens?>();
    () async {
      try {
        final current = await tokens.read();
        if (current == null) return c.complete(null);
        final res = await _refreshDio.post<Map<String, dynamic>>('/auth/refresh', data: {'refreshToken': current.refreshToken});
        final renewed = Tokens.fromJson(res.data?['tokens'] ?? res.data);
        if (renewed == null) throw StateError('No tokens in refresh response');
        await tokens.write(renewed);
        c.complete(renewed);
      } on DioException catch (e) {
        // only a definitive rejection ends the session; network blips keep it
        if (e.response?.statusCode == 401 || e.response?.statusCode == 403) {
          await tokens.clear();
          onSessionExpired?.call();
        }
        c.complete(null);
      } catch (_) {
        c.complete(null);
      } finally {
        _refreshing = null;
      }
    }();
    return c.future;
  }

  /// A live access token for other channels (the tracking socket), renewed
  /// first when it is about to expire; null when signed out.
  Future<String?> accessToken() async {
    final t = await tokens.read();
    if (t == null) return null;
    if (Claims.fromToken(t.accessToken)?.isExpired() ?? false) return (await refresh())?.accessToken;
    return t.accessToken;
  }

  Future<T> _send<T>(String method, String path, {Object? body, Map<String, dynamic>? query, String? idempotencyKey, bool auth = true}) async {
    try {
      final res = await _dio.request<dynamic>(
        path.startsWith('/') ? path : '/$path',
        data: body,
        queryParameters: query == null ? null : {for (final e in query.entries) if (e.value != null && e.value != '') e.key: e.value},
        options: Options(
          method: method,
          headers: {'idempotency-key': ?idempotencyKey},
          extra: {if (!auth) 'noAuth': true},
        ),
      );
      return res.data as T;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query, bool auth = true}) => _send<T>('GET', path, query: query, auth: auth);

  Future<T> post<T>(String path, {Object? body, String? idempotencyKey, bool auth = true}) =>
      _send<T>('POST', path, body: body ?? const <String, dynamic>{}, idempotencyKey: idempotencyKey, auth: auth);

  Future<T> patch<T>(String path, {Object? body}) => _send<T>('PATCH', path, body: body ?? const <String, dynamic>{});

  Future<T> put<T>(String path, {Object? body}) => _send<T>('PUT', path, body: body ?? const <String, dynamic>{});

  Future<T> delete<T>(String path) => _send<T>('DELETE', path);

  /// Raw upload to a presigned URL, on the client without the bearer token
  /// (object storage must never see it).
  Future<void> putBytes(String url, List<int> bytes, {required Map<String, String> headers}) async {
    try {
      await _refreshDio.put<void>(url, data: Stream.fromIterable([bytes]), options: Options(headers: {...headers, Headers.contentLengthHeader: bytes.length}));
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

/// Paginated list envelope used by the services (`{data, meta}`).
class PagedResult<T> {
  const PagedResult(this.data, {required this.page, required this.totalPages, required this.total});

  final List<T> data;
  final int page;
  final int totalPages;
  final int total;

  bool get hasMore => page < totalPages;

  static PagedResult<T> fromJson<T>(Object? json, T Function(Map<String, dynamic>) item) {
    final m = json as Map<String, dynamic>;
    final meta = (m['meta'] as Map?) ?? const {};
    return PagedResult(
      [for (final e in (m['data'] as List)) item(e as Map<String, dynamic>)],
      page: (meta['page'] as num?)?.toInt() ?? 1,
      totalPages: (meta['totalPages'] as num?)?.toInt() ?? 1,
      total: (meta['total'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Reads a JSON decimal (the services send money as strings).
double dec(Object? v) => v is num ? v.toDouble() : double.tryParse(v?.toString() ?? '') ?? 0;
