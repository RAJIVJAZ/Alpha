import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import 'router.dart';

class CustomerApp extends ConsumerWidget {
  const CustomerApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'FoodGrid',
      debugShowCheckedModeBanner: false,
      theme: FoodGridTheme.light(),
      darkTheme: FoodGridTheme.dark(),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
