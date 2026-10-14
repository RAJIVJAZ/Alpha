import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

/// Riders ride at night and glance in traffic: the dark "night" look unless they choose
/// light or the phone's setting (the theme button on the duty screen).
final riderThemeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(() => ThemeModeController(fallback: ThemeMode.dark, key: 'fg.rider.theme'));
