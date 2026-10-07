import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';
import 'models.dart';

/// A dish to add: the item, how many, and its customisation.
class AddLine {
  const AddLine({required this.menuItemId, this.quantity = 1, this.variantId, this.addonIds = const [], this.notes});

  final String menuItemId;
  final int quantity;
  final String? variantId;
  final List<String> addonIds;
  final String? notes;

  Json toJson() => {
        'menuItemId': menuItemId,
        'quantity': quantity,
        'variantId': ?variantId,
        if (addonIds.isNotEmpty) 'addonIds': addonIds,
        'notes': ?notes,
      };
}

/// The server cart of the signed-in customer (empty when signed out).
///
/// Mutations answer with the updated cart, which replaces the state. While a
/// checkout is paying, the checkout screen keeps its own snapshot and only
/// refreshes this after payment (the server empties the cart on order).
class CartController extends AsyncNotifier<Cart> {
  @override
  Future<Cart> build() async {
    final session = await ref.watch(sessionProvider.future);
    if (session == null) return Cart.empty;
    return Cart.fromJson(asJson(await ref.read(apiClientProvider).get<dynamic>('cart')));
  }

  ApiClient get _api => ref.read(apiClientProvider);

  Future<Cart> _apply(Future<dynamic> request) async {
    final json = await request;
    final cart = json is Map && json['lines'] is List ? Cart.fromJson(asJson(json)) : Cart.fromJson(asJson(await _api.get<dynamic>('cart')));
    if (ref.mounted) state = AsyncData(cart);
    return cart;
  }

  /// Reloads from the server.
  Future<Cart> refresh() => _apply(_api.get<dynamic>('cart'));

  /// Adds a line; throws [ApiException] `CART_OUTLET_MISMATCH` when the cart
  /// holds another outlet's dishes (retry with [replace]).
  Future<Cart> add(AddLine line, {bool replace = false}) => _apply(_api.post<dynamic>('cart/items', body: {...line.toJson(), if (replace) 'replace': true}));

  Future<Cart> setQuantity(String lineId, int quantity) =>
      quantity <= 0 ? remove(lineId) : _apply(_api.patch<dynamic>('cart/items/$lineId', body: {'quantity': quantity > 50 ? 50 : quantity}));

  Future<Cart> remove(String lineId) => _apply(_api.delete<dynamic>('cart/items/$lineId'));

  Future<Cart> clear() => _apply(_api.delete<dynamic>('cart'));

  Future<Cart> applyCoupon(String code) => _apply(_api.post<dynamic>('cart/coupon', body: {'code': code.trim().toUpperCase()}));

  Future<Cart> removeCoupon() => _apply(_api.delete<dynamic>('cart/coupon'));

  /// Adds an earlier order's dishes back to the cart.
  Future<List<String>> reorder(String orderId) async {
    final r = asJson(await _api.post<dynamic>('orders/$orderId/reorder'));
    await refresh();
    return strings(r['skipped']);
  }
}

final cartProvider = AsyncNotifierProvider<CartController, Cart>(CartController.new);
