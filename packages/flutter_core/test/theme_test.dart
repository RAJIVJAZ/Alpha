import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

void main() {
  for (final (name, theme) in [('light', FoodGridTheme.light()), ('dark', FoodGridTheme.dark())]) {
    test('$name: today picked in the date picker is drawn on primary, not in its own colour', () {
      final today = theme.datePickerTheme.todayForegroundColor!;
      expect(today.resolve({WidgetState.selected}), theme.colorScheme.onPrimary);
      expect(today.resolve({WidgetState.selected}), isNot(theme.colorScheme.primary));
      expect(today.resolve({WidgetState.disabled})!.a, closeTo(0.38, 0.01));
    });

    test('$name: disabled checkboxes and radios keep the dimmed Material look', () {
      expect(theme.checkboxTheme.fillColor!.resolve({WidgetState.selected, WidgetState.disabled}), isNull);
      expect(theme.radioTheme.fillColor!.resolve({WidgetState.disabled}), isNull);
      expect(theme.radioTheme.fillColor!.resolve({WidgetState.selected}), isNotNull);
    });
  }
}
