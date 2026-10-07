import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../cart/models.dart';
import '../common/json.dart';
import 'models.dart';

final menuProvider = FutureProvider.autoDispose.family<Menu, String>((ref, slug) async {
  final json = await ref.watch(apiClientProvider).get<dynamic>('outlets/${Uri.encodeComponent(slug)}/menu');
  return Menu.fromJson(asJson(json));
});

final outletByIdProvider = FutureProvider.autoDispose.family<OutletDetail, String>((ref, id) async {
  return OutletDetail.fromJson(asJson(await ref.watch(apiClientProvider).get<dynamic>('outlets/$id')));
});

/// Offers usable at an outlet (signed-in customers only).
final outletCouponsProvider = FutureProvider.autoDispose.family<List<Coupon>, String>((ref, outletId) async {
  final session = await ref.watch(sessionProvider.future);
  if (session == null) return const [];
  return listOf(await ref.watch(apiClientProvider).get<dynamic>('coupons', query: {'outletId': outletId}), Coupon.fromJson);
});

typedef ReviewsPage = ({List<Review> items, int page, int totalPages, int total});

final reviewsProvider = FutureProvider.autoDispose.family<ReviewsPage, ({String outletId, int page})>((ref, arg) async {
  final p = Page.fromJson(await ref.watch(apiClientProvider).get<dynamic>('outlets/${arg.outletId}/reviews', query: {'page': arg.page, 'pageSize': 10}), Review.fromJson);
  return (items: p.data, page: p.page, totalPages: p.totalPages, total: p.total);
});

final mealPlansProvider = FutureProvider.autoDispose.family<List<SubscriptionPlan>, String>((ref, outletId) async {
  return listOf(await ref.watch(apiClientProvider).get<dynamic>('outlets/$outletId/subscription-plans'), SubscriptionPlan.fromJson);
});

/// "Goes well with" suggestions for the dishes already in the cart
/// (itemIds is a comma-joined key).
final pairingsProvider = FutureProvider.autoDispose.family<List<MenuItem>, ({String outletId, String itemIds})>((ref, arg) async {
  final json = await ref.watch(apiClientProvider).get<dynamic>('recommendations/dishes', query: {'outletId': arg.outletId, 'itemIds': arg.itemIds.split(',')});
  return listOf(json, MenuItem.fromJson);
});
