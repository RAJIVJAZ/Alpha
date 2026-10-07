/// Shared foundation for the FoodGrid Flutter apps (customer, rider, merchant):
/// API client with token refresh, session state, theme, formatting, common
/// widgets, the sign-in screen, live tracking, location and media upload.
library;

export 'src/api/api_client.dart';
export 'src/api/api_exception.dart';
export 'src/auth/auth_repository.dart';
export 'src/auth/claims.dart';
export 'src/auth/session.dart';
export 'src/auth/token_store.dart';
export 'src/config.dart';
export 'src/device/devices.dart';
export 'src/device/location.dart';
export 'src/device/media.dart';
export 'src/providers.dart';
export 'src/realtime/tracking_socket.dart';
export 'src/ui/format.dart';
export 'src/ui/login_screen.dart';
export 'src/ui/routing.dart';
export 'src/ui/theme.dart';
export 'src/ui/widgets.dart';
