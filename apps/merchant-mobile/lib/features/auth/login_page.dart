import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'authorize.dart';

/// Password (owners, managers) or mobile OTP (staff phones).
class LoginPage extends ConsumerWidget {
  const LoginPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return LoginScreen(
      title: 'FoodGrid Business',
      subtitle: 'Live orders, kitchen, menu and stock for your restaurant or food cart.',
      notice: ref.watch(loginNoticeProvider),
      modes: const [LoginMode.password, LoginMode.otp],
      authorize: authorizeMerchant,
      // someone with a pending invitation stays signed in to accept it in the business picker
      authorizeUser: (user) async => eligibleMemberships(user.memberships).isNotEmpty || (await ref.read(pendingInvitesProvider.future)).isNotEmpty
          ? null
          : notMerchantMessage,
      onSignedIn: (_) => ref.read(loginNoticeProvider.notifier).clear(),
    );
  }
}
