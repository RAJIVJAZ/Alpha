import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'authorize.dart';

/// Password (owners, managers) or mobile OTP (staff phones).
class LoginPage extends ConsumerWidget {
  const LoginPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notice = ref.watch(loginNoticeProvider);
    return LoginScreen(
      title: 'FoodGrid Business',
      subtitle: notice ?? 'Live orders, kitchen, menu and stock for your restaurant or food cart.',
      modes: const [LoginMode.password, LoginMode.otp],
      authorize: (claims) {
        ref.read(loginNoticeProvider.notifier).clear();
        return authorizeMerchant(claims);
      },
    );
  }
}
