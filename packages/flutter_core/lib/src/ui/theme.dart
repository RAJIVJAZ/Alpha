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

  /// Flavour washes behind offers and tags, always with [ink] text.
  static const washes = [Color(0xFFFFF1C7), Color(0xFFDDF1FF), Color(0xFFFFE0EF), Color(0xFFDDF7E4)];
  static const night = Color(0xFF100D17);

  static const good = Color(0xFF12B76A);
  static const goodText = Color(0xFF067647);
  static const warning = Color(0xFFF79009);
  static const serious = Color(0xFFEC835A);
  static const critical = Color(0xFFD92D20);
  /// [critical] as text on Night (6.9:1); the light red is too dark there.
  static const criticalOnDark = Color(0xFFF97066);

  /// Coral as text or a selected state: Chili Deep on light surfaces (5.5:1), Chili Pop on Night.
  static Color primaryText(BuildContext context) => Theme.of(context).brightness == Brightness.light ? brandDeep : brandDark;

  /// Green as text or a small icon: [goodText] on light, [good] on Night (7.3:1).
  static Color goodTextOf(BuildContext context) => Theme.of(context).brightness == Brightness.light ? goodText : good;

  /// Red as text: [critical] on light, [criticalOnDark] on Night.
  static Color criticalTextOf(BuildContext context) => Theme.of(context).brightness == Brightness.light ? critical : criticalOnDark;

  /// The one key action on a screen (Accept, the next delivery step, Place order): Lime with
  /// Ink text, a 56px pill.
  static final ButtonStyle keyButton = FilledButton.styleFrom(
    backgroundColor: lime,
    foregroundColor: ink,
    disabledBackgroundColor: lime.withValues(alpha: 0.45),
    disabledForegroundColor: ink.withValues(alpha: 0.6),
    minimumSize: const Size(64, 56),
    shape: const StadiumBorder(),
    textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
  );

  static ThemeData light() => _build(ColorScheme.fromSeed(seedColor: brand, primary: brand, onPrimary: ink, secondary: grape, onSecondary: Colors.white, tertiary: lime, onTertiary: ink, error: critical, surface: Colors.white, onSurface: ink));

  /// The customer app's light look: the Cream page under white cards.
  static ThemeData customerLight() => light().copyWith(scaffoldBackgroundColor: cream);

  static ThemeData dark() => _build(ColorScheme.fromSeed(seedColor: brand, brightness: Brightness.dark, primary: brandDark, onPrimary: ink, secondary: const Color(0xFFA996FF), onSecondary: ink, tertiary: lime, onTertiary: ink, surface: night));

  static ThemeData _build(ColorScheme scheme) {
    final base = ThemeData(colorScheme: scheme, useMaterial3: true, visualDensity: VisualDensity.standard);
    // text-only buttons on light surfaces use Chili Deep: Chili Pop is too pale as text there
    final textColor = scheme.brightness == Brightness.light ? brandDeep : scheme.primary;
    // selected states drawn as text or thin marks follow the same rule; disabled ones keep the
    // Material defaults (null), which dim them so they don't look usable
    WidgetStateProperty<Color?> selected(Color? otherwise) => WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.disabled) ? null : s.contains(WidgetState.selected) ? textColor : otherwise);
    final disabledText = scheme.onSurface.withValues(alpha: 0.38);
    // corners from the blueprint: 8 inputs, 12 cards, 20 sheets and dialogs, pills for buttons
    return base.copyWith(
      appBarTheme: AppBarTheme(backgroundColor: scheme.surface, foregroundColor: scheme.onSurface, elevation: 0, scrolledUnderElevation: 1, centerTitle: false),
      cardTheme: CardThemeData(elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: scheme.outlineVariant))),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        isDense: true,
        floatingLabelStyle: WidgetStateTextStyle.resolveWith((s) => TextStyle(color: s.contains(WidgetState.disabled) ? disabledText : s.contains(WidgetState.error) ? scheme.error : s.contains(WidgetState.focused) ? textColor : scheme.onSurfaceVariant)),
      ),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(64, 48), shape: const StadiumBorder())),
      outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(foregroundColor: textColor, minimumSize: const Size(64, 44), shape: const StadiumBorder())),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: textColor)),
      tabBarTheme: TabBarThemeData(labelColor: textColor, indicatorColor: scheme.primary, unselectedLabelColor: scheme.onSurfaceVariant),
      checkboxTheme: CheckboxThemeData(fillColor: selected(null)),
      radioTheme: RadioThemeData(fillColor: selected(scheme.onSurfaceVariant)),
      // today's number: on the filled primary circle when picked, else the text colour
      datePickerTheme: DatePickerThemeData(todayForegroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.disabled) ? disabledText : s.contains(WidgetState.selected) ? scheme.onPrimary : textColor)),
      bottomSheetTheme: const BottomSheetThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20)))),
      dialogTheme: DialogThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
      chipTheme: base.chipTheme.copyWith(shape: const StadiumBorder()),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    );
  }
}
