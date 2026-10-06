/// Which FoodGrid app is running; sent with device registrations.
enum ClientApp { customer, rider, merchant }

/// Build-time configuration, set with `--dart-define`:
///
///   flutter run --dart-define=API_URL=https://api.foodgrid.in/api/v1 \
///               --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com
///
/// The default API_URL reaches a gateway on the host from the Android emulator.
class AppConfig {
  const AppConfig({required this.app, String? apiUrl, String? googleServerClientId})
      : apiUrl = apiUrl ?? _apiUrl,
        googleServerClientId = googleServerClientId ?? (_google == '' ? null : _google);

  static const _apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8080/api/v1');
  static const _google = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

  final ClientApp app;

  /// Gateway base URL including the `/api/v1` prefix.
  final String apiUrl;

  /// Web client id used as Google `serverClientId`; null hides Google sign-in.
  final String? googleServerClientId;

  /// Origin of the gateway, which also serves the Socket.IO endpoint at `/ws`.
  String get origin => Uri.parse(apiUrl).origin;

  String get appName => switch (app) {
        ClientApp.customer => 'CUSTOMER',
        ClientApp.rider => 'RIDER',
        ClientApp.merchant => 'MERCHANT',
      };
}
