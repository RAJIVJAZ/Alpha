import 'package:flutter/material.dart';

/// FoodGrid brand (the Gen Z design blueprint): Chili Pop carries Ink text, coral text on
/// light surfaces uses Chili Deep, Grape is the secondary colour and Lime the one key action;
/// status colours are reserved for state and always paired with an icon and a label.
class FoodGridTheme {
  /// Chili Pop: filled buttons and highlights, always with [ink] text on it.
  static const brand = Color(0xFFFF5A36);
  static const brandDark = Color(0xFFFF5A36);

  /// Chili Deep: coral text on light surfaces (Chili Pop as text is too pale there).
  static const brandDeep = Color(0xFFC4320A);
  static const ink = Color(0xFF1A1423);
  static const grape = Color(0xFF6C4BF4);
  static const lime = Color(0xFFC8F135);
  static const cream = Color(0xFFFFF8EE);
  static const night = Color(0xFF100D17);

  static const good = Color(0xFF12B76A);
  static const goodText = Color(0xFF067647);
  static const warning = Color(0xFFF79009);
  static const serious = Color(0xFFEC835A);
  static const critical = Color(0xFFD92D20);

  static ThemeData light() => _build(ColorScheme.fromSeed(seedColor: brand, primary: brand, onPrimary: ink, secondary: grape, onSecondary: Colors.white, tertiary: lime, onTertiary: ink, error: critical, surface: Colors.white, onSurface: ink));

  static ThemeData dark() => _build(ColorScheme.fromSeed(seedColor: brand, brightness: Brightness.dark, primary: brandDark, onPrimary: ink, secondary: const Color(0xFFA996FF), onSecondary: ink, tertiary: lime, onTertiary: ink, surface: night));

  static ThemeData _build(ColorScheme scheme) {
    final base = ThemeData(colorScheme: scheme, useMaterial3: true, visualDensity: VisualDensity.standard);
    // text-only buttons on light surfaces use Chili Deep: Chili Pop is too pale as text there
    final textColor = scheme.brightness == Brightness.light ? brandDeep : scheme.primary;
    return base.copyWith(
      appBarTheme: AppBarTheme(backgroundColor: scheme.surface, foregroundColor: scheme.onSurface, elevation: 0, scrolledUnderElevation: 1, centerTitle: false),
      cardTheme: CardThemeData(elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: scheme.outlineVariant))),
      inputDecorationTheme: InputDecorationTheme(border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)), isDense: true),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(64, 48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)))),
      outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(foregroundColor: textColor, minimumSize: const Size(64, 44), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)))),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: textColor)),
      chipTheme: base.chipTheme.copyWith(shape: const StadiumBorder()),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    );
  }
}
