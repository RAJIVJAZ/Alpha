import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';
import '../common/session_scope.dart';
import 'models.dart';

final performanceRepositoryProvider = Provider<PerformanceRepository>((ref) {
  ref.watch(riderUserIdProvider);
  return PerformanceRepository(ref.watch(apiClientProvider));
});

class PerformanceRepository {
  PerformanceRepository(this._api);
  final ApiClient _api;

  Future<List<Incentive>> incentives() async => [for (final i in jsonList(await _api.get<List<dynamic>>('riders/me/incentives'))) Incentive.fromJson(i)];

  Future<Attendance> attendance(String month) async => Attendance.fromJson(await _api.get<Json>('riders/me/attendance', query: {'month': month}));
}

final incentivesProvider = FutureProvider<List<Incentive>>((ref) => ref.watch(performanceRepositoryProvider).incentives());

/// The month shown in the attendance calendar (yyyy-MM, IST).
final attendanceMonthProvider = NotifierProvider<AttendanceMonthController, String>(AttendanceMonthController.new);

class AttendanceMonthController extends Notifier<String> {
  @override
  String build() => currentMonth();

  static String currentMonth() => istToday().substring(0, 7);

  bool get canGoForward => state.compareTo(currentMonth()) < 0;

  void shift(int months) {
    final y = int.parse(state.substring(0, 4));
    final m = int.parse(state.substring(5, 7)) - 1 + months;
    final next = '${(y + (m / 12).floor()).toString().padLeft(4, '0')}-${(m % 12 + 1).toString().padLeft(2, '0')}';
    if (next.compareTo(currentMonth()) <= 0) state = next;
  }
}

final attendanceProvider = FutureProvider.autoDispose.family<Attendance, String>((ref, month) => ref.watch(performanceRepositoryProvider).attendance(month));
