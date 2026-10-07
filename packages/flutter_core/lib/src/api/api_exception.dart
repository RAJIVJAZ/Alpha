import 'package:dio/dio.dart';

/// An API failure in the services' error envelope:
/// `{ statusCode, code, message, details }`.
class ApiException implements Exception {
  const ApiException(this.status, this.code, this.message, {this.details});

  /// HTTP status, or 0 when the request never got an answer.
  final int status;
  final String? code;
  final String message;
  final Object? details;

  bool get isUnauthorized => status == 401;
  bool get isNetwork => status == 0;

  factory ApiException.fromDio(DioException e) {
    final res = e.response;
    if (res == null) {
      final offline = e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout || e.type == DioExceptionType.receiveTimeout;
      return ApiException(0, 'NETWORK', offline ? 'Check your internet connection and try again.' : (e.message ?? 'Request failed'));
    }
    final body = res.data;
    if (body is Map) {
      final raw = body['message'];
      final details = body['details'];
      String message;
      if (raw is List) {
        message = raw.join(', ');
      } else if (details is Map && details['errors'] is List) {
        message = (details['errors'] as List).join(', ');
      } else {
        message = raw?.toString() ?? 'Request failed (${res.statusCode})';
      }
      return ApiException(res.statusCode ?? 0, body['code']?.toString(), message, details: details);
    }
    return ApiException(res.statusCode ?? 0, null, 'Request failed (${res.statusCode})');
  }

  @override
  String toString() => message;
}

/// Riverpod retry policy for every app's `ProviderScope(retry: …)`: offline
/// and 5xx failures are retried up to 3 times (after 1 s, 2 s, 4 s); 4xx
/// answers will not change, so they fail at once.
Duration? retryTransientErrors(int retryCount, Object error) {
  if (retryCount >= 3 || error is! ApiException) return null;
  return error.isNetwork || error.status >= 500 ? Duration(seconds: 1 << retryCount) : null;
}
