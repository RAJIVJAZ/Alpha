import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';
import '../common/session_scope.dart';
import 'models.dart';

final earningsRepositoryProvider = Provider<EarningsRepository>((ref) {
  ref.watch(riderUserIdProvider);
  return EarningsRepository(ref.watch(apiClientProvider));
});

/// Earnings (delivery-service) and the rider wallet (payment-service).
class EarningsRepository {
  EarningsRepository(this._api);
  final ApiClient _api;

  static const statementPageSize = 15;

  Future<Earnings> earnings({required String from, required String to}) async =>
      Earnings.fromJson(await _api.get<Json>('riders/me/earnings', query: {'from': from, 'to': to}));

  Future<WalletView> wallet({int page = 1}) async =>
      WalletView.fromJson(await _api.get<Json>('wallets/me', query: {'as': 'RIDER', 'page': page, 'pageSize': statementPageSize}));

  Future<List<Payout>> payouts() async => [for (final p in jsonList(await _api.get<List<dynamic>>('wallets/me/payouts'))) Payout.fromJson(p)];

  /// Cash-out; [idempotencyKey] makes a retried request safe.
  Future<void> requestPayout({required double amount, required String method, required Json destination, required String idempotencyKey}) =>
      _api.post<dynamic>('wallets/me/payouts', body: {'amount': amount, 'method': method, 'destination': destination}, idempotencyKey: idempotencyKey);
}
