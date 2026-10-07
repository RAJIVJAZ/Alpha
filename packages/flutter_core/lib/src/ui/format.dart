import 'package:intl/intl.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
final _inrWhole = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _int = NumberFormat.decimalPattern('en_IN');

double _num(Object? v) => v is num ? v.toDouble() : double.tryParse(v?.toString() ?? '') ?? double.nan;

/// ₹1,23,456.50 (Indian digit grouping). Accepts numbers or decimal strings.
/// Negative amounts take a true minus (−₹1,234.50); [signed] also marks
/// positive ones (+₹50.00), for credits and debits.
String money(Object? value, {bool whole = false, bool signed = false}) {
  final n = _num(value);
  if (n.isNaN) return '—';
  final f = whole ? _inrWhole : _inr;
  final s = f.format(n.abs());
  // sign from the rounded amount: −0.001 is ₹0.00, not −₹0.00
  if (s == f.format(0)) return s;
  return n < 0 ? '−$s' : signed ? '+$s' : s;
}

/// ₹950, ₹38K, ₹6.5L, ₹3.4Cr — thousand, lakh, crore.
String moneyCompact(Object? value) {
  final n = _num(value);
  if (n.isNaN) return '—';
  if (n.abs() < 1000) return money(n, whole: true);
  return '${n < 0 ? '−' : ''}₹${compactIndian(n.abs())}';
}

/// 12.5K, 6.5L, 3.4Cr.
String compactIndian(num n) {
  final a = n.abs();
  final (div, suffix) = a >= 1e7 - 5e3 ? (1e7, 'Cr') : a >= 1e5 - 50 ? (1e5, 'L') : (1e3, 'K');
  final v = n / div;
  final rounded = v.abs() >= 100 ? v.round().toString() : ((v * 10).round() / 10).toString().replaceAll(RegExp(r'\.0$'), '');
  return '$rounded$suffix';
}

String number(Object? value) {
  final n = _num(value);
  return n.isNaN ? '—' : _int.format(n);
}

/// The services return UTC instants; FoodGrid shows India Standard Time everywhere.
/// (Formats use en_US symbols, which intl ships without initialisation.)
DateTime toIst(DateTime d) => d.toUtc().add(const Duration(hours: 5, minutes: 30));

DateTime? _parse(Object? v) => v is DateTime ? v : DateTime.tryParse(v?.toString() ?? '');

/// 7 Oct, 2:22 pm (IST)
String dateTime(Object? v) {
  final d = _parse(v);
  return d == null ? '—' : DateFormat('d MMM, h:mm a', 'en_US').format(toIst(d)).replaceAll('AM', 'am').replaceAll('PM', 'pm');
}

/// 7 Oct 2026 (IST)
String date(Object? v) {
  final d = _parse(v);
  return d == null ? '—' : DateFormat('d MMM yyyy', 'en_US').format(toIst(d));
}

/// 2:22 pm (IST)
String time(Object? v) {
  final d = _parse(v);
  return d == null ? '—' : DateFormat('h:mm a', 'en_US').format(toIst(d)).replaceAll('AM', 'am').replaceAll('PM', 'pm');
}

/// "just now", "4 min ago", "2 h ago", "3 days ago"
String relative(Object? v, {DateTime? now}) {
  final d = _parse(v);
  if (d == null) return '—';
  final diff = (now ?? DateTime.now()).difference(d);
  if (diff.inSeconds < 45) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
  if (diff.inHours < 24) return '${diff.inHours} h ago';
  if (diff.inDays < 7) return '${diff.inDays} day${diff.inDays == 1 ? '' : 's'} ago';
  return date(d);
}

/// Today's calendar date in IST as yyyy-MM-dd (what date-only API params expect).
String istToday({int offsetDays = 0, DateTime? now}) => DateFormat('yyyy-MM-dd', 'en_US').format(toIst(now ?? DateTime.now()).add(Duration(days: offsetDays)));

const _acronyms = {'GST', 'UPI', 'COD', 'KDS', 'PO', 'OTP', 'QR', 'POS', 'ETA', 'SKU', 'MOQ', 'KYC', 'ID', 'UTR'};

/// PENDING_PAYMENT → "Pending payment", COD_PENDING → "COD pending".
String humanize(String? value) {
  if (value == null || value.isEmpty) return '';
  final words = value.split(RegExp(r'[_\s]+')).where((w) => w.isNotEmpty).toList();
  return [
    for (var i = 0; i < words.length; i++)
      _acronyms.contains(words[i].toUpperCase())
          ? words[i].toUpperCase()
          : i == 0
              ? '${words[i][0].toUpperCase()}${words[i].substring(1).toLowerCase()}'
              : words[i].toLowerCase(),
  ].join(' ');
}
