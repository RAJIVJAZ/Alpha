import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:go_router/go_router.dart';

import '../common/links.dart';

/// Sign-in (phone OTP, or Google when configured). Afterwards the customer
/// returns where they were: a pushed sign-in pops, a guarded page continues
/// to [from].
class SignInScreen extends ConsumerWidget {
  const SignInScreen({super.key, this.from});

  /// The page that asked for sign-in.
  final String? from;

  void _continue(BuildContext context) {
    final router = GoRouter.of(context);
    final target = from;
    if (target == null || target.isEmpty) {
      router.canPop() ? router.pop() : router.go('/');
    } else if (tabRoots.contains(Uri.parse(target).path) || !router.canPop()) {
      router.go(target);
    } else {
      router.pushReplacement(target);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(sessionProvider, (previous, next) {
      if (previous?.value == null && next.value != null) _continue(context);
    });
    final canPop = GoRouter.of(context).canPop();
    return Stack(children: [
      const LoginScreen(
        title: 'Sign in to FoodGrid',
        subtitle: 'Order from restaurants and food carts near you, track deliveries live and pay in one tap.',
        allowGoogle: true,
      ),
      SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: IconButton(
            tooltip: canPop ? 'Back' : 'Close',
            icon: Icon(canPop ? Icons.arrow_back : Icons.close),
            onPressed: () => canPop ? context.pop() : context.go('/'),
          ),
        ),
      ),
    ]);
  }
}

/// Sends a signed-out customer to sign in; they come back here afterwards.
void signInFirst(BuildContext context) => context.push('/login');
