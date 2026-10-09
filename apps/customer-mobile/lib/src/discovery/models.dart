import '../common/json.dart';

class OutletSummary {
  const OutletSummary({
    required this.id,
    required this.slug,
    required this.name,
    this.type = 'RESTAURANT',
    this.cuisines = const [],
    this.city = '',
    this.lat = 0,
    this.lng = 0,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.costForTwo = 0,
    this.avgPrepTimeMins = 0,
    this.isPureVeg = false,
    this.isOpenNow = true,
    this.coverImageUrl,
    this.distanceKm = 0,
    this.etaMins = 0,
    this.sponsored = false,
    this.adCampaignId,
    this.adClickToken,
    this.reasons = const [],
  });

  final String id;
  final String slug;
  final String name;
  final String type;
  final List<String> cuisines;
  final String city;
  final double lat;
  final double lng;
  final double ratingAvg;
  final int ratingCount;
  final double costForTwo;
  final int avgPrepTimeMins;
  final bool isPureVeg;
  /// Taking orders right now (the outlet's switch is on and it is within its
  /// hours); `isOpen` on the wire is only the switch.
  final bool isOpenNow;
  final String? coverImageUrl;
  final double distanceKm;
  final int etaMins;
  final bool sponsored;
  final String? adCampaignId;
  final String? adClickToken;
  final List<String> reasons;

  bool get isFoodCart => type == 'FOOD_CART';

  factory OutletSummary.fromJson(Json j) => OutletSummary(
        id: str(j['id']),
        slug: str(j['slug']),
        name: str(j['name']),
        type: str(j['type'], 'RESTAURANT'),
        cuisines: strings(j['cuisines']),
        city: str(j['city']),
        lat: toNum(j['lat']),
        lng: toNum(j['lng']),
        ratingAvg: toNum(j['ratingAvg']),
        ratingCount: toInt(j['ratingCount']),
        costForTwo: toNum(j['costForTwo']),
        avgPrepTimeMins: toInt(j['avgPrepTimeMins']),
        isPureVeg: toBool(j['isPureVeg']),
        // servers before the isOpen / isOpenNow split sent "open now" as isOpen
        isOpenNow: toBool(j['isOpenNow'] ?? j['isOpen'], true),
        coverImageUrl: optStr(j['coverImageUrl']),
        distanceKm: toNum(j['distanceKm']),
        etaMins: toInt(j['etaMins']),
        sponsored: toBool(j['sponsored']),
        adCampaignId: optStr(j['adCampaignId']),
        adClickToken: optStr(j['adClickToken']),
        reasons: strings(j['reasons']),
      );
}

class HomeBanner {
  const HomeBanner({required this.id, required this.title, this.subtitle, this.imageUrl, this.linkUrl, this.placement = 'HOME_STRIP'});

  final String id;
  final String title;
  final String? subtitle;
  final String? imageUrl;
  final String? linkUrl;
  final String placement;

  factory HomeBanner.fromJson(Json j) => HomeBanner(
        id: str(j['id']),
        title: str(j['title']),
        subtitle: optStr(j['subtitle']),
        imageUrl: optStr(j['imageUrl']),
        linkUrl: optStr(j['linkUrl']),
        placement: str(j['placement'], 'HOME_STRIP'),
      );
}

class ReorderSuggestion {
  const ReorderSuggestion({required this.orderId, required this.outletName, required this.slug, this.items = const [], this.lastAt, this.total = 0, this.imageUrl});

  final String orderId;
  final String outletName;
  final String slug;
  final List<String> items;
  final DateTime? lastAt;
  final double total;
  final String? imageUrl;

  factory ReorderSuggestion.fromJson(Json j) => ReorderSuggestion(
        orderId: str(j['orderId']),
        outletName: str(j['outletName']),
        slug: str(j['slug']),
        items: strings(j['items']),
        lastAt: optDate(j['lastAt']),
        total: toNum(j['total']),
        imageUrl: optStr(j['imageUrl']),
      );
}

class HomeFeed {
  const HomeFeed({this.recommended = const [], this.reorder = const [], this.topRated = const [], this.fastDelivery = const []});

  final List<OutletSummary> recommended;
  final List<ReorderSuggestion> reorder;
  final List<OutletSummary> topRated;
  final List<OutletSummary> fastDelivery;

  factory HomeFeed.fromJson(Json j) => HomeFeed(
        recommended: listOf(j['recommended'], OutletSummary.fromJson),
        reorder: listOf(j['reorder'], ReorderSuggestion.fromJson),
        topRated: listOf(j['topRated'], OutletSummary.fromJson),
        fastDelivery: listOf(j['fastDelivery'], OutletSummary.fromJson),
      );
}

class DishHit {
  const DishHit({required this.id, required this.name, required this.price, required this.outlet, this.imageUrl, this.isVeg = true});

  final String id;
  final String name;
  final double price;
  final String? imageUrl;
  final bool isVeg;
  final OutletSummary outlet;

  factory DishHit.fromJson(Json j) => DishHit(
        id: str(j['id']),
        name: str(j['name']),
        price: toNum(j['price']),
        imageUrl: optStr(j['imageUrl']),
        isVeg: toBool(j['isVeg'], true),
        outlet: OutletSummary.fromJson(asJson(j['outlet'])),
      );
}

class SearchResult {
  const SearchResult({required this.query, this.outlets = const [], this.dishes = const []});

  final String query;
  final List<OutletSummary> outlets;
  final List<DishHit> dishes;

  factory SearchResult.fromJson(Json j) =>
      SearchResult(query: str(j['query']), outlets: listOf(j['outlets'], OutletSummary.fromJson), dishes: listOf(j['dishes'], DishHit.fromJson));
}

class Suggestions {
  const Suggestions({this.cuisines = const [], this.outlets = const [], this.dishes = const []});

  final List<String> cuisines;
  final List<({String id, String slug, String name, String type})> outlets;
  final List<String> dishes;

  bool get isEmpty => cuisines.isEmpty && outlets.isEmpty && dishes.isEmpty;

  factory Suggestions.fromJson(Json j) => Suggestions(
        cuisines: strings(j['cuisines']),
        outlets: listOf(j['outlets'], (o) => (id: str(o['id']), slug: str(o['slug']), name: str(o['name']), type: str(o['type']))),
        dishes: strings(j['dishes']),
      );
}
