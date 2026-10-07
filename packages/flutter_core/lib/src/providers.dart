import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'auth/auth_repository.dart';
import 'auth/session.dart';
import 'auth/token_store.dart';
import 'config.dart';
import 'realtime/tracking_socket.dart';

/// Each app overrides this in its ProviderScope with its own [AppConfig].
final appConfigProvider = Provider<AppConfig>((ref) => throw UnimplementedError('Override appConfigProvider in main()'));

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(
    config: ref.watch(appConfigProvider),
    tokens: ref.watch(tokenStoreProvider),
    onSessionExpired: () => ref.read(sessionProvider.notifier).expired(),
  ),
);

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository(ref.watch(apiClientProvider), ref.watch(tokenStoreProvider)));

final sessionProvider = AsyncNotifierProvider<SessionController, Session?>(SessionController.new);

/// Tests override this with a [FakeSocketTransport].
final socketTransportProvider = Provider<SocketTransport>((ref) => IoSocketTransport(ref.watch(appConfigProvider).origin));

/// One Socket.IO connection per app session, opened on first use.
final trackingSocketProvider = Provider<TrackingSocket>((ref) {
  final socket = TrackingSocket(ref.watch(socketTransportProvider), ref.watch(apiClientProvider).accessToken);
  // the socket is authenticated as one user and business: start over when either changes
  ref.listen(sessionProvider.select((s) => (s.value?.claims.sub, s.value?.claims.tenantId)), (_, _) => socket.disconnect());
  ref.onDispose(socket.dispose);
  return socket;
});
