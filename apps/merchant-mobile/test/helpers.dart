import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:merchant_mobile/app.dart';
import 'package:merchant_mobile/core/order_alert.dart';
import 'package:merchant_mobile/core/outlet_store.dart';
import 'package:merchant_mobile/core/timings.dart';
import 'package:merchant_mobile/features/orders/orders_board.dart';

const testConfig = AppConfig(app: ClientApp.merchant, apiUrl: 'http://api.test/api/v1');

/// An unsigned JWT carrying [claims] (the app only decodes them).
String jwt(Map<String, dynamic> claims) {
  String part(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  final exp = DateTime.now().add(const Duration(minutes: 15)).millisecondsSinceEpoch ~/ 1000;
  return '${part({'alg': 'none'})}.${part({'sub': 'u1', 'roles': ['CUSTOMER'], 'exp': exp, ...claims})}.sig';
}

String merchantToken({String tenantId = 't1', String tenantType = 'RESTAURANT', String role = 'OWNER'}) =>
    jwt({'name': 'Rohit Malhotra', 'tenantId': tenantId, 'tenantType': tenantType, 'tenantRole': role, 'outletIds': <String>[]});

typedef Responder = Object? Function(RequestOptions o);

/// In-memory gateway: answers `METHOD /path` routes and records every call.
/// Unrouted requests get a 404 so a test never touches the network.
class FakeBackend implements HttpClientAdapter {
  final _routes = <String, (int, Responder)>{};
  final calls = <RequestOptions>[];

  void on(String method, String path, Responder body, {int status = 200}) => _routes['$method $path'] = (status, body);

  void get(String path, Object? body) => on('GET', path, (_) => body);
  void post(String path, Object? body, {int status = 200}) => on('POST', path, (_) => body, status: status);

  List<RequestOptions> callsTo(String method, String path) => [for (final c in calls) if (c.method == method && c.path == path) c];

  /// JSON body of the last call to `METHOD path`.
  Map<String, dynamic> lastBody(String method, String path) {
    final c = callsTo(method, path);
    expect(c, isNotEmpty, reason: 'expected a $method $path call');
    return Map<String, dynamic>.from(c.last.data as Map);
  }

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add(options);
    final route = _routes['${options.method} ${options.path}'];
    final (status, body) = route == null ? (404, {'statusCode': 404, 'message': 'No fake for ${options.method} ${options.path}'}) : (route.$1, route.$2(options));
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

class RecordingAlerter implements OrderAlerter {
  final alerts = <int>[];
  @override
  Future<void> newOrders(int count) async => alerts.add(count);
}

Map<String, dynamic> userJson({List<Map<String, dynamic>>? memberships}) => {
      'id': 'u1',
      'name': 'Rohit Malhotra',
      'phone': '+919900010001',
      'email': 'owner@spicegarden.demo',
      'roles': ['CUSTOMER'],
      'memberships': memberships ??
          [
            {'tenantId': 't1', 'tenantName': 'Spice Garden', 'tenantType': 'RESTAURANT', 'role': 'OWNER'},
          ],
    };

Map<String, dynamic> outletJson({String id = 'o1', String name = 'Spice Garden - Indiranagar', String type = 'RESTAURANT', bool isOpen = true}) => {
      'id': id,
      'name': name,
      'type': type,
      'status': 'ACTIVE',
      'city': 'Bengaluru',
      'addressLine1': '100 Feet Road',
      'isOpen': isOpen,
      'avgPrepTimeMins': 24,
      'kdsStations': ['MAIN', 'TANDOOR'],
      'packagingCharge': '25',
      'acceptsDineIn': true,
      'ratingAvg': 4.3,
      'ratingCount': 372,
    };

Map<String, dynamic> orderJson(String id, String number, String status, {String type = 'DELIVERY', String channel = 'APP', DateTime? placedAt, List<Map<String, dynamic>>? items}) => {
      'id': id,
      'orderNumber': number,
      'outletId': 'o1',
      'customerName': 'Imran Bhat',
      'customerPhone': '+919845010126',
      'channel': channel,
      'type': type,
      'status': status,
      'paymentStatus': 'PAID',
      'paymentMethod': 'UPI',
      'subtotal': '458',
      'couponDiscount': '0',
      'membershipDiscount': '0',
      'packagingCharge': '25',
      'deliveryFee': '0',
      'platformFee': '5',
      'cgst': '11.45',
      'sgst': '11.45',
      'igst': '0',
      'tip': '0',
      'roundOff': '0.1',
      'total': '511',
      'placedAt': (placedAt ?? DateTime.now().toUtc().subtract(const Duration(minutes: 3))).toIso8601String(),
      'createdAt': (placedAt ?? DateTime.now().toUtc().subtract(const Duration(minutes: 3))).toIso8601String(),
      'estimatedReadyAt': null,
      'specialInstructions': null,
      'items': items ??
          [
            {'id': '${id}i1', 'name': 'Butter Naan', 'quantity': 2, 'variant': null, 'addons': [], 'unitPrice': '69', 'totalPrice': '138', 'isVeg': true, 'notes': null},
            {
              'id': '${id}i2',
              'name': 'Paneer Tikka',
              'quantity': 1,
              'variant': 'Full',
              'addons': [
                {'id': 'a1', 'name': 'Extra mint chutney', 'price': '10.00'},
              ],
              'unitPrice': '320',
              'totalPrice': '320',
              'isVeg': true,
              'notes': 'Less spicy',
            },
          ],
    };

Map<String, dynamic> page(List<Map<String, dynamic>> rows, {Map<String, int> statusCounts = const {}}) => {
      'data': rows,
      'meta': {'page': 1, 'pageSize': 100, 'total': rows.length, 'totalPages': 1},
      'statusCounts': statusCounts,
    };

/// A backend with a signed-in session, one outlet and an empty board.
FakeBackend baseBackend({Map<String, dynamic>? user, List<Map<String, dynamic>>? outlets}) {
  final b = FakeBackend();
  b.get('/auth/me', user ?? userJson());
  b.get('/merchant/outlets', outlets ?? [outletJson()]);
  b.get('/merchant/orders', page(const []));
  return b;
}

class TestApp {
  TestApp(this.backend, this.tokens, this.alerter, this.socket, this.container);
  final FakeBackend backend;
  final MemoryTokenStore tokens;
  final RecordingAlerter alerter;

  /// The tracking socket's wire: what the app sent, and server events to play.
  final FakeSocketTransport socket;
  final ProviderContainer container;
}

/// Pumps the whole app (router, shell, providers) against [backend].
Future<TestApp> pumpMerchantApp(WidgetTester tester, FakeBackend backend, {String? accessToken, Map<String, String>? savedOutlets}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 2.6;
  addTearDown(tester.view.reset);

  final tokens = MemoryTokenStore();
  await tokens.write(Tokens(accessToken ?? merchantToken(), 'refresh-1'));
  final alerter = RecordingAlerter();
  final socket = FakeSocketTransport();
  final dio = Dio()..httpClientAdapter = backend;
  final refreshDio = Dio()..httpClientAdapter = backend;

  await tester.pumpWidget(ProviderScope(
    retry: (_, _) => null,
    overrides: [
      appConfigProvider.overrideWithValue(testConfig),
      tokenStoreProvider.overrideWithValue(tokens),
      apiClientProvider.overrideWith((ref) => ApiClient(config: testConfig, tokens: tokens, dio: dio, refreshDio: refreshDio, onSessionExpired: () => ref.read(sessionProvider.notifier).expired())),
      outletStoreProvider.overrideWithValue(MemoryOutletStore(savedOutlets)),
      appTimingsProvider.overrideWithValue(AppTimings.none),
      orderAlerterProvider.overrideWithValue(alerter),
      socketTransportProvider.overrideWithValue(socket),
    ],
    child: const MerchantApp(),
  ));
  await tester.pumpAndSettle();
  final container = ProviderScope.containerOf(tester.element(find.byType(MerchantApp)));
  return TestApp(backend, tokens, alerter, socket, container);
}

/// Taps a bottom navigation destination by label.
Future<void> openTab(WidgetTester tester, String label) async {
  await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(label)));
  await tester.pumpAndSettle();
}

/// Runs one board poll. The request resolves inside the test's fake time,
/// so pump while it runs instead of awaiting it directly.
Future<void> refreshBoard(WidgetTester tester, TestApp app) async {
  final done = app.container.read(ordersBoardProvider.notifier).refresh();
  await tester.pumpAndSettle();
  await done;
  await tester.pumpAndSettle();
}
