import '../common/hours.dart';
import '../common/json.dart';

class OutletDetail {
  const OutletDetail({
    required this.id,
    required this.slug,
    required this.name,
    this.type = 'RESTAURANT',
    this.description,
    this.cuisines = const [],
    this.tags = const [],
    this.phone,
    this.addressLine1 = '',
    this.addressLine2,
    this.city = '',
    this.pincode = '',
    this.lat = 0,
    this.lng = 0,
    this.isPureVeg = false,
    this.costForTwo = 0,
    this.avgPrepTimeMins = 0,
    this.minOrderValue = 0,
    this.packagingCharge = 0,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.isOpenNow = true,
    this.openingHours = const [],
    this.fssaiNumber,
    this.gstin,
    this.logoUrl,
    this.coverImageUrl,
    this.acceptsDelivery = true,
    this.acceptsTakeaway = true,
    this.acceptsQrOrders = false,
    this.isMobile = false,
  });

  final String id;
  final String slug;
  final String type;
  final String name;
  final String? description;
  final List<String> cuisines;
  final List<String> tags;
  final String? phone;
  final String addressLine1;
  final String? addressLine2;
  final String city;
  final String pincode;
  final double lat;
  final double lng;
  final bool isPureVeg;
  final double costForTwo;
  final int avgPrepTimeMins;
  final double minOrderValue;
  final double packagingCharge;
  final double ratingAvg;
  final int ratingCount;
  final bool isOpenNow;
  final List<OpeningHours> openingHours;
  final String? fssaiNumber;
  final String? gstin;
  final String? logoUrl;
  final String? coverImageUrl;
  final bool acceptsDelivery;
  final bool acceptsTakeaway;
  final bool acceptsQrOrders;
  final bool isMobile;

  bool get isFoodCart => type == 'FOOD_CART';

  /// "Opens 11:30 am" while closed, else null.
  String? get opensAt => isOpenNow ? null : nextOpening(openingHours);

  factory OutletDetail.fromJson(Json j) => OutletDetail(
        id: str(j['id']),
        slug: str(j['slug']),
        type: str(j['type'], 'RESTAURANT'),
        name: str(j['name']),
        description: optStr(j['description']),
        cuisines: strings(j['cuisines']),
        tags: strings(j['tags']),
        phone: optStr(j['phone']),
        addressLine1: str(j['addressLine1']),
        addressLine2: optStr(j['addressLine2']),
        city: str(j['city']),
        pincode: str(j['pincode']),
        lat: toNum(j['lat']),
        lng: toNum(j['lng']),
        isPureVeg: toBool(j['isPureVeg']),
        costForTwo: toNum(j['costForTwo']),
        avgPrepTimeMins: toInt(j['avgPrepTimeMins']),
        minOrderValue: toNum(j['minOrderValue']),
        packagingCharge: toNum(j['packagingCharge']),
        ratingAvg: toNum(j['ratingAvg']),
        ratingCount: toInt(j['ratingCount']),
        // the server decides with the outlet's hours and pause state
        isOpenNow: toBool(j['isOpenNow'] ?? j['isOpen'], true),
        openingHours: listOf(j['openingHours'], OpeningHours.fromJson),
        fssaiNumber: optStr(j['fssaiNumber']),
        gstin: optStr(j['gstin']),
        logoUrl: optStr(j['logoUrl']),
        coverImageUrl: optStr(j['coverImageUrl']),
        acceptsDelivery: toBool(j['acceptsDelivery'], true),
        acceptsTakeaway: toBool(j['acceptsTakeaway'], true),
        acceptsQrOrders: toBool(j['acceptsQrOrders']),
        isMobile: toBool(j['isMobile']),
      );
}

class Variant {
  const Variant({required this.id, required this.name, this.priceDelta = 0, this.isDefault = false, this.isAvailable = true});

  final String id;
  final String name;
  final double priceDelta;
  final bool isDefault;
  final bool isAvailable;

  factory Variant.fromJson(Json j) =>
      Variant(id: str(j['id']), name: str(j['name']), priceDelta: toNum(j['priceDelta']), isDefault: toBool(j['isDefault']), isAvailable: toBool(j['isAvailable'], true));
}

class Addon {
  const Addon({required this.id, required this.name, this.price = 0, this.isVeg = true, this.isAvailable = true});

  final String id;
  final String name;
  final double price;
  final bool isVeg;
  final bool isAvailable;

  factory Addon.fromJson(Json j) =>
      Addon(id: str(j['id']), name: str(j['name']), price: toNum(j['price']), isVeg: toBool(j['isVeg'], true), isAvailable: toBool(j['isAvailable'], true));
}

class AddonGroup {
  const AddonGroup({required this.id, required this.name, this.minSelect = 0, this.maxSelect = 1, this.addons = const []});

  final String id;
  final String name;
  final int minSelect;
  final int maxSelect;
  final List<Addon> addons;

  factory AddonGroup.fromJson(Json j) => AddonGroup(
        id: str(j['id']),
        name: str(j['name']),
        minSelect: toInt(j['minSelect']),
        maxSelect: toInt(j['maxSelect'], 1),
        addons: listOf(j['addons'], Addon.fromJson),
      );

  /// "pick 1", "pick 1–2" or "up to 3".
  String get rule => minSelect > 0 ? 'pick ${minSelect == maxSelect ? '$minSelect' : '$minSelect–$maxSelect'}' : 'up to $maxSelect';
}

class MenuItem {
  const MenuItem({
    required this.id,
    required this.name,
    required this.price,
    this.categoryId = '',
    this.description,
    this.imageUrl,
    this.compareAtPrice,
    this.isVeg = true,
    this.isAvailable = true,
    this.isRecommended = false,
    this.tags = const [],
    this.spiceLevel,
    this.variants = const [],
    this.addonGroups = const [],
  });

  final String id;
  final String categoryId;
  final String name;
  final String? description;
  final String? imageUrl;
  final double price;
  final double? compareAtPrice;
  final bool isVeg;
  final bool isAvailable;
  final bool isRecommended;
  final List<String> tags;
  final int? spiceLevel;
  final List<Variant> variants;
  final List<AddonGroup> addonGroups;

  factory MenuItem.fromJson(Json j) => MenuItem(
        id: str(j['id']),
        categoryId: str(j['categoryId']),
        name: str(j['name']),
        description: optStr(j['description']),
        imageUrl: optStr(j['imageUrl']),
        price: toNum(j['price']),
        compareAtPrice: optNum(j['compareAtPrice']),
        isVeg: toBool(j['isVeg'], true),
        isAvailable: toBool(j['isAvailable'], true),
        isRecommended: toBool(j['isRecommended']),
        tags: strings(j['tags']),
        spiceLevel: optInt(j['spiceLevel']),
        variants: listOf(j['variants'], Variant.fromJson),
        addonGroups: listOf(j['addonGroups'], AddonGroup.fromJson),
      );

  /// Has a size to pick or add-ons to choose.
  bool get customisable => variants.length > 1 || addonGroups.any((g) => g.addons.isNotEmpty);

  bool get bestseller => tags.contains('bestseller');

  Variant? get defaultVariant {
    final available = variants.where((v) => v.isAvailable);
    if (available.isEmpty) return null;
    return available.firstWhere((v) => v.isDefault, orElse: () => available.first);
  }

  /// Price of one with the chosen variant and add-ons.
  double unitPrice({String? variantId, Iterable<String> addonIds = const []}) {
    final variant = variants.where((v) => v.id == variantId).firstOrNull;
    final ids = addonIds.toSet();
    final addons = addonGroups.expand((g) => g.addons).where((a) => ids.contains(a.id)).fold<double>(0, (s, a) => s + a.price);
    return price + (variant?.priceDelta ?? 0) + addons;
  }
}

class MenuCategory {
  const MenuCategory({required this.id, required this.name, this.description, this.items = const []});

  final String id;
  final String name;
  final String? description;
  final List<MenuItem> items;

  factory MenuCategory.fromJson(Json j) => MenuCategory(id: str(j['id']), name: str(j['name']), description: optStr(j['description']), items: listOf(j['items'], MenuItem.fromJson));
}

class Menu {
  const Menu({required this.outlet, this.recommended = const [], this.categories = const []});

  final OutletDetail outlet;
  final List<MenuItem> recommended;
  final List<MenuCategory> categories;

  factory Menu.fromJson(Json j) => Menu(
        outlet: OutletDetail.fromJson(asJson(j['outlet'])),
        recommended: listOf(j['recommended'], MenuItem.fromJson),
        categories: listOf(j['categories'], MenuCategory.fromJson),
      );

  /// Looks an item up anywhere in the menu.
  MenuItem? item(String id) {
    for (final c in categories) {
      for (final i in c.items) {
        if (i.id == id) return i;
      }
    }
    return recommended.where((i) => i.id == id).firstOrNull;
  }
}

class Review {
  const Review({required this.id, required this.rating, this.foodRating, this.deliveryRating, this.comment, this.tags = const [], this.reply, this.createdAt});

  final String id;
  final int rating;
  final int? foodRating;
  final int? deliveryRating;
  final String? comment;
  final List<String> tags;
  final String? reply;
  final DateTime? createdAt;

  factory Review.fromJson(Json j) => Review(
        id: str(j['id']),
        rating: toInt(j['rating']),
        foodRating: optInt(j['foodRating']),
        deliveryRating: optInt(j['deliveryRating']),
        comment: optStr(j['comment']),
        tags: strings(j['tags']),
        reply: optStr(j['reply']),
        createdAt: optDate(j['createdAt']),
      );
}

const slotLabels = {'BREAKFAST': 'Breakfast', 'LUNCH': 'Lunch', 'DINNER': 'Dinner', 'SNACKS': 'Snacks'};

class SubscriptionPlan {
  const SubscriptionPlan({
    required this.id,
    required this.outletId,
    required this.name,
    required this.slot,
    this.description,
    this.mealsPerDay = 1,
    this.durationDays = 0,
    this.daysOfWeek = const [],
    this.pricePerMeal = 0,
    this.totalPrice = 0,
    this.isVeg = true,
  });

  final String id;
  final String outletId;
  final String name;
  final String? description;
  final String slot;
  final int mealsPerDay;
  final int durationDays;
  final List<int> daysOfWeek;
  final double pricePerMeal;
  final double totalPrice;
  final bool isVeg;

  String get slotLabel => slotLabels[slot] ?? slot;

  factory SubscriptionPlan.fromJson(Json j) => SubscriptionPlan(
        id: str(j['id']),
        outletId: str(j['outletId']),
        name: str(j['name']),
        description: optStr(j['description']),
        slot: str(j['slot']),
        mealsPerDay: toInt(j['mealsPerDay'], 1),
        durationDays: toInt(j['durationDays']),
        daysOfWeek: [for (final d in (j['daysOfWeek'] as List? ?? const [])) toInt(d)],
        pricePerMeal: toNum(j['pricePerMeal']),
        totalPrice: toNum(j['totalPrice']),
        isVeg: toBool(j['isVeg'], true),
      );
}

/// A dine-in table and its outlet's menu (GET qr/{token}).
class TableMenu {
  const TableMenu({required this.tableId, required this.tableLabel, required this.seats, required this.menu});

  final String tableId;
  final String tableLabel;
  final int seats;
  final Menu menu;

  factory TableMenu.fromJson(Json j) {
    final table = asJson(j['table']);
    return TableMenu(tableId: str(table['id']), tableLabel: str(table['label']), seats: toInt(table['seats']), menu: Menu.fromJson(j));
  }
}
