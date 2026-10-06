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

/// One Socket.IO connection per app session, opened on first use.
final trackingSocketProvider = Provider<TrackingSocket>((ref) {
  final socket = TrackingSocket(ref.watch(appConfigProvider), ref.watch(tokenStoreProvider), ref.watch(apiClientProvider));
  ref.onDispose(socket.dispose);
  return socket;
});
