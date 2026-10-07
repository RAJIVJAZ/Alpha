import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';

class DailyEarning {
  const DailyEarning({required this.date, required this.amount, required this.deliveries});

  /// IST calendar day, yyyy-MM-dd.
  final String date;
  final double amount;
  final int deliveries;

  factory DailyEarning.fromJson(Json j) => DailyEarning(date: strOf(j['date']).substring(0, 10), amount: numOf(j['amount']), deliveries: intOf(j['deliveries']));
}

/// GET riders/me/earnings?from&to
class Earnings {
  const Earnings({required this.total, required this.deliveries, required this.averagePerDelivery, required this.today, required this.byType, required this.daily});

  final double total;
  final int deliveries;
  final double averagePerDelivery;
  final double today;

  /// BASE_PAY, DISTANCE_PAY, SURGE, TIP, INCENTIVE… → amount.
  final Map<String, double> byType;
  final List<DailyEarning> daily;

  /// byType, largest first.
  List<MapEntry<String, double>> get breakdown => byType.entries.toList()..sort((a, b) => b.value.compareTo(a.value));

  factory Earnings.fromJson(Json j) => Earnings(
        total: numOf(j['total']),
        deliveries: intOf(j['deliveries']),
        averagePerDelivery: numOf(j['averagePerDelivery']),
        today: numOf(j['today']),
        byType: {for (final e in (jsonOrNull(j['byType']) ?? const <String, dynamic>{}).entries) e.key: numOf(e.value)},
        daily: [for (final d in jsonList(j['daily'])) DailyEarning.fromJson(d)],
      );

  /// One entry per day from [from] to [to] (yyyy-MM-dd), zero for days without
  /// deliveries, so the chart shows gaps honestly.
  List<DailyEarning> filledDays(String from, String to) {
    final byDate = {for (final d in daily) d.date: d};
    final start = DateTime.utc(int.parse(from.substring(0, 4)), int.parse(from.substring(5, 7)), int.parse(from.substring(8, 10)));
    final end = DateTime.utc(int.parse(to.substring(0, 4)), int.parse(to.substring(5, 7)), int.parse(to.substring(8, 10)));
    return [
      for (var d = start; !d.isAfter(end); d = d.add(const Duration(days: 1)))
        byDate[_ymd(d)] ?? DailyEarning(date: _ymd(d), amount: 0, deliveries: 0),
    ];
  }

  static String _ymd(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

class WalletTxn {
  const WalletTxn({required this.id, required this.type, required this.reason, required this.amount, required this.balanceAfter, this.description, this.createdAt});
  final String id;

  /// CREDIT or DEBIT.
  final String type;
  final String reason;
  final double amount;
  final double balanceAfter;
  final String? description;
  final DateTime? createdAt;

  bool get isCredit => type == 'CREDIT';

  factory WalletTxn.fromJson(Json j) => WalletTxn(
        id: strOf(j['id']),
        type: strOf(j['type']),
        reason: strOf(j['reason']),
        amount: dec(j['amount']),
        balanceAfter: dec(j['balanceAfter']),
        description: strOrNull(j['description']),
        createdAt: dateOrNull(j['createdAt']),
      );
}

/// GET wallets/me?as=RIDER: balance plus one page of the statement.
class WalletView {
  const WalletView({required this.balance, required this.status, required this.transactions, required this.page, required this.totalPages});

  /// Negative when the rider holds more COD cash than they have earned.
  final double balance;
  final String status;
  final List<WalletTxn> transactions;
  final int page;
  final int totalPages;

  bool get cashDue => balance < 0;

  factory WalletView.fromJson(Json j) {
    final wallet = jsonOrNull(j['wallet']) ?? const <String, dynamic>{};
    final meta = jsonOrNull(j['meta']) ?? const <String, dynamic>{};
    return WalletView(
      balance: dec(wallet['balance']),
      status: strOf(wallet['status'], 'ACTIVE'),
      transactions: [for (final t in jsonList(j['transactions'])) WalletTxn.fromJson(t)],
      page: intOf(meta['page'], 1),
      totalPages: intOf(meta['totalPages'], 1),
    );
  }
}

class Payout {
  const Payout({required this.id, required this.amount, required this.status, required this.method, this.upiId, this.last4, this.utr, this.failureReason, this.requestedAt, this.processedAt});
  final String id;
  final double amount;
  final String status;
  final String method;
  final String? upiId;
  final String? last4;
  final String? utr;
  final String? failureReason;
  final DateTime? requestedAt;
  final DateTime? processedAt;

  /// Still being paid: no new cash-out until it settles.
  bool get inFlight => status == 'REQUESTED' || status == 'PROCESSING';

  String get destinationLabel => upiId ?? (last4 != null ? 'A/c ••$last4' : humanize(method));

  factory Payout.fromJson(Json j) {
    final dest = jsonOrNull(j['destination']) ?? const <String, dynamic>{};
    return Payout(
      id: strOf(j['id']),
      amount: dec(j['amount']),
      status: strOf(j['status']),
      method: strOf(j['method']),
      upiId: strOrNull(dest['upiId']),
      last4: strOrNull(dest['last4']),
      utr: strOrNull(j['utr']),
      failureReason: strOrNull(j['failureReason']),
      requestedAt: dateOrNull(j['requestedAt']),
      processedAt: dateOrNull(j['processedAt']),
    );
  }
}
