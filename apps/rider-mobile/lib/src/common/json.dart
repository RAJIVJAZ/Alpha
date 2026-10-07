// Small readers for the services' JSON. Money arrives as decimal strings
// (read those with `dec()` from foodgrid_core); everything else is plain JSON.

typedef Json = Map<String, dynamic>;

double? numOrNull(Object? v) => v is num ? v.toDouble() : (v == null ? null : double.tryParse(v.toString()));

double numOf(Object? v, [double fallback = 0]) => numOrNull(v) ?? fallback;

int intOf(Object? v, [int fallback = 0]) => v is num ? v.toInt() : int.tryParse(v?.toString() ?? '') ?? fallback;

String strOf(Object? v, [String fallback = '']) => v?.toString() ?? fallback;

/// Null for missing or blank strings.
String? strOrNull(Object? v) {
  final s = v?.toString().trim();
  return s == null || s.isEmpty ? null : s;
}

DateTime? dateOrNull(Object? v) => v == null ? null : DateTime.tryParse(v.toString());

List<Json> jsonList(Object? v) => [for (final e in (v as List? ?? const [])) Map<String, dynamic>.from(e as Map)];

Json? jsonOrNull(Object? v) => v is Map ? Map<String, dynamic>.from(v) : null;
