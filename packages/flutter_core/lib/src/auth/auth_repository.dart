import '../api/api_client.dart';
import 'claims.dart';
import 'token_store.dart';

class OtpChallenge {
  const OtpChallenge({required this.maskedPhone, required this.resendAfter, this.devCode});
  final String maskedPhone;
  final Duration resendAfter;

  /// Only present when the server runs with OTP_EXPOSE_IN_RESPONSE (development).
  final String? devCode;
}

/// A business the signed-in user belongs to (merchant apps).
class Membership {
  const Membership({required this.tenantId, required this.tenantName, required this.tenantType, required this.role, this.tenantStatus, this.outletIds = const []});
  final String tenantId;
  final String tenantName;
  final String tenantType;
  final String role;

  /// The business's status (ACTIVE, PENDING_APPROVAL, …).
  final String? tenantStatus;

  /// Outlets this membership is limited to; empty means every outlet.
  final List<String> outletIds;

  factory Membership.fromJson(Map<String, dynamic> j) => Membership(
        tenantId: j['tenantId'] as String,
        tenantName: (j['tenantName'] ?? j['name'] ?? '') as String,
        tenantType: (j['tenantType'] ?? j['type'] ?? '') as String,
        role: (j['role'] ?? '') as String,
        tenantStatus: j['tenantStatus'] as String?,
        outletIds: [for (final o in (j['outletIds'] as List? ?? const [])) o.toString()],
      );

  Map<String, dynamic> toJson() =>
      {'tenantId': tenantId, 'tenantName': tenantName, 'tenantType': tenantType, 'role': role, 'tenantStatus': tenantStatus, 'outletIds': outletIds};
}

class SessionUser {
  const SessionUser({required this.id, this.name, this.phone, this.email, this.roles = const [], this.memberships = const []});
  final String id;
  final String? name;
  final String? phone;
  final String? email;
  final List<String> roles;
  final List<Membership> memberships;

  factory SessionUser.fromJson(Map<String, dynamic> j) => SessionUser(
        id: j['id'] as String,
        name: j['name'] as String?,
        phone: j['phone'] as String?,
        email: j['email'] as String?,
        roles: [for (final r in (j['roles'] as List? ?? const [])) r.toString()],
        memberships: [for (final m in (j['memberships'] as List? ?? const [])) Membership.fromJson(Map<String, dynamic>.from(m as Map))],
      );

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'phone': phone, 'email': email, 'roles': roles, 'memberships': [for (final m in memberships) m.toJson()]};
}

/// Sign-in flows against auth-service; successful logins store the tokens.
class AuthRepository {
  AuthRepository(this._api, this._tokens);

  final ApiClient _api;
  final TokenStore _tokens;

  Future<OtpChallenge> requestOtp(String phone) async {
    final r = await _api.post<Map<String, dynamic>>('auth/otp/request', body: {'phone': normalizePhone(phone)}, auth: false);
    return OtpChallenge(
      maskedPhone: (r['phone'] ?? phone) as String,
      resendAfter: Duration(seconds: (r['resendAfterSeconds'] as num?)?.toInt() ?? 30),
      devCode: r['devCode'] as String?,
    );
  }

  Future<Claims> verifyOtp(String phone, String code, {String? referralCode}) =>
      _login('auth/otp/verify', {'phone': normalizePhone(phone), 'code': code, 'referralCode': ?referralCode});

  Future<Claims> loginWithPassword(String email, String password) => _login('auth/password', {'email': email.trim(), 'password': password});

  Future<Claims> loginWithGoogle(String idToken) => _login('auth/google', {'idToken': idToken});

  /// Picks the active business for merchant apps; the new access token carries
  /// the tenant claims. The answer has the login shape, with a rotated refresh
  /// token whose session remembers the business; older auth-services sent a
  /// bare `accessToken` and kept the refresh token, which still works.
  Future<Claims> switchTenant(String? tenantId) async {
    final r = await _api.post<Map<String, dynamic>>('auth/switch-tenant', body: {'tenantId': tenantId});
    return _store(r['tokens'] ?? {'accessToken': r['accessToken'], 'refreshToken': (await _tokens.read())?.refreshToken});
  }

  Future<SessionUser> me() async => SessionUser.fromJson(await _api.get<Map<String, dynamic>>('auth/me'));

  Future<void> logout() async {
    final t = await _tokens.read();
    if (t != null) {
      try {
        await _api.post<void>('auth/logout', body: {'refreshToken': t.refreshToken}, auth: false);
      } catch (_) {
        // the local session ends regardless
      }
    }
    await _tokens.clear();
  }

  Future<Claims> _login(String path, Map<String, dynamic> body) async => _store((await _api.post<Map<String, dynamic>>(path, body: body, auth: false))['tokens']);

  Future<Claims> _store(Object? json) async {
    final tokens = Tokens.fromJson(json);
    final claims = Claims.fromToken(tokens?.accessToken);
    if (tokens == null || claims == null) throw StateError('Sign-in response had no tokens');
    await _tokens.write(tokens);
    return claims;
  }
}

/// "98450 00001" / "+91 98450-00001" → "+919845000001" (Indian mobiles by default).
String normalizePhone(String input) {
  final digits = input.replaceAll(RegExp(r'[^0-9+]'), '');
  if (digits.startsWith('+')) return digits;
  if (digits.length == 10) return '+91$digits';
  if (digits.length == 12 && digits.startsWith('91')) return '+$digits';
  return digits;
}
