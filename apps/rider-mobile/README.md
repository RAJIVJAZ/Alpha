# FoodGrid Rider (Flutter)

The delivery-partner app for FoodGrid. Riders go on duty, accept offers, work
through pickups and drops, and track earnings, wallet, incentives and demand.
It ports the rider web app (`packages/ui/src/rider`) to Android and iOS on top
of the shared `foodgrid_core` package (`packages/flutter_core`).

## Running

```sh
export PATH=/opt/flutter/bin:$PATH
cd apps/rider-mobile
flutter pub get

# Android emulator → gateway on the host (this is also the default)
flutter run --dart-define=API_URL=http://10.0.2.2:8080/api/v1

# iOS simulator
flutter run --dart-define=API_URL=http://localhost:8080/api/v1

# physical phone on the same Wi-Fi
flutter run --dart-define=API_URL=http://192.168.1.20:8080/api/v1
```

| `--dart-define` | Default | Purpose |
|---|---|---|
| `API_URL` | `http://10.0.2.2:8080/api/v1` | Gateway base URL including `/api/v1`. The Socket.IO endpoint (`/ws`, namespace `/tracking`) is derived from its origin. |
| `MAP_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Base map for the demand map. OSM's public tiles are for light use only; use your own tile service in production. |

Plain HTTP is allowed for local development only: Android debug builds set
`usesCleartextTraffic` (`android/app/src/debug/AndroidManifest.xml`) and iOS
allows `NSAllowsLocalNetworking`. Release builds need an HTTPS gateway.

**Demo login:** `+91 97400 10101` (others: `+91 97400 1010x`). With the dev
backend the OTP request returns the code, and the sign-in screen shows it. If
you hit the OTP rate limit: `redis-cli --scan --pattern 'otp:*' | xargs -r redis-cli del`.

## Features

| Tab | What it does | Endpoints |
|---|---|---|
| **Sign-in** | Phone OTP via the core `LoginScreen`. Accounts without the `RIDER` role are refused ("This number is not registered as a FoodGrid rider.") and signed straight out. A restored session without the role is sent back to sign-in too. | `auth/otp/request`, `auth/otp/verify`, `auth/me` |
| **Duty** (home) | Greeting with rating and delivery count. Online/offline switch (going online sends the current fix), today's earnings, and the location-sharing status. **Offers** (polled every 5 s while online, and refreshed at once on the socket's `offer:new`) show a countdown, pickup, drop, distances, COD and estimated earning, with Accept and Reject (with a reason). **Active deliveries** (polled every 10 s) show where to go, *Navigate* (Google Maps, `travelmode=two-wheeler`), *Call restaurant/customer*, and one large step button: ASSIGNED → arrived-pickup → AT_PICKUP → picked-up → PICKED_UP → arrived-drop → AT_DROP → complete. The **complete sheet** needs the customer's 4-digit OTP, takes an optional camera handover photo (uploaded to `delivery-proof`), plus "I collected ₹X in cash" for COD. Fail-delivery sheet. **Best route** card with ordered stops and a full-route Maps link. | `riders/me`, `riders/me/online`, `riders/me/offline`, `riders/me/location`, `riders/me/offers`, `deliveries/offers/{id}/accept\|reject`, `riders/me/deliveries/current`, `deliveries/{id}/arrived-pickup\|picked-up\|arrived-drop\|complete\|fail`, `riders/me/route`, `media/presign` |
| **Earnings** | Presets: Today, 7 days, 30 days, This month (IST `yyyy-MM-dd` from `istToday`). KPI tiles (earned, deliveries, per delivery, today), a daily bar chart (tap a bar to inspect it) with a list alternative, and a by-type breakdown. Wallet balance (a negative one reads −₹1,390.80) with a **Cash due** notice when it is negative (COD cash the rider holds beyond their earnings), a paged statement, payout history, and a cash-out dialog (₹100 to balance, UPI or bank on file). Cash-out is disabled while a payout is REQUESTED or PROCESSING. | `riders/me/earnings`, `wallets/me?as=RIDER`, `wallets/me/payouts` |
| **Performance** | Incentives with a progress meter, reward, status and **"Ends <last day>"** (`endsAt − 1 ms`, because schemes end at midnight IST). For `RATING` schemes it explains that progress is paused while the rider's rating is below `minRating`. Monthly attendance calendar (Monday first) with days worked, hours and deliveries. | `riders/me/incentives`, `riders/me/attendance?month=yyyy-MM` |
| **Demand** | `flutter_map` with zone polygons (rings of `[lng, lat]`), labels without the "Bengaluru - " prefix and surge, demand circles sized by open orders and shaded on a sequential blue ramp (`#cfe1f7` → `#13498e`) by orders per rider, a legend, and the rider's position. **Busiest spots** names each cell by the containing zone whose centre is nearest, with distance from the rider and a navigate button. | `riders/heatmap` |
| **Trips** | Delivery history with infinite scroll: outlet → customer, order number, IST time, distance, earning plus tip, status. | `riders/me/deliveries?page` |

Socket events in the rider's room (`offer:new`, `order:ready`,
`delivery:cancelled`) refresh the right data and show a message. A new offer
announced on another tab has a *View* action that goes back to Duty.

UX: Material 3 FoodGrid theme with larger buttons (52–60 dp primary actions,
48 dp minimum targets) for use on a bike mount. Statuses always use
`StatusChip` (icon plus label). Icon buttons have tooltips, and charts, the
calendar and the map have semantic summaries. Money uses Indian grouping and
times are IST. Every section has loading, empty and error-with-retry states.

## Location

* **While online** the app streams positions (`LocationService.watch`, 25 m
  filter) and posts `riders/me/location {lat, lng, accuracyM, speedKmph, heading}`
  at most every **20 s**. It keeps the last fix. When the rider stands still it
  re-sends that fix every 60 s, because the server's live position expires after
  10 minutes and a stale rider drops out of dispatch.
* **Before `arrived-pickup`, `arrived-drop` and `complete`** it sends a fresh
  fix: `current()` with a 6 s timeout, falling back to the last streamed fix if
  it is under 60 s old (as `duty.tsx` does). Completion is geofenced to 500 m
  of the drop point. A `409 TOO_FAR_FROM_DROP` keeps the sheet open with *"You're
  too far from the drop location to complete this order. Move within 500 m of
  the customer's address and try again."* `OTP_REQUIRED`, `OTP_MISMATCH`,
  `OTP_LOCKED`, `OTP_UNAVAILABLE`, `INVALID_PROOF_PHOTO` and `COD_NOT_COLLECTED`
  also get rider-facing wording.

### Background location: what to expect

* **Android.** While online, `RiderLocationService` (a local subclass of the
  core `LocationService`) runs geolocator's **foreground service** of type
  `location` with an ongoing "You are online on FoodGrid" notification. Updates
  then continue with the screen off or the app in the background. The service
  starts from the foreground, so `ACCESS_BACKGROUND_LOCATION` is not requested.
  Android 14+ requires `FOREGROUND_SERVICE_LOCATION`, which is declared.
  Limits: aggressive OEM battery savers (Xiaomi, Oppo, Vivo, Samsung "deep
  sleep") can still kill the process, so riders should exempt the app from
  battery optimisation. Force-stopping the app or swiping it away on some OEMs
  stops tracking until it is reopened. On Android 13+ the notification is only
  visible if notifications are allowed; the service runs either way.
* **iOS.** `UIBackgroundModes: location`, plus `allowBackgroundLocationUpdates`
  with the blue status-bar indicator while online. When-in-use permission is
  enough because updates start in the foreground. `NSLocationAlwaysAndWhenInUseUsageDescription`
  is present in case Always is granted. Limits: if the rider force-quits the app
  from the app switcher, iOS stops updates and does not relaunch it. There is
  no significant-change or region monitoring.
* **In the background** the 5 s offer polling and the socket are suspended (iOS)
  or throttled (Android). Riders learn about new offers through **push** (below),
  which brings them back to the app. The countdown is server-side, so an offer
  seen late may already have expired.
* Going offline (or signing out, which goes offline first when no delivery is
  in progress) stops the stream and the heartbeat.

## Permissions

| Platform | Permission / key | Why |
|---|---|---|
| Android | `INTERNET` | API, socket, map tiles |
| Android | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Going online, live location, geofenced steps |
| Android | `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` | Location while online with the screen off |
| Android | `CAMERA` (camera feature optional) | Proof-of-delivery photo. `image_picker` requests it at runtime because it is declared. |
| Android | `<queries>` for `https` VIEW and `tel` DIAL | Maps directions and calls via `url_launcher` |
| iOS | `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes: location` | As above |
| iOS | `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` | Proof photo |
| iOS | `LSApplicationQueriesSchemes: tel, https` | Calling and Maps |

Android `applicationId` is `in.foodgrid.rider`, the iOS bundle id is
`in.foodgrid.rider`, and both are labelled "FoodGrid Rider".

## Push notifications

The app does not bundle a push plugin. Registration is wired through
`registerPushToken` from `foodgrid_core`. `pushRegistrationProvider`
(`lib/src/push/push.dart`) calls it for the signed-in rider with the token from
`pushTokenSourceProvider`, which returns `null` until a plugin supplies one. To
enable push:

1. Add `firebase_messaging` (plus `google-services.json` and
   `GoogleService-Info.plist`, the APNs key, and `POST_NOTIFICATIONS` on Android 13+).
2. Override the token source in `main()`:
   ```dart
   pushTokenSourceProvider.overrideWithValue(() => FirebaseMessaging.instance.getToken()),
   ```
3. On `FirebaseMessaging.instance.onTokenRefresh`, invalidate
   `pushRegistrationProvider` (it registers again). Call `unregisterPushToken`
   on sign-out if the device should stop receiving a rider's pushes.

The shell re-registers whenever a different rider signs in.

## Architecture

* Riverpod 3 without code generation, and go_router 18 with a session redirect
  (`/splash` → `/login` → a `StatefulShellRoute` with five tabs), routes declared
  with `materialRoute` from `foodgrid_core`.
* `ProviderScope(retry: retryTransientErrors)` from `foodgrid_core`: offline and
  5xx failures are retried up to three times; 4xx answers fail at once. Screens
  also poll and offer "Try again".
* Polling uses `pollEvery(ref, duration)`, a self-invalidating timer inside the
  provider. Riverpod pauses providers on off-stage tabs, so hidden tabs stop
  polling.
* Repositories watch the signed-in user id, so a different rider signing in
  starts from fresh data. Signing out disconnects the tracking socket (core).

```
lib/
  main.dart                     ProviderScope + AppConfig(app: rider)
  src/app.dart                  MaterialApp.router, rider theme (bigger targets)
  src/router.dart               routes, session redirect, RIDER-only sign-in
  src/shell/home_shell.dart     bottom nav; keeps location, socket and push alive
  src/common/                   JSON readers, polling, device seams (location,
                                url opener, camera), error wording, widgets
  src/profile/profile.dart      RiderProfile, profileProvider (online/offline)
  src/duty/                     models, repository, providers, location tracker,
                                socket events, duty screen and its cards/sheets
  src/earnings/                 earnings, wallet, payouts, bar chart, cash-out
  src/performance/              incentives, attendance calendar
  src/demand/                   heatmap models/geometry, map screen
  src/trips/                    paged history
  src/push/push.dart            push token registration
```

## Tests

```sh
flutter analyze   # No issues found
flutter test
```

Widget tests never touch the network, GPS, camera or socket. `test/helpers.dart`
provides:

* `FakeApi`, a Dio `HttpClientAdapter` (as in `packages/flutter_core/test/api_client_test.dart`)
  that answers registered routes and records every request with its body and
  headers. The `ApiClient` uses it with a `MemoryTokenStore`.
* `FakeLocation`, a `LocationService` with a fixed fix and a controllable stream,
  injected through `locationServiceProvider`.
* The core `FakeSocketTransport` behind the tracking socket
  (`socketTransportProvider`): tests play rider-room events with
  `socket.receive('offer:new', …)`.
* Overrides for `urlOpenerProvider` (records Maps and tel links) and
  `mapTilesProvider` (no tile downloads).

Coverage:

* `duty_test.dart`
  * accepting an offer (countdown, POST, the delivery appears) and rejecting it with a reason
  * a delivery moving through every step, with `riders/me/location` sent before
    `arrived-pickup`, `arrived-drop` and `complete` but not `picked-up`
  * the fallback to the last streamed fix when GPS is slow
  * COD completion (body `{otp, codCollected: true}`)
  * the `TOO_FAR_FROM_DROP` and `OTP_MISMATCH` messages
  * navigate and call links
  * going online with the current fix
* `earnings_test.dart`
  * totals for the default 7-day IST range, the **Cash due** notice for a
    negative balance with cash-out disabled
  * statement paging and the Today preset
  * the cash-out request body and idempotency key
  * cash-out blocked while a payout is in flight
* `performance_test.dart`
  * "Ends Sun, 11 Oct" for an `endsAt` of `2026-10-11T18:30:00Z`
  * the paused-rating note, and no note when the rating is high enough
  * the attendance calendar and month switching
* `demand_test.dart`
  * `[lng, lat]` ring handling, point-in-polygon, naming by nearest centre, the ramp and radii
  * the busiest-spots list with distance and navigation
* `app_test.dart`
  * signed-out start, refusing a non-rider login, a restored session landing on Duty
  * switching tabs
  * socket events (offer on another tab with *View*, cancellations)
  * sign-out going offline first and disconnecting the socket
* `models_test.dart`
  * parsing of decimal strings, IST presets, zero-filled daily series, wallet and
    payout states, incentive last day and paused logic
  * error wording and the redirect rules

## Known limitations

* No push plugin is bundled (see above), so offers reach a backgrounded app only
  once push is configured.
* Tapping a demand circle does not show a tooltip. The busiest-spots list and
  zone list carry the details instead.
* The proof photo is uploaded when the rider taps *Mark delivered*, not in the
  background ahead of time. On a slow network the button shows "Uploading photo…".
* Map tiles come from OpenStreetMap by default (see `MAP_TILE_URL`).

## Issues found in `foodgrid_core` (still worked around here)

1. `LocationService.watch()` uses plain `LocationSettings`: no Android
   foreground service and no iOS background updates. Its `Position → Fix`
   mapping is private, and core has no provider for the service. Worked around
   with a `RiderLocationService` subclass and an app-level `locationServiceProvider`.
2. `LocationService.current()` has a fixed 15 s limit and no "last known /
   maximum age" option. The app wraps it with its own 6 s timeout and keeps its
   own last fix.
3. `LoginScreen.authorize` only runs at sign-in. A restored session is not
   re-checked, so the router enforces the RIDER role itself.
4. There is no weekday date formatter (needed for incentive end dates). The app
   uses `intl` directly, with `show DateFormat`, because intl's `TextDirection`
   clashes with Flutter's.

Fixed in core since: the tracking socket disconnects on sign-out, the sign-in
resend row wraps on narrow phones, and the paged envelope is `PagedResult`
(no clash with Flutter's `Page`).
