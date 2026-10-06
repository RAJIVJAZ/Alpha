import 'package:flutter/material.dart';

/// FoodGrid brand: warm orange primary, neutral surfaces; status colours are
/// reserved for state and always paired with an icon and a label.
class FoodGridTheme {
  static const brand = Color(0xFFC2410C);
  static const brandDark = Color(0xFFF97316);

  static const good = Color(0xFF0CA30C);
  static const goodText = Color(0xFF006300);
  static const warning = Color(0xFFFAB219);
  static const serious = Color(0xFFEC835A);
  static const critical = Color(0xFFD03B3B);

  static ThemeData light() => _build(ColorScheme.fromSeed(seedColor: brand, primary: brand, surface: const Color(0xFFF9F9F7)));

  static ThemeData dark() => _build(ColorScheme.fromSeed(seedColor: brand, brightness: Brightness.dark, primary: brandDark, surface: const Color(0xFF0D0D0D)));

  static ThemeData _build(ColorScheme scheme) {
    final base = ThemeData(colorScheme: scheme, useMaterial3: true, visualDensity: VisualDensity.standard);
    return base.copyWith(
      appBarTheme: AppBarTheme(backgroundColor: scheme.surface, foregroundColor: scheme.onSurface, elevation: 0, scrolledUnderElevation: 1, centerTitle: false),
      cardTheme: CardThemeData(elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: scheme.outlineVariant))),
      inputDecorationTheme: InputDecorationTheme(border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)), isDense: true),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(64, 48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)))),
      outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size(64, 44), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)))),
      chipTheme: base.chipTheme.copyWith(shape: const StadiumBorder()),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    );
  }
}
