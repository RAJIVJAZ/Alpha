import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';

class MenuVariant {
  const MenuVariant({required this.id, required this.name, this.priceDelta = 0, this.isDefault = false, this.isAvailable = true});
  final String id;
  final String name;
  final double priceDelta;
  final bool isDefault;
  final bool isAvailable;

  factory MenuVariant.fromJson(Json j) => MenuVariant(
        id: str(j['id']),
        name: str(j['name']),
        priceDelta: dec(j['priceDelta']),
        isDefault: boolOf(j['isDefault']),
        isAvailable: boolOf(j['isAvailable'], true),
      );
}

class MenuAddon {
  const MenuAddon({required this.id, required this.name, this.price = 0, this.isAvailable = true});
  final String id;
  final String name;
  final double price;
  final bool isAvailable;

  factory MenuAddon.fromJson(Json j) => MenuAddon(id: str(j['id']), name: str(j['name']), price: dec(j['price']), isAvailable: boolOf(j['isAvailable'], true));
}

class MenuAddonGroup {
  const MenuAddonGroup({required this.id, required this.name, this.minSelect = 0, this.maxSelect = 1, this.addons = const []});
  final String id;
  final String name;
  final int minSelect;
  final int maxSelect;
  final List<MenuAddon> addons;

  factory MenuAddonGroup.fromJson(Json j) => MenuAddonGroup(
        id: str(j['id']),
        name: str(j['name']),
        minSelect: intOf(j['minSelect']),
        maxSelect: intOf(j['maxSelect'], 1),
        addons: [for (final a in listOfMaps(j['addons'])) MenuAddon.fromJson(a)],
      );
}

class MenuItem {
  const MenuItem({
    required this.id,
    required this.name,
    required this.price,
    this.categoryId = '',
    this.description,
    this.isVeg = true,
    this.isAvailable = true,
    this.isRecommended = false,
    this.kdsStation = 'MAIN',
    this.variants = const [],
    this.addonGroups = const [],
  });

  final String id;
  final String categoryId;
  final String name;
  final String? description;
  final double price;
  final bool isVeg;
  final bool isAvailable;
  final bool isRecommended;
  final String kdsStation;
  final List<MenuVariant> variants;
  final List<MenuAddonGroup> addonGroups;

  bool get hasOptions => variants.isNotEmpty || addonGroups.isNotEmpty;

  factory MenuItem.fromJson(Json j) => MenuItem(
        id: str(j['id']),
        categoryId: str(j['categoryId']),
        name: str(j['name']),
        description: strOrNull(j['description']),
        price: dec(j['price']),
        isVeg: boolOf(j['isVeg'], true),
        isAvailable: boolOf(j['isAvailable'], true),
        isRecommended: boolOf(j['isRecommended']),
        kdsStation: str(j['kdsStation'], 'MAIN'),
        variants: [for (final v in listOfMaps(j['variants'])) MenuVariant.fromJson(v)],
        addonGroups: [for (final g in listOfMaps(j['addonGroups'])) MenuAddonGroup.fromJson(g)],
      );

  MenuItem withAvailability(bool on) => MenuItem(
        id: id,
        categoryId: categoryId,
        name: name,
        description: description,
        price: price,
        isVeg: isVeg,
        isAvailable: on,
        isRecommended: isRecommended,
        kdsStation: kdsStation,
        variants: variants,
        addonGroups: addonGroups,
      );
}

class MenuCategory {
  const MenuCategory({required this.id, required this.name, this.isActive = true, this.items = const []});
  final String id;
  final String name;
  final bool isActive;
  final List<MenuItem> items;

  factory MenuCategory.fromJson(Json j) => MenuCategory(
        id: str(j['id']),
        name: str(j['name']),
        isActive: boolOf(j['isActive'], true),
        items: [for (final i in listOfMaps(j['items'])) MenuItem.fromJson(i)],
      );

  MenuCategory withItems(List<MenuItem> items) => MenuCategory(id: id, name: name, isActive: isActive, items: items);
}
