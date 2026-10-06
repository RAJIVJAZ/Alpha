# foodgrid_core

Shared foundation for the FoodGrid Flutter apps (`apps/customer-mobile`,
`apps/rider-mobile`, `apps/merchant-mobile`). Apps depend on it by path:

```yaml
dependencies:
  foodgrid_core:
    path: ../../packages/flutter_core
```

## What it provides

| Area | API |
|---|---|
| Configuration | `AppConfig` — `API_URL` and `GOOGLE_SERVER_CLIENT_ID` from `--dart-define`; override `appConfigProvider` in `main()` |
| HTTP | `ApiClient` — JSON calls through the gateway, bearer token, one shared refresh on 401 (then the request is retried), `Idempotency-Key`, errors as `ApiException(status, code, message)` |
| Session | `sessionProvider` (Riverpod `AsyncNotifier<Session?>`), `AuthRepository` (OTP, password, Google, tenant switch, logout), `SecureTokenStore` (Keychain / Keystore) |
| Sign-in | `LoginScreen` — OTP with resend timer, optional email + password, "Continue with Google", and an `authorize` hook so each app refuses accounts it doesn't serve |
| Live updates | `TrackingSocket` — Socket.IO `/tracking` at `/ws`: `order:subscribe`, `rider:location`, `delivery:status`, `offer:new` |
| Device | `LocationService` (permissions, current fix, position stream), `uploadMedia` (presigned S3 upload), `registerPushToken` (FCM/APNs token → `POST /devices`) |
| UI | `FoodGridTheme`, `VegMark`, `StatusChip` (colour + icon + label), `AsyncView`, `EmptyView`, `ErrorView`, `KpiTile` |
| Formatting | `money` (₹1,23,456.50), `moneyCompact` (₹6.5L / ₹3.4Cr), IST `dateTime` / `date` / `time`, `relative`, `humanize`, `istToday` |

## Tests

```bash
flutter test      # formatting, claims, error parsing, single-flight token refresh
flutter analyze
```
