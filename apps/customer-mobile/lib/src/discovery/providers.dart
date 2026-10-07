import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';
import '../location/place.dart';
import 'models.dart';

final bannersProvider = FutureProvider<List<HomeBanner>>((ref) async {
  final list = await ref.watch(apiClientProvider).get<List<dynamic>>('cms/banners', query: {'city': 'Bengaluru', 'audience': 'CUSTOMER'});
  final banners = listOf(list, HomeBanner.fromJson);
  // hero banners first, then the strip
  return [...banners.where((b) => b.placement == 'HOME_HERO'), ...banners.where((b) => b.placement != 'HOME_HERO')];
});

final homeFeedProvider = FutureProvider<HomeFeed>((ref) async {
  final place = ref.watch(placeProvider);
  // re-rank (and show "Order again") when the customer signs in or out
  await ref.watch(sessionProvider.future);
  final json = await ref.watch(apiClientProvider).get<dynamic>('recommendations/home', query: {'lat': place.lat, 'lng': place.lng});
  return HomeFeed.fromJson(asJson(json));
});

enum OutletSort {
  relevance('relevance', 'Relevance'),
  distance('distance', 'Distance'),
  eta('eta', 'Delivery time'),
  rating('rating', 'Rating'),
  costLow('cost_low', 'Cost: low to high'),
  costHigh('cost_high', 'Cost: high to low');

  const OutletSort(this.wire, this.label);
  final String wire;
  final String label;
}

/// Filters for the "all places near you" list.
class NearbyFilters {
  const NearbyFilters({this.type, this.veg = false, this.rated = false, this.openNow = false, this.sort = OutletSort.relevance});

  final String? type;
  final bool veg;
  final bool rated;
  final bool openNow;
  final OutletSort sort;

  NearbyFilters copyWith({String? Function()? type, bool? veg, bool? rated, bool? openNow, OutletSort? sort}) => NearbyFilters(
        type: type == null ? this.type : type(),
        veg: veg ?? this.veg,
        rated: rated ?? this.rated,
        openNow: openNow ?? this.openNow,
        sort: sort ?? this.sort,
      );

  @override
  bool operator ==(Object other) => other is NearbyFilters && other.type == type && other.veg == veg && other.rated == rated && other.openNow == openNow && other.sort == sort;

  @override
  int get hashCode => Object.hash(type, veg, rated, openNow, sort);
}

class NearbyFiltersController extends Notifier<NearbyFilters> {
  @override
  NearbyFilters build() => const NearbyFilters();

  void update(NearbyFilters Function(NearbyFilters f) change) => state = change(state);
}

final nearbyFiltersProvider = NotifierProvider<NearbyFiltersController, NearbyFilters>(NearbyFiltersController.new);

/// Loaded pages of nearby outlets.
class NearbyList {
  const NearbyList({required this.items, required this.page, required this.totalPages, required this.total, this.loadingMore = false, this.moreError});

  final List<OutletSummary> items;
  final int page;
  final int totalPages;
  final int total;
  final bool loadingMore;
  final Object? moreError;

  bool get hasMore => page < totalPages;

  NearbyList copyWith({bool? loadingMore, Object? Function()? moreError}) =>
      NearbyList(items: items, page: page, totalPages: totalPages, total: total, loadingMore: loadingMore ?? this.loadingMore, moreError: moreError == null ? this.moreError : moreError());
}

/// GET outlets/nearby with infinite scroll ([loadMore] appends the next page).
class NearbyController extends AsyncNotifier<NearbyList> {
  static const pageSize = 12;
  int _generation = 0;

  @override
  Future<NearbyList> build() {
    final place = ref.watch(placeProvider);
    final filters = ref.watch(nearbyFiltersProvider);
    _generation++;
    return _fetch(place, filters, 1, const []);
  }

  Future<NearbyList> _fetch(Place place, NearbyFilters f, int page, List<OutletSummary> before) async {
    final json = await ref.read(apiClientProvider).get<dynamic>('outlets/nearby', query: {
      'lat': place.lat,
      'lng': place.lng,
      'type': f.type,
      'veg': f.veg ? true : null,
      'minRating': f.rated ? 4 : null,
      'openNow': f.openNow ? true : null,
      'sort': f.sort.wire,
      'page': page,
      'pageSize': pageSize,
    });
    final p = Page.fromJson(json, OutletSummary.fromJson);
    // a sponsored outlet can repeat on a later page; keep the first
    final seen = {for (final o in before) o.id};
    return NearbyList(items: [...before, ...p.data.where((o) => seen.add(o.id))], page: p.page, totalPages: p.totalPages, total: p.total);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || state.isLoading || current.loadingMore || !current.hasMore) return;
    final generation = _generation;
    state = AsyncData(current.copyWith(loadingMore: true, moreError: () => null));
    try {
      final next = await _fetch(ref.read(placeProvider), ref.read(nearbyFiltersProvider), current.page + 1, current.items);
      if (ref.mounted && generation == _generation) state = AsyncData(next);
    } catch (e) {
      if (ref.mounted && generation == _generation) state = AsyncData(current.copyWith(loadingMore: false, moreError: () => e));
    }
  }
}

final nearbyProvider = AsyncNotifierProvider<NearbyController, NearbyList>(NearbyController.new);

final suggestionsProvider = FutureProvider.autoDispose.family<Suggestions, String>((ref, q) async {
  final place = ref.watch(placeProvider);
  final json = await ref.watch(apiClientProvider).get<dynamic>('search/suggest', query: {'q': q, 'lat': place.lat, 'lng': place.lng});
  return Suggestions.fromJson(asJson(json));
});

final searchProvider = FutureProvider.autoDispose.family<SearchResult, String>((ref, q) async {
  final place = ref.watch(placeProvider);
  final json = await ref.watch(apiClientProvider).get<dynamic>('search', query: {'q': q, 'lat': place.lat, 'lng': place.lng});
  return SearchResult.fromJson(asJson(json));
});

/// Reports a click on a sponsored placement (fire-and-forget).
void reportAdClick(ApiClient api, String? campaignId) {
  if (campaignId == null || campaignId.isEmpty) return;
  api.post<dynamic>('ads/events/click', body: {'campaignId': campaignId}).then((_) {}, onError: (Object _) {});
}
