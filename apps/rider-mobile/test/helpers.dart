import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:rider_mobile/src/app.dart';
import 'package:rider_mobile/src/common/device.dart';
import 'package:rider_mobile/src/demand/demand_screen.dart';
import 'package:rider_mobile/src/duty/rider_events.dart';

const testConfig = AppConfig(app: ClientApp.rider, apiUrl: 'http://api.test/api/v1');

/// One request the app made.
class Call {
  Call(this.method, this.path, this.query, this.body, this.headers);
  final String method;
  final String path;
  final Map<String, dynamic> query;
  final Object? body;
  final Map<String, dynamic> headers;

  @override
  String toString() => '$method $path${query.isEmpty ? '' : ' $query'}${body == null ? '' : ' $body'}';
}

typedef Responder = Object? Function(Call call);

/// An in-memory gateway: answers from registered routes, records every call,
/// and never touches the network. Unknown routes answer 404.
class FakeApi implements HttpClientAdapter {
  final _routes = <String, (int, Responder)>{};
  final calls = <Call>[];

  /// Registers `METHOD /path` (no `/api/v1` prefix). Throw an [ApiError] from
  /// [respond] to answer with an error envelope.
  void on(String method, String path, Responder respond, {int status = 200}) => _routes['$method $path'] = (status, respond);

  List<Call> posts() => calls.where((c) => c.method == 'POST').toList();
  List<String> postPaths() => posts().map((c) => c.path).toList();
  Iterable<Call> called(String method, String path) => calls.where((c) => c.method == method && c.path == path);

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final path = o.path.startsWith('/') ? o.path : '/${o.path}';
    final call = Call(o.method, path, Map.of(o.queryParameters), o.data, Map.of(o.headers));
    calls.add(call);
    final route = _routes['${o.method} $path'];
    int status;
    Object? body;
    if (route == null) {
      (status, body) = (404, {'statusCode': 404, 'code': 'NOT_FOUND', 'message': 'No fake for ${o.method} $path'});
    } else {
      try {
        (status, body) = (route.$1, route.$2(call));
      } on ApiError catch (e) {
        (status, body) = (e.status, {'statusCode': e.status, 'code': e.code, 'message': e.message});
      }
    }
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

/// Thrown by a [Responder] to answer with the services' error envelope.
class ApiError implements Exception {
  const ApiError(this.status, this.code, this.message);
  final int status;
  final String code;
  final String message;
}

ApiClient fakeClient(FakeApi api, {TokenStore? tokens}) => ApiClient(config: testConfig, tokens: tokens ?? MemoryTokenStore(), dio: Dio()..httpClientAdapter = api);

/// Location without GPS: a fixed fix, and a stream the test can drive.
class FakeLocation extends LocationService {
  FakeLocation({this.fix = (lat: 12.93548, lng: 77.61067, accuracyM: 8.0, speedKmph: 18.0, heading: 90.0)});

  Fix fix;
  int currentCalls = 0;
  final stream = StreamController<Fix>.broadcast();

  @override
  Future<void> ensurePermission() async {}

  @override
  Future<Fix> current() async {
    currentCalls++;
    return fix;
  }

  @override
  Stream<Fix> watch({int distanceFilterM = 25}) => stream.stream;
}

/// Everything a screen needs, with no network, GPS, camera or socket.
class TestRig {
  TestRig({FakeApi? api, FakeLocation? location, TokenStore? tokens})
      : api = api ?? FakeApi(),
        location = location ?? FakeLocation(),
        tokens = tokens ?? MemoryTokenStore();

  final FakeApi api;
  final FakeLocation location;
  final TokenStore tokens;
  final opened = <Uri>[];
  final events = StreamController<RiderEvent>.broadcast();

  List<Override> get overrides => [
        appConfigProvider.overrideWithValue(testConfig),
        tokenStoreProvider.overrideWithValue(tokens),
        apiClientProvider.overrideWithValue(fakeClient(api, tokens: tokens)),
        locationServiceProvider.overrideWithValue(location),
        riderEventsProvider.overrideWith((ref) => events.stream),
        urlOpenerProvider.overrideWithValue((uri) async {
          opened.add(uri);
          return true;
        }),
        mapTilesProvider.overrideWithValue(false),
        ...extra,
      ];

  /// Further overrides for a single test.
  final extra = <Override>[];

  /// Pumps [home] inside the rider theme on a phone-sized screen.
  Future<void> pump(WidgetTester tester, Widget home, {double width = 412, double height = 1500}) async {
    _phone(tester, width: width, height: height);
    await tester.pumpWidget(ProviderScope(
      retry: (_, _) => null,
      overrides: overrides,
      child: MaterialApp(theme: riderTheme(FoodGridTheme.light()), home: home),
    ));
    await settle(tester);
  }

  /// Pumps the whole app (router, session, shell). [width] is in logical
  /// pixels; the core LoginScreen's resend row needs more than a phone's
  /// width with the test font (see README, core issues).
  Future<void> pumpApp(WidgetTester tester, {double width = 412}) async {
    _phone(tester, width: width);
    await tester.pumpWidget(ProviderScope(retry: (_, _) => null, overrides: overrides, child: const RiderApp()));
    await settle(tester);
  }

  static void _phone(WidgetTester tester, {double width = 412, double height = 1500}) {
    tester.view.physicalSize = Size(width * 3, height * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
  }
}

/// Lets fake requests, microtasks and short animations finish without
/// waiting for periodic timers (pumpAndSettle would chase the countdowns).
Future<void> settle(WidgetTester tester, {int frames = 12}) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

String jwt(Map<String, dynamic> claims) {
  String part(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${part({'alg': 'none'})}.${part(claims)}.sig';
}

String riderToken({List<String> roles = const ['RIDER']}) => jwt({
      'sub': 'u-rider',
      'roles': roles,
      'name': 'Ishaan Bhat',
      'exp': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000,
    });

// ─── fixtures shaped like the live gateway's responses ─────────────────────

Map<String, dynamic> profileJson({bool online = true, bool onDelivery = false, double rating = 4.6, String status = 'ACTIVE'}) => {
      'id': 'r1',
      'userId': 'u-rider',
      'status': status,
      'name': 'Ishaan Bhat',
      'phone': '+919740010101',
      'city': 'Bengaluru',
      'vehicleType': 'SCOOTER',
      'vehicleNumber': 'KA-03-MR-4364',
      'rating': rating,
      'ratingCount': 183,
      'isOnline': online,
      'isOnDelivery': onDelivery,
      'currentLat': 12.9436,
      'currentLng': 77.6241,
      'acceptanceRate': 0.924,
      'totalDeliveries': 710,
      'bankAccount': {'ifsc': 'HDFC0001234', 'last4': '5567', 'holder': 'Ishaan Bhat'},
      'upiId': 'ishaan1@okaxis',
    };

Map<String, dynamic> deliveryJson({String id = 'd1', String status = 'ASSIGNED', bool cod = false}) => {
      'id': id,
      'orderId': 'o-$id',
      'orderNumber': 'ORD-261007-00005',
      'status': status,
      'pickupName': 'Spice Garden - Koramangala',
      'pickupAddress': '80 Feet Road, 4th Block, Koramangala',
      'pickupLat': 12.9372,
      'pickupLng': 77.6235,
      'pickupPhone': '+919900010001',
      'dropName': 'Neha Singh',
      'dropAddress': '#443, 5th Cross, Bengaluru 560034',
      'dropLat': 12.93548,
      'dropLng': 77.61067,
      'dropPhone': '+919845010014',
      'distanceKm': 1.8,
      'estimatedMins': 10,
      'orderValue': '583',
      'isCod': cod,
      'codAmount': cod ? '583' : '0',
      'tipAmount': '20',
      'riderEarning': '37.6',
      'createdAt': '2026-10-06T19:50:44.663Z',
    };

Map<String, dynamic> offerJson({String id = 'of1', Duration expiresIn = const Duration(seconds: 30), bool cod = false}) => {
      'id': id,
      'deliveryId': 'd1',
      'riderId': 'r1',
      'status': 'PENDING',
      'distanceToPickupKm': 1.2,
      'estimatedEarning': '45',
      'expiresAt': DateTime.now().add(expiresIn).toUtc().toIso8601String(),
      'delivery': {
        'id': 'd1',
        'orderNumber': 'ORD-261007-00005',
        'pickupName': 'Spice Garden - Koramangala',
        'pickupAddress': '80 Feet Road, 4th Block, Koramangala',
        'pickupLat': 12.9372,
        'pickupLng': 77.6235,
        'dropAddress': '#443, 5th Cross, Bengaluru 560034',
        'dropLat': 12.93548,
        'dropLng': 77.61067,
        'distanceKm': 3.4,
        'isCod': cod,
        'codAmount': cod ? '583' : '0',
      },
    };

/// The routes the duty screen polls, with sensible defaults.
void dutyRoutes(FakeApi api, {Map<String, dynamic>? profile, List<Object?> Function()? offers, List<Object?> Function()? current}) {
  api
    ..on('GET', '/riders/me', (_) => profile ?? profileJson())
    ..on('GET', '/riders/me/offers', (_) => offers?.call() ?? const [])
    ..on('GET', '/riders/me/deliveries/current', (_) => current?.call() ?? const [])
    ..on('GET', '/riders/me/earnings', (_) => {'total': 0, 'deliveries': 0, 'averagePerDelivery': 0, 'today': 250, 'byType': {}, 'daily': []})
    ..on('GET', '/riders/me/route', (_) => {'stops': [], 'totalKm': 0, 'totalMins': 0, 'improvedByKm': 0, 'navigationUrl': null})
    ..on('POST', '/riders/me/location', (_) => {'accepted': true});
}
