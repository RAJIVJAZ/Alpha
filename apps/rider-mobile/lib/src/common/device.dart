import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import 'widgets.dart';

/// Device location. Tests override this with a fake.
final locationServiceProvider = Provider<LocationService>((ref) => const RiderLocationService());

/// [LocationService] whose stream keeps running while the app is in the
/// background during a shift: a foreground-service notification on Android,
/// background location updates (with the blue status-bar pill) on iOS.
/// `current()` and permissions come from foodgrid_core unchanged.
class RiderLocationService extends LocationService {
  const RiderLocationService();

  @override
  Stream<Fix> watch({int distanceFilterM = 25}) {
    final LocationSettings settings = switch (defaultTargetPlatform) {
      TargetPlatform.android => AndroidSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: distanceFilterM,
          intervalDuration: const Duration(seconds: 10),
          foregroundNotificationConfig: const ForegroundNotificationConfig(
            notificationTitle: 'You are online on FoodGrid',
            notificationText: 'Sharing your location so you get nearby orders and customers can track you.',
            notificationChannelName: 'On duty',
            setOngoing: true,
          ),
        ),
      TargetPlatform.iOS => AppleSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: distanceFilterM,
          activityType: ActivityType.automotiveNavigation,
          pauseLocationUpdatesAutomatically: false,
          showBackgroundLocationIndicator: true,
          allowBackgroundLocationUpdates: true,
        ),
      _ => LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: distanceFilterM),
    };
    return Geolocator.getPositionStream(locationSettings: settings).map(
      (p) => (
        lat: p.latitude,
        lng: p.longitude,
        accuracyM: p.accuracy,
        speedKmph: p.speed > 0 ? p.speed * 3.6 : null,
        heading: p.heading >= 0 ? p.heading : null,
      ),
    );
  }
}

/// Opens a URL in another app (Maps, the dialer). Tests record calls instead.
typedef UrlOpener = Future<bool> Function(Uri uri);

final urlOpenerProvider = Provider<UrlOpener>((ref) => (uri) => launchUrl(uri, mode: LaunchMode.externalApplication));

/// Google Maps directions on a two-wheeler from wherever the rider is.
Uri directionsUri(double lat, double lng) =>
    Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=two-wheeler');

Uri telUri(String phone) => Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'\s'), ''));

/// Opens [uri] externally and explains when no app can handle it.
Future<void> openExternal(BuildContext context, WidgetRef ref, Uri uri) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  bool ok;
  try {
    ok = await ref.read(urlOpenerProvider)(uri);
  } catch (_) {
    ok = false;
  }
  if (!ok) {
    if (messenger != null) toast(messenger, uri.scheme == 'tel' ? 'Could not start a call on this device.' : 'Could not open Maps on this device.');
  }
}

/// A proof-of-delivery photo ready to upload.
class PickedPhoto {
  const PickedPhoto({required this.bytes, required this.fileName, required this.contentType});
  final Uint8List bytes;
  final String fileName;
  final String contentType;
}

typedef PhotoTaker = Future<PickedPhoto?> Function();

/// Opens the camera; null when the rider backs out.
final photoTakerProvider = Provider<PhotoTaker>((ref) => () async {
      final shot = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1600, imageQuality: 80);
      if (shot == null) return null;
      final name = shot.name.isEmpty ? 'proof.jpg' : shot.name;
      final lower = name.toLowerCase();
      final type = shot.mimeType ??
          (lower.endsWith('.png')
              ? 'image/png'
              : lower.endsWith('.webp')
                  ? 'image/webp'
                  : 'image/jpeg');
      return PickedPhoto(bytes: await shot.readAsBytes(), fileName: name, contentType: type);
    });
