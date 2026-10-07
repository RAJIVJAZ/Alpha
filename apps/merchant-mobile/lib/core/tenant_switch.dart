import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

/// Activates a business for this session.
///
/// Works around a foodgrid_core mismatch: `AuthRepository.switchTenant`
/// expects `{tokens: {accessToken, refreshToken}}`, but auth-service answers
/// `POST auth/switch-tenant` with a flat `{accessToken, expiresIn, tokenType,
/// user}` and keeps the existing refresh token (whose family now carries the
/// new tenant). Both shapes are accepted here.
class TenantSwitcher {
  TenantSwitcher(this._api, this._tokens);

  final ApiClient _api;
  final TokenStore _tokens;

  Future<Claims> switchTo(String? tenantId) async {
    final r = await _api.post<Map<String, dynamic>>('auth/switch-tenant', body: {'tenantId': tenantId});
    final nested = r['tokens'];
    final source = nested is Map ? nested : r;
    final access = source['accessToken'];
    final refresh = source['refreshToken'] ?? (await _tokens.read())?.refreshToken;
    final claims = access is String ? Claims.fromToken(access) : null;
    if (claims == null || refresh is! String) {
      throw const ApiException(0, 'SWITCH_FAILED', 'Could not open that business. Please try again.');
    }
    await _tokens.write(Tokens(access as String, refresh));
    return claims;
  }
}

final tenantSwitcherProvider = Provider<TenantSwitcher>((ref) => TenantSwitcher(ref.watch(apiClientProvider), ref.watch(tokenStoreProvider)));
