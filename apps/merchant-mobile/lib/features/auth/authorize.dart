import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/permissions.dart';

const notMerchantMessage =
    'FoodGrid Business is for restaurant and food-cart teams. This account is not linked to a restaurant or food cart; '
    'ask the owner to add you as staff, or use the FoodGrid web dashboard.';

/// LoginScreen gate: restaurant / food-cart tokens pass; a token without a
/// business passes too (sign-in then needs an eligible membership, and the
/// business picker switches to it); anything else is refused.
String? authorizeMerchant(Claims claims) {
  final type = claims.tenantType;
  if (claims.tenantId == null || type == null) return null;
  if (isMerchantTenant(type)) return null;
  return 'This is a ${humanize(type).toLowerCase()} account. FoodGrid Business is for restaurants and food carts; '
      'use the FoodGrid web dashboard for this business.';
}

/// Memberships this app can open.
List<Membership> eligibleMemberships(List<Membership> memberships) => [
      for (final m in memberships)
        if (isMerchantTenant(m.tenantType)) m,
    ];

/// One-off message shown on the sign-in screen (e.g. after being signed out
/// because no eligible business was found).
class LoginNotice extends Notifier<String?> {
  @override
  String? build() => null;

  void show(String message) => state = message;
  void clear() => state = null;
}

final loginNoticeProvider = NotifierProvider<LoginNotice, String?>(LoginNotice.new);
