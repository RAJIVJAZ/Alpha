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

/// Message for the person at the counter. The server words its 403s
/// ("Your role can't manage orders. …"); older servers said only "Missing
/// permission", so those are explained here from the missing permission.
String describeError(Object error) {
  if (error is ApiException && error.status == 403 && error.code == 'PERMISSION_DENIED' && error.message == 'Missing permission') {
    final details = error.details;
    final missing = details is List && details.isNotEmpty ? details.first.toString() : null;
    final what = _permissionNames[missing] ?? 'do this';
    return "Your role can't $what. Ask the owner or a manager.";
  }
  return error.toString();
}

/// [showError] with the friendlier permission message.
void showApiError(BuildContext context, Object error) => showError(context, describeError(error));
