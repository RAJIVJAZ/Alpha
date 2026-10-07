import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../app/sign_in_screen.dart';
import '../cart/cart_controller.dart';
import '../common/widgets.dart';

/// Adds to the server cart. Switching restaurants asks first (the API answers
/// 409 `CART_OUTLET_MISMATCH`, then the add is retried with `replace`);
/// signed-out customers are sent to sign in. True when added.
Future<bool> addToCart(BuildContext context, WidgetRef ref, AddLine line) async {
  if (ref.read(sessionProvider).value == null) {
    signInFirst(context);
    return false;
  }
  final cart = ref.read(cartProvider.notifier);
  try {
    await cart.add(line);
    return true;
  } on ApiException catch (e) {
    if (e.code != 'CART_OUTLET_MISMATCH') {
      if (context.mounted) showError(context, e);
      return false;
    }
    if (!context.mounted) return false;
    final current = ref.read(cartProvider).value?.outletName;
    final ok = await confirm(
      context,
      title: 'Start a new cart?',
      message: 'Your cart has items from ${current ?? 'another restaurant'}. Adding this clears it.',
      confirmLabel: 'Start new cart',
    );
    if (!ok) return false;
    try {
      await cart.add(line, replace: true);
      return true;
    } catch (e) {
      if (context.mounted) showError(context, e);
      return false;
    }
  } catch (e) {
    if (context.mounted) showError(context, e);
    return false;
  }
}
