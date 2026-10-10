import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'router.dart';

class MerchantApp extends ConsumerWidget {
  const MerchantApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp.router(
        title: 'FoodGrid Business',
        debugShowCheckedModeBanner: false,
        theme: _kitchen(FoodGridTheme.light()),
        darkTheme: _kitchen(FoodGridTheme.dark()),
        routerConfig: ref.watch(routerProvider),
        builder: (_, child) => PushListener(child: child!),
      );

  /// FoodGrid theme with larger tap targets and labels for a busy counter.
  static ThemeData _kitchen(ThemeData base) => base.copyWith(
        navigationBarTheme: base.navigationBarTheme.copyWith(
          labelTextStyle: WidgetStatePropertyAll(base.textTheme.labelLarge),
          height: 72,
        ),
        tabBarTheme: base.tabBarTheme.copyWith(labelStyle: base.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
      );
}
