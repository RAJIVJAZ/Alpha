import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../config.dart';
import '../providers.dart';

/// Registers a push token (FCM on Android, APNs on iOS) for this user, so
/// order updates and admin campaigns reach the device. [pushRegistrationProvider]
/// calls it after sign-in and whenever the token rotates.
Future<void> registerPushToken(ApiClient api, AppConfig config, String token) => api.post<void>('devices', body: {
      'token': token,
      'platform': switch (defaultTargetPlatform) {
        TargetPlatform.iOS => 'IOS',
        TargetPlatform.android => 'ANDROID',
        _ => 'WEB',
      },
      'app': config.appName,
    });

Future<void> unregisterPushToken(ApiClient api, String token) => api.delete<void>('devices/${Uri.encodeComponent(token)}');

/// A notification that arrived while the app was open.
typedef PushMessage = ({String? title, String? body});

/// This device's push token and foreground messages. Tests override
/// [pushSourceProvider] with a fake.
abstract class PushSource {
  /// The current token, or null when push is unavailable or not allowed.
  Future<String?> token();
  Stream<String> get tokenRefresh;
  Stream<PushMessage> get foregroundMessages;
}

/// Firebase Cloud Messaging. Without the Firebase config files (see the app
/// README, "Push notifications") Firebase does not start and this source
/// stays silent, so the app runs without push.
class FirebasePushSource implements PushSource {
  Future<FirebaseMessaging?>? _ready;
  Future<FirebaseMessaging?> get _messaging => _ready ??= _start();

  static Future<FirebaseMessaging?> _start() async {
    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp();
      return FirebaseMessaging.instance;
    } catch (e) {
      debugPrint('Push notifications are off: $e');
      return null;
    }
  }

  @override
  Future<String?> token() async {
    final m = await _messaging;
    if (m == null) return null;
    try {
      // asks once on iOS and Android 13+; asked only after sign-in, when there is something to send
      final settings = await m.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return null;
      return await m.getToken();
    } catch (e) {
      // offline, or iOS before APNs handed over its token: onTokenRefresh delivers it later
      debugPrint('No push token yet: $e');
      return null;
    }
  }

  @override
  Stream<String> get tokenRefresh => Stream.fromFuture(_messaging).asyncExpand((m) => m?.onTokenRefresh ?? const Stream<String>.empty());

  @override
  Stream<PushMessage> get foregroundMessages => Stream.fromFuture(_messaging).asyncExpand(
        (m) => m == null ? const Stream<PushMessage>.empty() : FirebaseMessaging.onMessage.map((r) => (title: r.notification?.title, body: r.notification?.body)),
      );
}

final pushSourceProvider = Provider<PushSource>((ref) => FirebasePushSource());

/// The token last registered for the signed-in user, which
/// [SessionController.signOut] unregisters. Kept apart from
/// [pushRegistrationProvider] because that one depends on the session.
final registeredPushTokenProvider = NotifierProvider<RegisteredPushToken, String?>(RegisteredPushToken.new);

class RegisteredPushToken extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String? token) => state = token;
}

/// Keeps this device's push token registered for the signed-in user: after
/// sign-in, when another user signs in and whenever the token rotates.
final pushRegistrationProvider = FutureProvider<String?>((ref) async {
  final userId = ref.watch(sessionProvider.select((s) => s.value?.claims.sub));
  if (userId == null) return null;
  final push = ref.watch(pushSourceProvider);
  final registered = ref.read(registeredPushTokenProvider.notifier);
  Future<void> register(String token) async {
    await registerPushToken(ref.read(apiClientProvider), ref.read(appConfigProvider), token);
    registered.set(token);
  }

  final rotated = push.tokenRefresh.listen((t) => register(t).catchError((Object e) => debugPrint('Push token not registered: $e')));
  ref.onDispose(rotated.cancel);
  final token = await push.token();
  if (token == null || token.isEmpty) return null;
  await register(token);
  return token;
});

/// Keeps push registered while the app runs and shows notifications that
/// arrive while it is open as a snack bar (the system shows the others).
/// Put it in `MaterialApp.builder`, below the app's ScaffoldMessenger.
class PushListener extends ConsumerStatefulWidget {
  const PushListener({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<PushListener> createState() => _PushListenerState();
}

class _PushListenerState extends ConsumerState<PushListener> {
  StreamSubscription<PushMessage>? _messages;

  @override
  void initState() {
    super.initState();
    _messages = ref.read(pushSourceProvider).foregroundMessages.listen((m) {
      final text = [m.title, m.body].whereType<String>().where((s) => s.isNotEmpty).join('\n');
      if (text.isNotEmpty && mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(text)));
    });
  }

  @override
  void dispose() {
    _messages?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(pushRegistrationProvider);
    return widget.child;
  }
}
