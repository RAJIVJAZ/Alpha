/// Small readers for the services' JSON (decimals arrive as strings, optional
/// fields may be missing or null).
library;

typedef Json = Map<String, dynamic>;

String str(Object? v, [String fallback = '']) => v == null ? fallback : v.toString();

String? strOrNull(Object? v) {
  if (v == null) return null;
  final s = v.toString();
  return s.isEmpty ? null : s;
}

int intOf(Object? v, [int fallback = 0]) => v is num ? v.toInt() : int.tryParse(v?.toString() ?? '') ?? fallback;

double? decOrNull(Object? v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse(v.toString()));

bool boolOf(Object? v, [bool fallback = false]) => v is bool ? v : fallback;

DateTime? dateOrNull(Object? v) => v == null ? null : DateTime.tryParse(v.toString());

Json mapOf(Object? v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

List<Json> listOfMaps(Object? v) => [for (final e in (v is List ? v : const [])) if (e is Map) Map<String, dynamic>.from(e)];

List<String> listOfStrings(Object? v) => [for (final e in (v is List ? v : const [])) e.toString()];

/// A paginated envelope (`{data, meta}`) or a bare list, as a list of maps.
List<Json> rowsOf(Object? v) => v is Map ? listOfMaps(v['data']) : listOfMaps(v);

/// "2.98 kg", "47 pcs": weights and volumes to 2 decimals, counted units whole.
String qty(Object? value, String? unit) {
  final n = value is num ? value.toDouble() : double.tryParse(value?.toString() ?? '');
  if (n == null) return '—';
  final u = (unit ?? '').toUpperCase();
  const counted = {'PCS', 'PACK', 'DOZEN', 'BOX'};
  final text = counted.contains(u) ? n.round().toString() : _trim(n);
  return u.isEmpty ? text : '$text ${u.toLowerCase()}';
}

String _trim(double n) {
  final s = n.toStringAsFixed(2);
  return s.contains('.') ? s.replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '') : s;
}
