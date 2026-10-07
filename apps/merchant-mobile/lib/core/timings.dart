import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Refresh cadence, matching the web dashboards (orders 10 s, KDS 5 s).
/// Tests override it with `AppTimings.none` so nothing polls.
class AppTimings {
  const AppTimings({this.ordersPoll, this.kdsPoll, this.purchaseOrdersPoll, this.clockTick});

  static const live = AppTimings(
    ordersPoll: Duration(seconds: 10),
    kdsPoll: Duration(seconds: 5),
    purchaseOrdersPoll: Duration(seconds: 30),
    clockTick: Duration(seconds: 1),
  );
  static const none = AppTimings();

  final Duration? ordersPoll;
  final Duration? kdsPoll;
  final Duration? purchaseOrdersPoll;

  /// How often ticket timers count up between refreshes.
  final Duration? clockTick;
}

final appTimingsProvider = Provider<AppTimings>((ref) => AppTimings.live);
