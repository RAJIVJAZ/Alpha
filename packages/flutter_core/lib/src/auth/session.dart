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
///
/// While a sign-in, tenant switch or [SessionController.reload] runs, the
/// provider keeps its previous value with `isLoading` set, so "signing in" is
/// never mistaken for "signed out"; see [SessionStates].
class SessionController extends AsyncNotifier<Session?> {
  @override
  Future<Session?> build() async {
    final store = ref.read(tokenStoreProvider);
    if (await store.read() == null) return null;
    SessionUser? user;
    try {
      user = await ref.read(authRepositoryProvider).me();
      await store.writeUser(user.toJson());
    } catch (_) {
      // offline at launch: keep the stored identity and the last known user; calls retry later
    }
    // read again: the call may have renewed the tokens, or a rejected refresh cleared them
    final claims = Claims.fromToken((await store.read())?.accessToken);
    if (claims == null) return null;
    if (user == null) {
      final last = await store.readUser();
      user = last != null && last['id'] == claims.sub
          ? SessionUser.fromJson(last)
          : SessionUser(id: claims.sub, name: claims.name, phone: claims.phone, roles: claims.roles);
    }
    return Session(claims, user);
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

/// Router-friendly reads of `ref.watch(sessionProvider)`.
extension SessionStates on AsyncValue<Session?> {
  /// The stored session is still being restored at launch (show a splash).
  bool get isRestoring => isLoading && !hasValue;

  /// Signed out for sure: not restoring, not in the middle of a sign-in.
  bool get isSignedOut => !isLoading && value == null;
}
