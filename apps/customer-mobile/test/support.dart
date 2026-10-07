import 'dart:convert';
import 'dart:typed_data';

import 'package:customer_mobile/src/app/app.dart';
import 'package:customer_mobile/src/app/router.dart';
import 'package:customer_mobile/src/common/local_store.dart';
import 'package:customer_mobile/src/orders/providers.dart';
import 'package:customer_mobile/src/payments/payments.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

const testConfig = AppConfig(app: ClientApp.customer, apiUrl: 'http://api.test/api/v1');

/// An unsigned JWT the client can decode (the API would verify it).
String fakeJwt({String sub = 'u-1', String name = 'Aarav Sharma'}) {
  String part(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  final exp = DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
  return '${part({'alg': 'none'})}.${part({'sub': sub, 'roles': ['CUSTOMER'], 'name': name, 'phone': '+919845000001', 'exp': exp})}.sig';
}

typedef Reply = (int status, Object? body);

/// Answers API requests from registered routes ("GET /cart") and records every
/// call, so tests never touch the network and can assert request bodies.
class FakeApi implements HttpClientAdapter {
  final _routes = <String, Reply Function(RequestOptions o)>{};
  final calls = <RequestOptions>[];

  /// Registers a reply for `METHOD /path` (path relative to /api/v1).
  void on(String route, Object? body, {int status = 200}) => _routes[route] = (_) => (status, body);

  void onCall(String route, Reply Function(RequestOptions o) reply) => _routes[route] = reply;

  List<RequestOptions> callsTo(String route) => [for (final c in calls) if ('${c.method} ${c.path}' == route) c];

  Object? lastBody(String route) => callsTo(route).lastOrNull?.data;

  /// "METHOD /path" of every call, in order.
  List<String> get log => [for (final c in calls) '${c.method} ${c.path}'];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add(options);
    final handler = _routes['${options.method} ${options.path}'];
    final (status, body) = handler == null
        ? (404, {'statusCode': 404, 'code': 'NOT_FOUND', 'message': 'No fake for ${options.method} ${options.path}'})
        : handler(options);
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

class NoGateway implements PaymentGateway {
  @override
  Future<GatewayResult> open(Map<String, dynamic> options) => throw StateError('Razorpay must not open in tests');
}

class Harness {
  Harness(this.api, this.socket, this.store);
  final FakeApi api;

  /// The tracking socket's wire: what the app sent, and server events to play.
  final FakeSocketTransport socket;
  final MemoryLocalStore store;
}

/// Pumps the whole app at [location] against [api]. Signed-in runs store a
/// session and answer auth/me.
Future<Harness> pumpApp(WidgetTester tester, FakeApi api, {String location = '/', bool signedIn = false, Size size = const Size(480, 2000)}) async {
  tester.view.physicalSize = size * 2;
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);

  final tokens = MemoryTokenStore();
  if (signedIn) {
    await tokens.write(Tokens(fakeJwt(), 'refresh-token'));
    api.on('GET /auth/me', {'id': 'u-1', 'name': 'Aarav Sharma', 'phone': '+919845000001', 'roles': ['CUSTOMER']});
  }
  final client = ApiClient(config: testConfig, tokens: tokens, dio: Dio()..httpClientAdapter = api, refreshDio: Dio()..httpClientAdapter = api);
  final socket = FakeSocketTransport();
  final store = MemoryLocalStore();
  await tester.pumpWidget(ProviderScope(
    retry: (_, _) => null,
    overrides: [
      appConfigProvider.overrideWithValue(testConfig),
      tokenStoreProvider.overrideWithValue(tokens),
      apiClientProvider.overrideWithValue(client),
      socketTransportProvider.overrideWithValue(socket),
      localStoreProvider.overrideWithValue(store),
      paymentGatewayProvider.overrideWithValue(NoGateway()),
      mapTileUrlProvider.overrideWithValue(null),
      initialLocationProvider.overrideWithValue(location),
    ],
    child: const CustomerApp(),
  ));
  await tester.pumpAndSettle();
  return Harness(api, socket, store);
}

/// Unmounts the app so periodic timers (order polling) are cancelled.
Future<void> unmount(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
}

// ---------------------------------------------------------------- fixtures

/// An outlet card as discovery sends it: `isOpen` is the outlet's "accepting
/// orders" switch, `isOpenNow` whether it can take an order right now.
Map<String, dynamic> outletJson({String id = 'o-1', String slug = 'spice-garden', String name = 'Spice Garden - Koramangala', bool open = true, bool accepting = true, bool sponsored = false, String? campaign}) => {
      'id': id,
      'slug': slug,
      'name': name,
      'type': 'RESTAURANT',
      'cuisines': ['North Indian', 'Biryani'],
      'city': 'Bengaluru',
      'lat': 12.9372,
      'lng': 77.6235,
      'ratingAvg': 4.3,
      'ratingCount': 485,
      'costForTwo': '700.00',
      'avgPrepTimeMins': 22,
      'isPureVeg': false,
      'isOpen': accepting,
      'isOpenNow': open,
      'coverImageUrl': null,
      'distanceKm': 0.3,
      'etaMins': 28,
      'sponsored': sponsored,
      'adCampaignId': campaign,
    };

Map<String, dynamic> outletDetailJson({String id = 'o-1', String slug = 'pizza-republic', bool open = true}) => {
      'id': id,
      'slug': slug,
      'type': 'RESTAURANT',
      'name': 'Pizza Republic - HSR Layout',
      'description': 'Wood-fired pizzas.',
      'cuisines': ['Pizza', 'Italian'],
      'tags': [],
      'phone': '+919900030001',
      'addressLine1': '27th Main, Sector 1',
      'addressLine2': 'HSR Layout',
      'city': 'Bengaluru',
      'pincode': '560102',
      'lat': 12.9096,
      'lng': 77.6484,
      'isPureVeg': false,
      'costForTwo': '600',
      'avgPrepTimeMins': 18,
      'minOrderValue': '199',
      'packagingCharge': '30',
      'ratingAvg': 4.2,
      'ratingCount': 539,
      'isOpen': true,
      'isOpenNow': open,
      'openingHours': [
        for (var d = 0; d < 7; d++) {'day': d, 'open': '11:00', 'close': '02:00'},
      ],
      'fssaiNumber': '12257666419190',
      'gstin': '29AAJCS3456P1ZI',
      'logoUrl': null,
      'coverImageUrl': null,
      'acceptsDelivery': true,
      'acceptsTakeaway': true,
      'acceptsQrOrders': true,
      'isMobile': false,
    };

Map<String, dynamic> cartJson({List<Map<String, dynamic>> lines = const [], String? outletId, String? couponCode}) => {
      'outletId': lines.isEmpty ? null : (outletId ?? 'o-1'),
      'outletName': lines.isEmpty ? null : 'Pizza Republic - HSR Layout',
      'couponCode': couponCode,
      'removedItems': [],
      'lines': lines,
      'pricing': null,
    };

Map<String, dynamic> lineJson({String lineId = 'l-1', String itemId = 'i-margherita', String name = 'Margherita', int qty = 1, String unit = '459.00', String? variant = 'Medium (10")', List<String> addons = const ['Extra Cheese']}) => {
      'lineId': lineId,
      'menuItemId': itemId,
      'name': name,
      'quantity': qty,
      'variantId': variant == null ? null : 'v-med',
      'variant': variant,
      'addonIds': [for (final _ in addons) 'a-cheese'],
      'addons': addons,
      'unitPrice': unit,
      'totalPrice': unit,
      'isVeg': true,
    };

Map<String, dynamic> addressJson() => {
      'id': 'addr-1',
      'label': 'Home',
      'contactName': 'Aarav Sharma',
      'contactPhone': '+919845000001',
      'line1': '#208, 1st Cross',
      'line2': null,
      'landmark': null,
      'city': 'Bengaluru',
      'state': 'Karnataka',
      'pincode': '560034',
      'lat': 12.92932,
      'lng': 77.62639,
      'isDefault': true,
    };

/// A delivery quote where membership makes delivery free (₹44 waived).
Map<String, dynamic> quoteJson(Map<String, dynamic> cart) => {
      'cart': {
        ...cart,
        'pricing': {
          'subtotal': '459.00',
          'couponDiscount': '0.00',
          'membershipDiscount': '22.95',
          'deliveryFee': '0.00',
          'packagingCharge': '30.00',
          'platformFee': '5.00',
          'cgst': '12.10',
          'sgst': '12.10',
          'igst': '0.00',
          'taxTotal': '24.20',
          'tip': '0.00',
          'roundOff': '-0.35',
          'total': '495.00',
          'savings': '66.95',
          'messages': ['Free delivery with your membership'],
        },
      },
      'delivery': {'serviceable': true, 'distanceKm': 4.37, 'deliveryFee': 44, 'etaMins': 42},
      'coupon': null,
      'isMember': true,
    };

Map<String, dynamic> orderDetailJson({String id = 'ord-1', String status = 'PLACED', String paymentStatus = 'PAID', String type = 'DELIVERY'}) => {
      'id': id,
      'orderNumber': 'ORD-261007-00042',
      'type': type,
      'channel': 'APP',
      'status': status,
      'paymentStatus': paymentStatus,
      'paymentMethod': 'UPI',
      'subtotal': '459',
      'couponDiscount': '0',
      'membershipDiscount': '22.95',
      'deliveryFee': '0',
      'packagingCharge': '30',
      'platformFee': '5',
      'taxTotal': '24.2',
      'cgst': '12.1',
      'sgst': '12.1',
      'igst': '0',
      'tip': '0',
      'roundOff': '-0.35',
      'total': '495',
      'couponCode': null,
      'deliveryAddress': {'label': 'Home', 'line1': '#208, 1st Cross', 'city': 'Bengaluru', 'pincode': '560034', 'lat': 12.92932, 'lng': 77.62639},
      'specialInstructions': null,
      'cancelReason': null,
      'createdAt': '2026-10-07T10:00:00.000Z',
      'placedAt': '2026-10-07T10:00:05.000Z',
      'items': [
        {
          'id': 'oi-1',
          'menuItemId': 'i-margherita',
          'name': 'Margherita',
          'variant': 'Medium (10")',
          'addons': [
            {'id': 'a-cheese', 'name': 'Extra Cheese', 'price': '60.00'},
          ],
          'quantity': 1,
          'unitPrice': '459',
          'totalPrice': '459',
          'isVeg': true,
          'notes': null,
        },
      ],
      'outlet': {'name': 'Pizza Republic - HSR Layout', 'slug': 'pizza-republic', 'phone': '+919900030001', 'lat': 12.9096, 'lng': 77.6484, 'addressLine1': '27th Main, Sector 1'},
      'review': null,
    };

Map<String, dynamic> trackingJson({String id = 'ord-1', String status = 'PLACED', String? otp, bool rider = false, int? eta = 30}) => {
      'orderId': id,
      'orderNumber': 'ORD-261007-00042',
      'status': status,
      'deliveryStatus': rider ? 'PICKED_UP' : null,
      'timeline': [
        {'status': 'PLACED', 'at': '2026-10-07T10:00:05.000Z', 'note': 'Payment received'},
        if (rider) ...[
          {'status': 'ACCEPTED', 'at': '2026-10-07T10:01:00.000Z', 'note': null},
          {'status': 'PREPARING', 'at': '2026-10-07T10:02:00.000Z', 'note': null},
          {'status': 'PICKED_UP', 'at': '2026-10-07T10:20:00.000Z', 'note': null},
        ],
      ],
      'rider': rider ? {'id': 'r-1', 'name': 'Aadhya Iyer', 'phone': '+919740010107', 'vehicleNumber': 'KA-01-MR-1897', 'rating': 4.57, 'lat': 12.9094, 'lng': 77.6472} : null,
      'outlet': {'name': 'Pizza Republic - HSR Layout', 'lat': 12.9096, 'lng': 77.6484},
      'drop': {'lat': 12.92932, 'lng': 77.62639, 'label': 'Home', 'line1': '#208, 1st Cross'},
      'etaMins': eta,
      'deliveryOtp': otp,
    };

/// Finds [finder] after scrolling the first scrollable until it's built.
Future<void> scrollTo(WidgetTester tester, Finder finder, {Finder? scrollable}) async {
  await tester.scrollUntilVisible(finder, 300, scrollable: scrollable ?? find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

extension Tap on WidgetTester {
  /// Taps and pumps frames without settling (a spinner keeps running while a
  /// sheet or dialog it opened is up).
  Future<void> tapAndPump(Finder f) async {
    await ensureVisible(f);
    await pump();
    await tap(f);
    await pump();
    await pump(const Duration(milliseconds: 500));
    await pump(const Duration(milliseconds: 500));
  }

  Future<void> tapAndSettle(Finder f) async {
    await ensureVisible(f);
    await pumpAndSettle();
    await tap(f);
    await pumpAndSettle();
  }
}

/// Text in the widget tree (any widget), for assertions on rich text.
Finder textContaining(String s) => find.byWidgetPredicate((w) => w is Text && (w.data ?? w.textSpan?.toPlainText() ?? '').contains(s));

Widget wrap(Widget child) => MaterialApp(home: child);
