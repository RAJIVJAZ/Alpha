import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';
import 'models.dart';

/// Wallet balance for the payment picker.
final walletBalanceProvider = FutureProvider.autoDispose<double>((ref) async {
  final json = asJson(await ref.watch(apiClientProvider).get<dynamic>('wallets/me', query: {'pageSize': 1}));
  return toNum(asJson(json['wallet'])['balance']);
});

/// What a quote depends on; the cart signature refreshes it when lines change.
typedef QuoteArgs = ({String orderType, double? lat, double? lng, int tip, String method, String cart});

/// The bill for the current cart (POST cart/quote).
final quoteProvider = FutureProvider.autoDispose.family<Quote, QuoteArgs>((ref, a) async {
  final delivery = a.orderType == 'DELIVERY';
  final json = await ref.watch(apiClientProvider).post<dynamic>('cart/quote', body: {
    'orderType': a.orderType,
    if (delivery) 'lat': a.lat,
    if (delivery) 'lng': a.lng,
    if (delivery) 'tip': a.tip,
    'paymentMethod': a.method,
  });
  return Quote.fromJson(asJson(json));
});
