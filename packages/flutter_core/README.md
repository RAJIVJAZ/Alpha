# foodgrid_core

Shared foundation for the FoodGrid Flutter apps (`apps/customer-mobile`, `apps/rider-mobile`,
`apps/merchant-mobile`): API client, session, sign-in screen, live tracking socket, routing pages,
theme, Indian formatting and common widgets. Apps depend on it by path:

```yaml
dependencies:
  foodgrid_core:
    path: ../../packages/flutter_core
```

Everything is exported from `package:foodgrid_core/foodgrid_core.dart`.

## What it provides

| Area          | API                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration | `AppConfig`: `API_URL` and `GOOGLE_SERVER_CLIENT_ID` from `--dart-define`; override `appConfigProvider` in `main()`                                                                                                                                                                                                                                                                                                                                        |
| HTTP          | `ApiClient`: JSON calls through the gateway, bearer token, one shared refresh on 401 (then the request is retried), `Idempotency-Key`, errors as `ApiException(status, code, message, details)`. `PagedResult.fromJson` reads the `{data, meta}` envelope. `dec()` reads decimal strings. `retryTransientErrors` is the Riverpod retry policy (offline and 5xx only, 3 tries with backoff)                                                                 |
| Session       | `sessionProvider` (`AsyncNotifier<Session?>`), `AuthRepository` (OTP, password, Google, `switchTenant`, logout), `SecureTokenStore` (Keychain / Keystore; also keeps the last `auth/me` user so an offline launch keeps its memberships). `isRestoring` / `isSignedOut` on the session value tell a launch, a sign-in in progress and signed out apart                                                                                                     |
| Sign-in       | `LoginScreen`: OTP with resend timer, optional email + password, "Continue with Google"; `authorize` (claims) and `authorizeUser` (async, `SessionUser` with memberships) refuse accounts an app doesn't serve; `onSignedIn`, `onClose`, `notice`                                                                                                                                                                                                          |
| Live updates  | `TrackingSocket` over a `SocketTransport` (Socket.IO `/tracking` at `/ws`): `subscribeOrder` + `onOrder('rider:location', id)`, `subscribeOutlet` + `onOutlet('order:new' / 'order:status', id)`, rider-room events via `on(...)`. Rooms are re-joined after a reconnect; signing out disconnects and forgets them                                                                                                                                         |
| Routing       | `materialRoute(path, builder)` and `materialPage(state, child)` for go_router (see below)                                                                                                                                                                                                                                                                                                                                                                  |
| Device        | `LocationService` (permissions, current fix, position stream), `distanceKm` (haversine, pure Dart), `uploadMedia` (presigned S3 upload), push: `PushListener` in `MaterialApp.builder` keeps the FCM token registered for the signed-in user (`POST /devices`, again on rotation; `signOut` sends `DELETE /devices/{token}`) and shows foreground pushes as a snack bar; `pushSourceProvider` (Firebase, silent without its config files) is the test seam |
| UI            | `FoodGridTheme`, `VegMark`, `StatusChip` (colour + icon + label), `AsyncView` (and `AsyncView.sliver`, `errorBuilder`), `EmptyView`, `ErrorView` (friendly copy for offline, 401, 403 with the server's message, 404, 5xx; `title` / `message` override), `KpiTile`                                                                                                                                                                                        |
| Formatting    | `money` (₹1,23,456.50; negatives as −₹1,234.50 with U+2212; `signed: true` adds + to credits), `moneyCompact` (₹6.5L / ₹3.4Cr), IST `dateTime` / `date` / `time`, `relative`, `humanize`, `istToday`                                                                                                                                                                                                                                                       |

## Wiring an app

```dart
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(ProviderScope(
    retry: retryTransientErrors,
    overrides: [appConfigProvider.overrideWithValue(const AppConfig(app: ClientApp.rider))],
    child: const RiderApp(),
  ));
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(sessionProvider, (_, _) => refresh.value++);
  final router = GoRouter(
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      if (session.isRestoring) return '/splash'; // launch: the stored session is loading
      // while a sign-in runs, the session keeps its previous value (null) with isLoading set
      if (session.value == null) return state.matchedLocation == '/login' ? null : '/login';
      return null;
    },
    routes: [
      materialRoute('/splash', (_, _) => const SplashView()),
      materialRoute('/login', (_, _) => LoginScreen(title: 'FoodGrid Rider', authorize: authorizeRider)),
      materialRoute('/duty', (_, _) => const DutyScreen()),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
```

`MaterialApp.router(routerConfig: ref.watch(routerProvider), builder: (_, child) => PushListener(child: child!), theme: FoodGridTheme.light(), …)`
completes it. Signing out is `ref.read(sessionProvider.notifier).signOut()` (or `signOut(ref)`); it
also unregisters the push token and closes the tracking socket.

### Why `materialRoute`

go_router 18 depends on the separate `material_ui` package and decides which page to build by
looking for _that_ package's `MaterialApp` (`go_router/lib/src/pages/material.dart`,
`isMaterialApp`). The apps use the `MaterialApp` from `package:flutter/material.dart`, a different
class, so the check fails and `GoRoute(builder: …)` falls back to a `NoTransitionPage`
(`go_router/lib/src/builder.dart`, `_cacheAppType`): no page transitions and no iOS back-swipe.
Declare routes with `materialRoute`, and give shell routes
`pageBuilder: (context, state, shell) => materialPage(state, …)`. `test/widgets_test.dart` checks
the fallback; when that test fails, go_router recognises the app again and the helper can go.

## Testing with the fakes

Widget tests run the whole app inside a `ProviderScope` with these overrides, so nothing touches
the network:

```dart
final tokens = MemoryTokenStore();
await tokens.write(Tokens(accessToken, 'refresh-1')); // signed in; skip for signed out
final socket = FakeSocketTransport();
ProviderScope(
  retry: (_, _) => null,
  overrides: [
    appConfigProvider.overrideWithValue(testConfig),
    tokenStoreProvider.overrideWithValue(tokens),
    // a Dio whose HttpClientAdapter answers registered routes (see test/support.dart)
    apiClientProvider.overrideWithValue(ApiClient(config: testConfig, tokens: tokens, dio: fakeDio, refreshDio: fakeDio)),
    socketTransportProvider.overrideWithValue(socket),
  ],
  child: const MyApp(),
);

// the app's side of the socket
expect(socket.sentAs('outlet:subscribe'), [{'outletId': 'o1'}]);
// the server's side
socket.receive('order:new', {'orderId': 'x1', 'orderNumber': 'ORD-1', 'outletId': 'o1', 'status': 'PLACED'});
socket.reconnect(); // rooms are joined again
```

`FakeSocketTransport` keeps the real `TrackingSocket` logic (rooms, per-order filtering,
sign-out) under test. Access tokens in tests are unsigned JWTs; clients only decode them.

```bash
flutter analyze
flutter test   # API client and refresh, auth and session, socket, sign-in layout, formatting, widgets, routing
```
