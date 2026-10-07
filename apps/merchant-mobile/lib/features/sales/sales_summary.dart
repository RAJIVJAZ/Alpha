import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';
import '../outlets/outlet_providers.dart';

class HourSales {
  const HourSales(this.hour, this.orders, this.sales);
  final int hour;
  final int orders;
  final double sales;

  /// "1 pm", "11 am" (IST business hours).
  String get label {
    final h = hour % 12 == 0 ? 12 : hour % 12;
    return '$h ${hour < 12 ? 'am' : 'pm'}';
  }
}

class TopItem {
  const TopItem(this.name, this.quantity, this.sales);
  final String name;
  final int quantity;
  final double sales;
}

/// GET pos/summary: the IST business day's totals, payment split, hourly
/// sales and top dishes.
class SalesSummary {
  const SalesSummary({
    required this.date,
    this.orders = 0,
    this.cancelled = 0,
    this.grossSales = 0,
    this.taxCollected = 0,
    this.discounts = 0,
    this.averageTicket = 0,
    this.byPaymentMethod = const {},
    this.byChannel = const {},
    this.hourly = const [],
    this.topItems = const [],
  });

  final String date;
  final int orders;
  final int cancelled;
  final double grossSales;
  final double taxCollected;
  final double discounts;
  final double averageTicket;

  /// Sales amount per payment method / channel.
  final Map<String, double> byPaymentMethod;
  final Map<String, double> byChannel;
  final List<HourSales> hourly;
  final List<TopItem> topItems;

  /// Hours worth charting: trading hours (6 am onwards, as the web) plus any hour with sales.
  List<HourSales> get tradingHours => [for (final h in hourly) if (h.hour >= 6 || h.orders > 0) h];

  factory SalesSummary.fromJson(Json j) => SalesSummary(
        date: str(j['date']),
        orders: intOf(j['orders']),
        cancelled: intOf(j['cancelled']),
        grossSales: dec(j['grossSales']),
        taxCollected: dec(j['taxCollected']),
        discounts: dec(j['discounts']),
        averageTicket: dec(j['averageTicket']),
        byPaymentMethod: _sorted(mapOf(j['byPaymentMethod'])),
        byChannel: _sorted(mapOf(j['byChannel'])),
        hourly: [for (final h in listOfMaps(j['hourly'])) HourSales(intOf(h['hour']), intOf(h['orders']), dec(h['sales']))],
        topItems: [for (final t in listOfMaps(j['topItems'])) TopItem(str(t['name']), intOf(t['quantity']), dec(t['sales']))],
      );

  static Map<String, double> _sorted(Json m) {
    final entries = [for (final e in m.entries) MapEntry(e.key, dec(e.value))]..sort((a, b) => b.value.compareTo(a.value));
    return Map.fromEntries(entries);
  }
}

/// Business day shown on the sales screen (IST yyyy-MM-dd).
class SalesDate extends Notifier<String> {
  @override
  String build() => istToday();

  void set(String date) => state = date;
}

final salesDateProvider = NotifierProvider<SalesDate, String>(SalesDate.new);

final salesSummaryProvider = FutureProvider.autoDispose<SalesSummary>((ref) async {
  final outletId = ref.watch(currentOutletIdProvider);
  final date = ref.watch(salesDateProvider);
  if (outletId == null) return SalesSummary(date: date);
  return SalesSummary.fromJson(await ref.watch(apiClientProvider).get<Map<String, dynamic>>('pos/summary', query: {'outletId': outletId, 'date': date}));
});
