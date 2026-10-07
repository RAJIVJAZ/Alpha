import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'router.dart';

/// FoodGrid theme with bigger targets for gloved hands on a bike mount.
ThemeData riderTheme(ThemeData base) {
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(12));
  return base.copyWith(
    materialTapTargetSize: MaterialTapTargetSize.padded,
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size(64, 52), shape: shape, textStyle: base.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size(64, 48), shape: shape)),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: const Size(48, 48))),
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(minimumSize: const Size(48, 48))),
    navigationBarTheme: NavigationBarThemeData(height: 72, labelBehavior: NavigationDestinationLabelBehavior.alwaysShow, indicatorColor: base.colorScheme.primaryContainer),
    listTileTheme: const ListTileThemeData(minVerticalPadding: 10),
  );
}

class RiderApp extends ConsumerWidget {
  const RiderApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp.router(
        title: 'FoodGrid Rider',
        debugShowCheckedModeBanner: false,
        theme: riderTheme(FoodGridTheme.light()),
        darkTheme: riderTheme(FoodGridTheme.dark()),
        routerConfig: ref.watch(routerProvider),
      );
}
