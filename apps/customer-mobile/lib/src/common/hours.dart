import 'json.dart';

/// One opening window on a weekday (0 = Sunday), times as "HH:mm" in IST.
/// A window may run past midnight (close earlier than open).
class OpeningHours {
  const OpeningHours({required this.day, required this.open, required this.close});

  final int day;
  final String open;
  final String close;

  factory OpeningHours.fromJson(Json j) => OpeningHours(day: toInt(j['day']), open: str(j['open']), close: str(j['close']));
}

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

int _minutes(String t) => (int.tryParse(t.length >= 2 ? t.substring(0, 2) : t) ?? 0) * 60 + (t.length >= 5 ? int.tryParse(t.substring(3, 5)) ?? 0 : 0);

/// "11:30" → "11:30 am", "19:00" → "7 pm".
String clock(String t) {
  final m = _minutes(t);
  final h = m ~/ 60 % 24;
  final min = m % 60;
  final hour = h % 12 == 0 ? 12 : h % 12;
  return '$hour${min == 0 ? '' : ':${min.toString().padLeft(2, '0')}'} ${h < 12 ? 'am' : 'pm'}';
}

/// "Opens 11:30 am", "Opens tomorrow 8 am" or "Opens Mon 9 am", computed in
/// India Standard Time from the weekly hours; null when unknown.
String? nextOpening(List<OpeningHours>? hours, {DateTime? now}) {
  if (hours == null || hours.isEmpty) return null;
  final ist = (now ?? DateTime.now()).toUtc().add(const Duration(hours: 5, minutes: 30));
  final minutes = ist.hour * 60 + ist.minute;
  final today = ist.weekday % 7; // DateTime: Monday = 1 … Sunday = 7
  for (var d = 0; d < 7; d++) {
    final day = (today + d) % 7;
    final slots = hours.where((h) => h.day == day).toList()..sort((a, b) => _minutes(a.open).compareTo(_minutes(b.open)));
    for (final s in slots) {
      if (d > 0 || _minutes(s.open) > minutes) {
        if (d == 0) return 'Opens ${clock(s.open)}';
        if (d == 1) return 'Opens tomorrow ${clock(s.open)}';
        return 'Opens ${weekdays[day]} ${clock(s.open)}';
      }
    }
  }
  return null;
}
