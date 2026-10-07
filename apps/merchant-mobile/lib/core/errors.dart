import 'package:flutter/material.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

const _permissionNames = {
  'orders:read': 'see orders and outlets',
  'orders:manage': 'manage orders',
  'kds:operate': 'run the kitchen display',
  'pos:operate': 'bill at the counter',
  'menu:manage': 'edit the menu',
  'inventory:manage': 'update stock',
  'procurement:read': 'see purchasing',
  'procurement:manage': 'raise purchase orders',
  'procurement:approve': 'approve purchase orders',
  'reports:read': 'see reports',
};

/// Message for the person at the counter: 403s explain which permission is
/// missing instead of the bare "Missing permission".
String describeError(Object error) {
  if (error is ApiException && error.status == 403 && error.code == 'PERMISSION_DENIED') {
    final details = error.details;
    final missing = details is List && details.isNotEmpty ? details.first.toString() : null;
    final what = _permissionNames[missing] ?? 'do this';
    return "Your role can't $what. Ask the owner or a manager.";
  }
  return error.toString();
}

/// [showError] with the friendlier permission message.
void showApiError(BuildContext context, Object error) => showError(context, describeError(error));
