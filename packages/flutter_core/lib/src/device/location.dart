import 'package:geolocator/geolocator.dart';

class LocationUnavailable implements Exception {
  const LocationUnavailable(this.message);
  final String message;
  @override
  String toString() => message;
}

typedef Fix = ({double lat, double lng, double? accuracyM, double? speedKmph, double? heading});

/// Device location with permission handling and human-readable failures.
class LocationService {
  const LocationService();

  Future<void> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) throw const LocationUnavailable('Turn on location services to continue.');
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    if (p == LocationPermission.denied) throw const LocationUnavailable('Allow location access to continue.');
    if (p == LocationPermission.deniedForever) throw const LocationUnavailable('Location is blocked for this app — enable it in Settings.');
  }

  Future<Fix> current() async {
    await ensurePermission();
    final p = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)));
    return _fix(p);
  }

  /// Positions as the device moves at least [distanceFilterM] metres.
  Stream<Fix> watch({int distanceFilterM = 25}) => Geolocator.getPositionStream(locationSettings: LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: distanceFilterM)).map(_fix);

  static Fix _fix(Position p) => (
        lat: p.latitude,
        lng: p.longitude,
        accuracyM: p.accuracy,
        speedKmph: p.speed > 0 ? p.speed * 3.6 : null,
        heading: p.heading >= 0 ? p.heading : null,
      );

  /// Great-circle distance in km.
  static double distanceKm(double lat1, double lng1, double lat2, double lng2) => Geolocator.distanceBetween(lat1, lng1, lat2, lng2) / 1000;
}
