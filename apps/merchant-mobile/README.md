# FoodGrid Business (merchant-mobile)

Flutter app for restaurant and food-cart owners and staff: live orders with a
new-order chime, kitchen display, menu stock switches, inventory, purchasing,
today's sales, counter billing (POS) and reviews. It talks to the same gateway
endpoints as `apps/restaurant-web` / `apps/vendor-web` (ported from
`packages/ui/src/merchant/*.tsx`) and is built on `packages/flutter_core`
(`foodgrid_core`).

## Run

```sh
export PATH=/opt/flutter/bin:$PATH
cd apps/merchant-mobile
flutter pub get

# Android emulator → gateway on the host (this is also the default)
flutter run --dart-define=API_URL=http://10.0.2.2:8080/api/v1
# iOS simulator / desktop
flutter run --dart-define=API_URL=http://localhost:8080/api/v1
# production
flutter run --release --dart-define=API_URL=https://api.foodgrid.in/api/v1
```

Debug Android builds allow cleartext HTTP for the local gateway; iOS allows
local networking only (`NSAllowsLocalNetworking`). Release builds expect HTTPS.

Demo accounts (password `FoodGrid@2026`): `owner@spicegarden.demo` (restaurant,
2 outlets), `chef@spicegarden.demo`, `cashier@spicegarden.demo`,
`owner@momowagon.demo` and `owner@chaatstreet.demo` (food carts). Staff can
also sign in with a mobile OTP.

## Flow

`/splash` → `/login` (email + password or mobile OTP; an account with no
restaurant or food cart is refused there with an explanation) → `/business`
when the token has no business (several memberships; exactly one eligible
business is opened automatically through `auth/switch-tenant`) → `/outlet` when
the business has several outlets and none is remembered → home tabs. The chosen outlet is remembered per business
(`shared_preferences`). Only RESTAURANT and FOOD_CART businesses are accepted.

## Features

| Tab / screen | What it does | API |
| --- | --- | --- |
| **Orders** (home) | Board for the outlet grouped **New / Preparing / Ready / Done today** (IST). It joins the outlet's room on the tracking socket (`outlet:subscribe`) and refreshes at once on `order:new` and `order:status`; polling every 10 s is the fallback (every 30 s while the socket is connected). A newly placed order plays a chime, buzzes and shows a banner; the tab carries a badge with waiting orders. Accept with a prep-time picker (10–45 min), reject with a reason, start preparing, mark ready, hand over (takeaway / dine-in), cancel (detail screen). Order detail: items, variants, add-ons, notes, customer, address, payment status and the full bill with CGST / SGST. | `GET merchant/orders?outletId&status=…` (+ `from`/`to` for done today), `GET merchant/orders/{id}`, `POST merchant/orders/{id}/accept {prepTimeMins}` / `reject {reason}` / `preparing` / `ready` / `complete` / `cancel {reason}` |
| **Kitchen** | KDS tickets by station (filter chips) in Queued / Cooking / Ready tabs, oldest first, polled every 5 s. Timers count up every second with colour + icon + word: *On time*, *Due soon* (12 min), *Overdue* (20 min). Start, ready, served (bump), recall. | `GET kds/tickets?outletId&station`, `POST kds/tickets/{id}/start\|ready\|bump\|recall` |
| **Counter** (POS) | Category chips, search, big item buttons, variant / add-on picker; bill with quantities, takeaway / dine-in + table, customer, flat discount, UPI / cash / card; charge with an `Idempotency-Key` per bill; GST receipt (CGST, SGST, packaging, round-off). Open counter / QR orders can be handed over. Food carts get this tab second. | `GET merchant/outlets/{id}/menu`, `GET merchant/outlets/{id}/tables`, `POST pos/orders`, `POST pos/orders/{id}/complete` |
| **Menu** | Dishes by category with search and an "out of stock only" filter; in / out of stock switches (instant, rolled back if refused), whole-category on / off. | `GET merchant/outlets/{id}/menu`, `POST merchant/items/availability {itemIds, isAvailable}` |
| More → **Today's sales** | Today / yesterday / any day: sales, orders, average ticket, GST, payment and channel split, hourly bars (with a list view for screen readers) and top dishes. | `GET pos/summary?outletId&date` |
| More → **Inventory** | Stock value, low / out-of-stock alert tiles (tap to filter), expiring batches, category chips (flour, oil, sugar, dairy, vegetables, packaging, spices, other), status chips, search; receive stock, record wastage, stock count. | `GET inventory/summary`, `GET inventory/ingredients`, `POST inventory/stock/receive\|wastage\|adjust` |
| More → **Purchasing** | POs needing approval and in progress, reorder alerts (this outlet / all), dashboard numbers. PO detail: approve & send / reject with comment (owner), submit, cancel, receive goods, tracking, timeline. Alerts: raise a PO via the supplier engine, dismiss. | `GET procurement/dashboard`, `GET procurement/purchase-orders`, `GET …/{id}`, `POST …/{id}/approve\|reject\|cancel\|submit\|receive`, `GET procurement/alerts`, `POST procurement/alerts/{id}/dismiss`, `POST procurement/purchase-orders/auto` |
| More → **Reviews** | Ratings with filters (all, not replied, 3★ or less), pages, reply. | `GET merchant/reviews?outletId&page`, `POST merchant/reviews/{id}/reply` |
| More | Outlet open / closed switch, switch outlet, switch business, sign out. | `POST merchant/outlets/{id}/availability {isOpen}` |

Empty, loading and error states have retry; a failed background refresh keeps
the last data on screen with an "Offline / Couldn't refresh" banner. Money is
Indian-formatted, times are IST.

## Roles

Permissions mirror `TENANT_ROLE_PERMISSIONS` (`packages/auth/src/permissions.ts`),
see `lib/core/permissions.dart`. The API enforces them; the app hides what a
role can't do, and any 403 is explained with the server's message ("Your role
can't manage orders. Ask the business owner for access.").

| Role | Orders | Kitchen | Counter | Menu stock | Sales | Inventory | Purchasing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Owner | all actions | ✓ | ✓ | ✓ | ✓ | manage | approve |
| Manager | all actions | ✓ | ✓ | ✓ | ✓ | manage | raise / cancel, no approval |
| Cashier | accept, reject, hand over | ✓ | ✓ | ✓ | ✓ | – | – |
| Chef / Staff | view; preparing / ready | ✓ | – | ✓ | – | view (chef) | – |
| Accountant | view | – | – | view | ✓ | view | view |
| Procurement manager | – ¹ | – | – | – | – | manage | raise / cancel |

¹ `GET merchant/outlets` requires `orders:read`, which the procurement-manager
role lacks, so that role can't load its outlets (on the web dashboards either)
and sees the server's explanation after sign-in.

## Push notifications

The app has no push plugin yet (Firebase needs per-environment config files).
After adding one (e.g. `firebase_messaging`), register the token after sign-in
and whenever it rotates:

```dart
import 'package:merchant_mobile/core/push.dart';

await registerMerchantPush(ref, token);   // POST devices {token, platform, app: MERCHANT}
await unregisterMerchantPush(ref, token); // before signing out
```

These wrap `registerPushToken` / `unregisterPushToken` from `foodgrid_core`.
Until then new orders reach the open app over the tracking socket (with polling
as the fallback) and chime.

## Code layout

```
lib/
  main.dart, app.dart, router.dart   ProviderScope (core retry policy), theme, go_router (materialRoute) with the session redirect
  core/        permissions, JSON readers, shared widgets, outlet store, order alert, timings, push
  features/    auth, outlets, orders, kitchen, menu, pos, inventory, procurement, sales, reviews, more, shell, splash
assets/sounds/new_order.wav          new-order chime
```

Riverpod 3 without code generation; plain models with `fromJson`.

## Tests

```sh
flutter analyze
flutter test
```

Widget tests run the whole app (router, shell, providers) against an in-memory
gateway (`test/helpers.dart`: a Dio `HttpClientAdapter` fake, `MemoryTokenStore`,
the core `FakeSocketTransport` for the tracking socket, polling and timers off),
so they never touch the network. They cover the board grouping and accepting
with a prep time, a chef's restricted actions and explained 403s (the server's
message, or an older server's bare "Missing permission"), the new-order alert,
the board refreshing on `order:new` / `order:status` from the outlet room, the
business picker and `switch-tenant` (both answer shapes, auto-open, refusal at
sign-in and for a restored session), outlet choice, KDS overdue labels and bump,
menu availability (and rollback), the POS bill total, idempotency key and GST
receipt, and PO approval by the owner vs. a manager.
