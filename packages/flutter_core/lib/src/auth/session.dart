import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import 'auth_repository.dart';
import 'claims.dart';

class Session {
  const Session(this.claims, this.user);
  final Claims claims;
  final SessionUser user;
}

/// The signed-in user, or null. Restored from secure storage at launch (the
/// API client renews an expired access token on the first call).
class SessionController extends AsyncNotifier<Session?> {
  @override
  Future<Session?> build() async {
    final stored = await ref.read(tokenStoreProvider).read();
    if (stored == null) return null;
    try {
      final user = await ref.read(authRepositoryProvider).me();
      final tokens = await ref.read(tokenStoreProvider).read();
      final claims = Claims.fromToken(tokens?.accessToken);
      return claims == null ? null : Session(claims, user);
    } catch (_) {
      // offline at launch: keep the stored identity, calls retry later
      final claims = Claims.fromToken(stored.accessToken);
      return claims == null ? null : Session(claims, SessionUser(id: claims.sub, name: claims.name, phone: claims.phone, roles: claims.roles));
    }
  }

  /// Reloads after a sign-in or tenant switch.
  Future<void> reload() async {
    state = const AsyncLoading<Session?>();
    state = await AsyncValue.guard(build);
  }

  Future<void> signOut() async {
    await ref.read(authRepositoryProvider).logout();
    state = const AsyncData<Session?>(null);
  }

  /// The refresh token was rejected elsewhere (revoked, expired).
  void expired() => state = const AsyncData<Session?>(null);
}
