import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../outlets/outlet_providers.dart';

/// Shown while the session and the business's outlets load; outlet errors
/// get a retry (and a way out) instead of a spinner forever.
class SplashPage extends ConsumerWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final outlets = ref.watch(outletControllerProvider);
    final signedIn = ref.watch(sessionProvider.select((s) => s.value != null));
    if (signedIn && outlets.hasError && !outlets.isLoading) {
      return Scaffold(
        body: SafeArea(
          child: Column(children: [
            Expanded(child: ErrorView(error: outlets.error!, onRetry: () => ref.invalidate(outletControllerProvider))),
            TextButton(onPressed: () => signOut(ref), child: const Text('Sign out')),
            const SizedBox(height: 16),
          ]),
        ),
      );
    }
    return Scaffold(
      body: Center(
        child: Semantics(
          label: 'Loading FoodGrid Business',
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 64,
              height: 64,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: Theme.of(context).colorScheme.primary, borderRadius: BorderRadius.circular(16)),
              child: Text('FG', style: Theme.of(context).textTheme.titleLarge?.copyWith(color: Theme.of(context).colorScheme.onPrimary, fontWeight: FontWeight.bold)),
            ),
            const SizedBox(height: 24),
            const CircularProgressIndicator(),
          ]),
        ),
      ),
    );
  }
}
