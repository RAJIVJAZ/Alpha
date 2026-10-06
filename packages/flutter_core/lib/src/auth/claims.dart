import 'dart:convert';

/// Claims of a FoodGrid access token (decoded, not verified — the API verifies).
class Claims {
  const Claims({
    required this.sub,
    required this.roles,
    this.name,
    this.phone,
    this.tenantId,
    this.tenantType,
    this.tenantRole,
    this.outletIds = const [],
    this.expiresAt,
  });

  final String sub;
  final List<String> roles;
  final String? name;
  final String? phone;
  final String? tenantId;
  final String? tenantType;
  final String? tenantRole;
  final List<String> outletIds;
  final DateTime? expiresAt;

  bool hasRole(String role) => roles.contains(role);

  /// True when the token expires within [skew].
  bool isExpired({Duration skew = const Duration(seconds: 30)}) =>
      expiresAt != null && DateTime.now().add(skew).isAfter(expiresAt!);

  static Claims? fromToken(String? token) {
    if (token == null) return null;
    final parts = token.split('.');
    if (parts.length != 3) return null;
    try {
      final payload = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1])))) as Map<String, dynamic>;
      final exp = payload['exp'];
      return Claims(
        sub: payload['sub'] as String,
        roles: [for (final r in (payload['roles'] as List? ?? const [])) r.toString()],
        name: payload['name'] as String?,
        phone: payload['phone'] as String?,
        tenantId: payload['tenantId'] as String?,
        tenantType: payload['tenantType'] as String?,
        tenantRole: payload['tenantRole'] as String?,
        outletIds: [for (final o in (payload['outletIds'] as List? ?? const [])) o.toString()],
        expiresAt: exp is num ? DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000) : null,
      );
    } catch (_) {
      return null;
    }
  }
}
