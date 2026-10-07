## Unreleased

- Breaking: `Page` is now `PagedResult` (no clash with Flutter's `Page`); `TokenStore` also keeps
  the last signed-in user; `TrackingSocket` takes a `SocketTransport` (fake it with
  `FakeSocketTransport` through `socketTransportProvider`).
- `switchTenant` accepts the login shape with a rotated refresh token (and still the bare access
  token of older servers); memberships keep `tenantStatus` and `outletIds`.
- Tracking socket: per-order `onOrder`, outlet rooms (`subscribeOutlet`, `onOutlet`), re-join after
  reconnect, disconnect on sign-out.
- `LoginScreen`: wrapping resend row, `authorizeUser`, `onSignedIn`, `onClose`, `notice`.
- Session: offline launches keep the last user and memberships; `isRestoring` / `isSignedOut`.
- `materialRoute` / `materialPage` for go_router 18, `distanceKm`, signed `money`,
  `retryTransientErrors`, friendlier `ErrorView`, `AsyncView.sliver` and `errorBuilder`.

## 0.0.1

- API client with single-flight token refresh, session state, sign-in screen,
  theme, Indian formatting, shared widgets, live tracking socket, location and
  media upload.
