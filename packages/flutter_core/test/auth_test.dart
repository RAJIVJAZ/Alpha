import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'support.dart';

final _membership = {'tenantId': 't1', 'tenantName': 'Spice Garden', 'tenantType': 'RESTAURANT', 'tenantStatus': 'ACTIVE', 'role': 'MANAGER', 'outletIds': ['o1', 'o2']};

ProviderContainer container(FakeAdapter backend, MemoryTokenStore tokens) {
  late ProviderContainer c;
  c = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      appConfigProvider.overrideWithValue(testConfig),
      tokenStoreProvider.overrideWithValue(tokens),
      apiClientProvider.overrideWithValue(fakeClient(backend, tokens, onSessionExpired: () => c.read(sessionProvider.notifier).expired())),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

void main() {
  group('switchTenant', () {
    final switched = liveToken(claims: {'tenantId': 't1', 'tenantType': 'RESTAURANT', 'tenantRole': 'MANAGER'});

    test('stores the rotated refresh token from the login shape', () async {
      final tokens = MemoryTokenStore();
      await tokens.write(const Tokens('old', 'refresh-1'));
      final backend = routes({
        'POST /auth/switch-tenant': (_) => {
              'tokens': {'accessToken': switched, 'refreshToken': 'refresh-2', 'expiresIn': 900, 'tokenType': 'Bearer'},
              'user': {'id': 'u1'},
            },
      });
      final claims = await AuthRepository(fakeClient(backend, tokens), tokens).switchTenant('t1');

      expect(claims.tenantId, 't1');
      expect((await tokens.read())!.accessToken, switched);
      expect((await tokens.read())!.refreshToken, 'refresh-2');
      expect(backend.calls.single.data, {'tenantId': 't1'});
      expect(backend.calls.single.headers['authorization'], 'Bearer old');
    });

    test('keeps the stored refresh token when an older server sends a bare access token', () async {
      final tokens = MemoryTokenStore();
      await tokens.write(const Tokens('old', 'refresh-1'));
      final backend = routes({
        'POST /auth/switch-tenant': (_) => {'accessToken': switched, 'expiresIn': 900, 'tokenType': 'Bearer'},
      });
      final claims = await AuthRepository(fakeClient(backend, tokens), tokens).switchTenant('t1');

      expect(claims.tenantRole, 'MANAGER');
      expect((await tokens.read())!.accessToken, switched);
      expect((await tokens.read())!.refreshToken, 'refresh-1');
    });
  });

  test('memberships keep tenant status and outlets through JSON', () {
    final user = SessionUser.fromJson({'id': 'u1', 'roles': ['CUSTOMER'], 'memberships': [_membership]});
    final again = SessionUser.fromJson(user.toJson());
    expect(again.memberships.single.tenantStatus, 'ACTIVE');
    expect(again.memberships.single.outletIds, ['o1', 'o2']);
    expect(again.memberships.single.role, 'MANAGER');
  });

  group('session', () {
    test('an offline launch keeps the last known user with its memberships', () async {
      final tokens = MemoryTokenStore();
      await tokens.write(Tokens(liveToken(), 'r1'));
      final backend = routes({
        'GET /auth/me': (_) => {'id': 'u1', 'name': 'Rohit', 'memberships': [_membership]},
      });
      final first = container(backend, tokens);
      expect((await first.read(sessionProvider.future))!.user.memberships, hasLength(1));

      // next launch, no network
      final offline = container(routes({'GET /auth/me': (o) => throw DioException(requestOptions: o, type: DioExceptionType.connectionError)}), tokens);
      final session = (await offline.read(sessionProvider.future))!;
      expect(session.user.name, 'Rohit');
      expect(session.user.memberships.single.tenantId, 't1');
    });

    test('a rejected refresh at launch ends the session instead of faking one', () async {
      final tokens = MemoryTokenStore();
      await tokens.write(Tokens(liveToken(), 'revoked'));
      final backend = routes({
        'GET /auth/me': (_) => (401, {'statusCode': 401, 'message': 'expired'}),
        'POST /auth/refresh': (_) => (401, {'statusCode': 401, 'message': 'revoked'}),
      });
      final c = container(backend, tokens);
      expect(await c.read(sessionProvider.future), isNull);
      expect(await tokens.read(), isNull);
    });

    test('signing in reads as loading with no user, not as signed out', () async {
      final tokens = MemoryTokenStore();
      final backend = routes({
        'GET /auth/me': (_) => {'id': 'u1'},
      });
      final c = container(backend, tokens);
      expect(c.read(sessionProvider).isRestoring, isTrue);
      expect(await c.read(sessionProvider.future), isNull);
      expect(c.read(sessionProvider).isSignedOut, isTrue);

      final states = <AsyncValue<Session?>>[];
      c.listen(sessionProvider, (_, next) => states.add(next));
      await tokens.write(Tokens(liveToken(), 'r1'));
      await c.read(sessionProvider.notifier).reload();

      final signingIn = states.first;
      expect(signingIn.isLoading, isTrue);
      expect(signingIn.isRestoring, isFalse);
      expect(signingIn.isSignedOut, isFalse);
      expect(states.last.value?.user.id, 'u1');

      // a reload (tenant switch) keeps the current user on screen meanwhile
      states.clear();
      await c.read(sessionProvider.notifier).reload();
      expect(states.first.isLoading, isTrue);
      expect(states.first.value?.user.id, 'u1');
    });
  });
}
