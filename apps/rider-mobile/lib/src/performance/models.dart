import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../common/json.dart';

/// GET riders/me/incentives: a scheme with this rider's progress.
class Incentive {
  const Incentive({
    required this.id,
    required this.name,
    this.description,
    required this.type,
    required this.target,
    required this.progress,
    required this.rewardAmount,
    required this.status,
    this.minRating,
    this.startsAt,
    required this.endsAt,
  });

  final String id;
  final String name;
  final String? description;

  /// ORDER_COUNT, PEAK_HOURS, RATING…
  final String type;
  final int target;
  final int progress;
  final double rewardAmount;

  /// IN_PROGRESS, ACHIEVED, EXPIRED…
  final String status;
  final double? minRating;
  final DateTime? startsAt;

  /// Exclusive end: schemes end at midnight IST.
  final DateTime endsAt;

  bool get achieved => status == 'ACHIEVED';
  double get fraction => target <= 0 ? 0 : (progress / target).clamp(0, 1).toDouble();

  /// The last day that counts, e.g. "Sun, 11 Oct": a scheme ending at
  /// midnight belongs to the day before.
  String get lastDayLabel => DateFormat('EEE, d MMM', 'en_US').format(toIst(endsAt.subtract(const Duration(milliseconds: 1))));

  /// A RATING scheme only counts deliveries while the rider's rating is at
  /// least [minRating].
  bool pausedFor(double rating) => type == 'RATING' && minRating != null && rating < minRating! && !achieved;

  factory Incentive.fromJson(Json j) => Incentive(
        id: strOf(j['id']),
        name: strOf(j['name']),
        description: strOrNull(j['description']),
        type: strOf(j['type']),
        target: intOf(j['target']),
        progress: intOf(j['progress']),
        rewardAmount: dec(j['rewardAmount']),
        status: strOf(j['status'], 'IN_PROGRESS'),
        minRating: numOrNull(j['minRating']),
        startsAt: dateOrNull(j['startsAt']),
        endsAt: dateOrNull(j['endsAt']) ?? DateTime.now(),
      );
}

class AttendanceDay {
  const AttendanceDay({required this.date, required this.status, required this.onlineMinutes, required this.deliveryCount, required this.distanceKm});

  /// yyyy-MM-dd
  final String date;
  final String status;
  final int onlineMinutes;
  final int deliveryCount;
  final double distanceKm;

  bool get present => status == 'PRESENT';

  factory AttendanceDay.fromJson(Json j) => AttendanceDay(
        date: strOf(j['date']).substring(0, 10),
        status: strOf(j['status']),
        onlineMinutes: intOf(j['onlineMinutes']),
        deliveryCount: intOf(j['deliveryCount']),
        distanceKm: numOf(j['distanceKm']),
      );
}

/// GET riders/me/attendance?month=yyyy-MM
class Attendance {
  const Attendance({required this.month, required this.presentDays, required this.onlineHours, required this.deliveries, required this.days});
  final String month;
  final int presentDays;
  final double onlineHours;
  final int deliveries;
  final List<AttendanceDay> days;

  factory Attendance.fromJson(Json j) => Attendance(
        month: strOf(j['month']),
        presentDays: intOf(j['presentDays']),
        onlineHours: numOf(j['onlineHours']),
        deliveries: intOf(j['deliveries']),
        days: [for (final d in jsonList(j['days'])) AttendanceDay.fromJson(d)],
      );
}
