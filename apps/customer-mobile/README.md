# FoodGrid — customer app (Flutter)

The FoodGrid customer app for Android and iOS. Customers find restaurants and food carts near them, order for delivery or takeaway, pay, and follow the order live. They can also order from a table by scanning its QR code. The app uses the same gateway API as the web storefront (`packages/ui/src/customer`) and builds on the shared `foodgrid_core` package (`packages/flutter_core`).

## Features

| Area | What it does |
| --- | --- |
| Location | Pick a saved address, the device location or a popular Bengaluru area. The choice is kept on the device. Signed-in customers start from their default address. |
| Home | Offer banners with deep links (`foodgrid://offers/CODE` opens the cart with the coupon, `collections/x` opens search, `outlets/slug` opens the outlet). "Order again" reorders straight into the cart. Rails for recommended, top rated and fastest places; a rail that repeats an earlier one is skipped. "All places near you" has type, pure veg, rating 4.0+ and open-now filters, six sort orders and infinite scroll. Closed places are dimmed and labelled "Closed now". Sponsored cards show "Ad" and report the click. |
| Search | Suggestions (restaurants, cuisines, dishes) as you type, with a debounce; results show places and dishes. |
| Outlet | Menu with rating, distance, cost for two, and a closed notice with the next opening time (IST). Offers show when signed in. Veg-only toggle, in-menu search and a "Menu" jump list. A customisation sheet handles variants and add-on groups (min/max rules, live price). Add, steppers and remove all update the server cart; switching restaurants asks first and retries with `replace: true`. "Goes well with" suggestions. Tabs for reviews, meal plans (subscribe, then pay) and info (hours, FSSAI, GSTIN, call). |
| Cart and checkout | Delivery or takeaway, addresses and a new-address form (pin from the device or the area), tips, coupons, and payment by UPI, card, net banking, wallet (shows the balance; disabled when too low) or cash on delivery (delivery only). The live bill comes from `POST cart/quote`: a waived delivery fee shows struck through with "FREE", and unserviceable addresses, the minimum order and a closed kitchen show as blockers. Placing the order uses an Idempotency-Key, then payment, then tracking. |
| Payments | A wallet payment that is captured straight away needs nothing more. In the sandbox, a sheet lets you simulate the bank's answer. Otherwise Razorpay Checkout opens, followed by `payments/verify`. The checkout keeps a snapshot of the cart until payment ends, so the payment UI is never torn down. |
| Orders | History with infinite scroll, status chips, track, reorder and rate. |
| Tracking | Status, ETA and the delivery OTP. An OpenStreetMap map shows the restaurant, you, and the rider's live pin (Socket.IO `rider:location`); the screen also polls every 10 s while the order is active. A timeline runs from placed to delivered. You can call the rider or the restaurant, cancel while pending payment or placed, retry a pending payment, and review once delivered. |
| Wallet | Balance, top-up through UPI, and a paged statement. |
| FoodGrid One | Plans, your current membership with savings, and join, extend or switch (payment purpose `MEMBERSHIP`). |
| Meal plans | Progress, skip days from tomorrow onwards, and cancel. |
| Account | Profile (name, email, invite code); addresses (add, edit, delete, make default); notification preferences; sign out. |
| Notifications | Inbox with unread state; tap to open the linked order; mark all read. |
| Table QR ordering | Scan with the camera, or type the code (`…/t/<token>` or the bare token). The table menu builds a local cart that survives restarts. Pay at the counter without signing in, or sign in to pay now. Errors such as `409 OUTLET_CLOSED` ("The kitchen is closed right now") show in the sheet. |

Browsing (home, search, outlets, table menus, membership plans) is public. The cart, orders, wallet, meal plans, notifications and account require sign-in. A guarded page sends you to sign in and then returns you to it. Adding a dish while signed out asks you to sign in first, then brings you back to the menu.

## Project layout

```
lib/
  main.dart                 ProviderScope + AppConfig(app: customer)
  src/app/                  MaterialApp.router, go_router routes + session redirect, tab shell, sign-in
  src/common/               JSON readers, local store, deep links, opening hours, shared widgets
  src/location/             Place (persisted), area list, location sheet
  src/discovery/            home, search, outlet cards, nearby paging
  src/outlet/               menu models, outlet page, customise sheet, add-to-cart flow
  src/cart/                 cart controller, checkout, bill, coupons, address form
  src/payments/             payment intents, sandbox sheet, Razorpay gateway
  src/orders/               history, detail + live tracking, map, review form
  src/wallet/  src/membership/  src/meal_plans/  src/account/  src/notifications/  src/table/
```

The app uses Riverpod 3 without code generation (`Provider`, `FutureProvider(.family)`, `Notifier` and `AsyncNotifier`), go_router 18 and plain Dart models with `fromJson`. The server decides money values; they arrive as decimal strings and are shown with `money()` (Indian grouping). All times are shown in IST.

## Running

You need Flutter 3.47 and a running gateway (`http://<host>:8080/api/v1`).

```sh
cd apps/customer-mobile
flutter pub get

# Android emulator (10.0.2.2 is the host machine; this is also the default)
flutter run --dart-define=API_URL=http://10.0.2.2:8080/api/v1

# iOS simulator
flutter run --dart-define=API_URL=http://localhost:8080/api/v1

# a phone on the same Wi-Fi, with Google sign-in enabled
flutter run --dart-define=API_URL=http://192.168.1.20:8080/api/v1 \
            --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com
```

- `GOOGLE_SERVER_CLIENT_ID` is the web OAuth client id that the API verifies. Without it, the "Continue with Google" button is hidden. Google sign-in also needs the platform setup from `google_sign_in`: the Android SHA-1 and the iOS URL scheme.
- Demo customer: `+919845000001`. In development the OTP request returns `devCode`, and the sign-in screen shows it. If you hit the OTP rate limit, clear it with `redis-cli --scan --pattern 'otp:*' | xargs -r redis-cli del`.
- At night (IST) most demo restaurants are closed. You can still browse, the UI shows when each one opens, and the server rejects orders with `OUTLET_CLOSED`.
- Payments: on non-production gateways the API answers `sandbox: true`, and a sheet lets you approve or fail the payment. With live Razorpay keys, Razorpay Checkout opens instead.
- Debug Android builds allow cleartext HTTP so the app can reach a local gateway (`src/debug/AndroidManifest.xml`). Release builds need HTTPS. On iOS, `NSAllowsLocalNetworking` permits plain HTTP to local hosts only.

### Platform configuration

- Android: application id `in.foodgrid.customer`, label "FoodGrid", `minSdk` 24. Permissions: `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` and `CAMERA`. The manifest also declares `tel:` and `https` intent queries for `url_launcher`.
- iOS: bundle id `in.foodgrid.customer`, display name "FoodGrid". `Info.plist` sets `NSLocationWhenInUseUsageDescription` and `NSCameraUsageDescription`, plus `LSApplicationQueriesSchemes` (`tel`, `https`).

## Push notifications (FCM)

The notification service delivers order updates to registered device tokens. This repository contains no Firebase project files, so wiring is left to each deployment:

1. Add `firebase_core` and `firebase_messaging`. Put `google-services.json` in `android/app/` and `GoogleService-Info.plist` in `ios/Runner/`, then run `flutterfire configure`.
2. After sign-in, and whenever the token rotates, register it with the helper from `foodgrid_core`:

   ```dart
   // e.g. in CustomerApp.build or a small ConsumerStatefulWidget near the root
   ref.listen(sessionProvider, (prev, next) async {
     final api = ref.read(apiClientProvider);
     final config = ref.read(appConfigProvider);
     final messaging = FirebaseMessaging.instance;
     if (next.value != null && prev?.value == null) {
       await messaging.requestPermission();
       final token = await messaging.getToken();
       if (token != null) await registerPushToken(api, config, token);
       messaging.onTokenRefresh.listen((t) => registerPushToken(api, config, t));
     }
   });
   ```

   Call `unregisterPushToken(api, token)` before signing out.
3. Pushes carry `data.deepLink` (for example `foodgrid://orders/<id>`). On `FirebaseMessaging.onMessageOpenedApp`, and for the initial message, pass it to `openLink(context, deepLink)` from `lib/src/common/links.dart`. That maps it to an app route, in the same way the notifications inbox does.

## Tests

```sh
flutter analyze   # No issues found
flutter test      # widget + unit tests, no network
```

The tests pump the whole app (router, theme, providers) inside a `ProviderScope`. These overrides replace the real services:

- `apiClientProvider` uses an `ApiClient` whose Dio has a fake `HttpClientAdapter` (`FakeApi` in `test/support.dart`). It answers registered routes and records every request.
- `tokenStoreProvider` uses `MemoryTokenStore`. A signed-in run stores an unsigned test JWT and fakes `auth/me`.
- `trackingSocketProvider` uses a socket that never connects; tests push events into it.
- `localStoreProvider` stores values in memory, `paymentGatewayProvider` throws if Razorpay is opened, and `mapTileUrlProvider` is `null`, so no tiles are fetched.

Coverage:

- `home_test.dart`: banners, rails (duplicate rail skipped), nearby outlets from a fake page, the "Closed now" and "Ad" labels, filters, ad-click reporting, and area choice persisted.
- `outlet_test.dart`: a plain add (exact `POST cart/items` body), a customised add (variant, add-ons, live price), outlet mismatch followed by a `replace` retry, signed-out to sign-in, and a closed outlet.
- `checkout_test.dart`: the bill with the waived delivery fee struck through, the quote body and re-quote on tip, the closed-kitchen blocker, and place order → sandbox payment → tracking screen (it also asserts the cart is not refetched while paying), plus a failed payment that leads to retry and cancel.
- `tracking_test.dart`: status, ETA, delivery OTP, rider, map and timeline; the live rider pin over the socket; polling; cancel with a reason; the review body.
- `table_test.dart`: QR order body and idempotency key, `409 OUTLET_CLOSED` shown, pay-now requiring sign-in, and an unknown table.
- `signin_test.dart`: OTP sign-in from a guarded page, then back to that page; sign-out.
- `logic_test.dart`: deep-link mapping, table-token parsing, next opening time in IST, unit price, and the session redirect.

## Known limitations

- `foodgrid://` links are handled inside the app (banners, inbox, pushes). No OS-level custom-scheme or App Link intent filters are registered yet.
- Map tiles come from `tile.openstreetmap.org`. Production traffic should use a tile provider that complies with the OSM tile usage policy; change `mapTileUrlProvider`.
- Demo image URLs do not resolve, so every image falls back to a neutral placeholder.
- Android and iOS builds were not run here because those SDKs are not installed. `flutter analyze` and `flutter test` were.
