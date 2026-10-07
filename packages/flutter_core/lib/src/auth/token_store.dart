import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class Tokens {
  const Tokens(this.accessToken, this.refreshToken);
  final String accessToken;
  final String refreshToken;

  static Tokens? fromJson(Object? json) {
    if (json is! Map) return null;
    final a = json['accessToken'];
    final r = json['refreshToken'];
    return a is String && r is String ? Tokens(a, r) : null;
  }
}

/// Where the session lives between launches: the tokens, plus the last
/// signed-in user (`auth/me`) so an offline launch keeps its memberships.
abstract class TokenStore {
  Future<Tokens?> read();
  Future<void> write(Tokens tokens);
  Future<Map<String, dynamic>?> readUser();
  Future<void> writeUser(Map<String, dynamic> user);

  /// Forgets the tokens and the user.
  Future<void> clear();
}

/// Keychain / Keystore backed storage (the refresh token is a long-lived secret).
class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _access = 'fg.access';
  static const _refresh = 'fg.refresh';
  static const _user = 'fg.user';

  @override
  Future<Tokens?> read() async {
    final a = await _storage.read(key: _access);
    final r = await _storage.read(key: _refresh);
    return a != null && r != null ? Tokens(a, r) : null;
  }

  @override
  Future<void> write(Tokens tokens) async {
    await _storage.write(key: _access, value: tokens.accessToken);
    await _storage.write(key: _refresh, value: tokens.refreshToken);
  }

  @override
  Future<Map<String, dynamic>?> readUser() async {
    try {
      return jsonDecode(await _storage.read(key: _user) ?? 'null') as Map<String, dynamic>?;
    } catch (_) {
      return null; // unreadable: treated as unknown
    }
  }

  @override
  Future<void> writeUser(Map<String, dynamic> user) => _storage.write(key: _user, value: jsonEncode(user));

  @override
  Future<void> clear() async {
    for (final key in const [_access, _refresh, _user]) {
      await _storage.delete(key: key);
    }
  }
}

/// In-memory store for tests.
class MemoryTokenStore implements TokenStore {
  Tokens? _tokens;
  Map<String, dynamic>? _user;

  @override
  Future<Tokens?> read() async => _tokens;

  @override
  Future<void> write(Tokens tokens) async => _tokens = tokens;

  @override
  Future<Map<String, dynamic>?> readUser() async => _user;

  @override
  Future<void> writeUser(Map<String, dynamic> user) async => _user = user;

  @override
  Future<void> clear() async {
    _tokens = null;
    _user = null;
  }
}
