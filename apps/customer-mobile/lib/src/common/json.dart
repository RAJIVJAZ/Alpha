import 'package:foodgrid_core/foodgrid_core.dart';

/// Small, forgiving readers for API JSON (decimals arrive as strings, optional
/// fields may be missing or null).
typedef Json = Map<String, dynamic>;

Json asJson(Object? v) => v is Map<String, dynamic>
    ? v
    : v is Map
        ? Map<String, dynamic>.from(v)
        : <String, dynamic>{};

List<T> listOf<T>(Object? v, T Function(Json json) item) => v is List ? [for (final e in v) if (e is Map) item(asJson(e))] : <T>[];

List<String> strings(Object? v) => v is List ? [for (final e in v) if (e != null) e.toString()] : const <String>[];

String str(Object? v, [String fallback = '']) => v == null ? fallback : v.toString();

/// Null for missing or blank strings.
String? optStr(Object? v) {
  if (v == null) return null;
  final s = v.toString();
  return s.trim().isEmpty ? null : s;
}

int toInt(Object? v, [int fallback = 0]) => v is num ? v.toInt() : int.tryParse(v?.toString() ?? '') ?? fallback;

int? optInt(Object? v) => v == null ? null : v is num ? v.toInt() : int.tryParse(v.toString());

/// Decimal (string or number) as a double; 0 when missing.
double toNum(Object? v) => dec(v);

double? optNum(Object? v) => v == null ? null : v is num ? v.toDouble() : double.tryParse(v.toString());

bool toBool(Object? v, [bool fallback = false]) => v is bool ? v : fallback;

DateTime? optDate(Object? v) => v == null ? null : DateTime.tryParse(v.toString());
