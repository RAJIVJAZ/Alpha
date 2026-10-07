import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';

class Outlet {
  const Outlet({
    required this.id,
    required this.name,
    required this.type,
    required this.status,
    this.city = '',
    this.addressLine1 = '',
    this.isOpen = false,
    this.avgPrepTimeMins = 20,
    this.isMobile = false,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.kdsStations = const [],
    this.packagingCharge = 0,
    this.acceptsDineIn = true,
  });

  final String id;
  final String name;
  final String type;
  final String status;
  final String city;
  final String addressLine1;
  final bool isOpen;
  final int avgPrepTimeMins;
  final bool isMobile;
  final double ratingAvg;
  final int ratingCount;
  final List<String> kdsStations;
  final double packagingCharge;
  final bool acceptsDineIn;

  bool get isFoodCart => type == 'FOOD_CART';

  factory Outlet.fromJson(Json j) => Outlet(
        id: str(j['id']),
        name: str(j['name']),
        type: str(j['type'], 'RESTAURANT'),
        status: str(j['status'], 'ACTIVE'),
        city: str(j['city']),
        addressLine1: str(j['addressLine1']),
        isOpen: boolOf(j['isOpen']),
        avgPrepTimeMins: intOf(j['avgPrepTimeMins'], 20),
        isMobile: boolOf(j['isMobile']),
        ratingAvg: dec(j['ratingAvg']),
        ratingCount: intOf(j['ratingCount']),
        kdsStations: listOfStrings(j['kdsStations']),
        packagingCharge: dec(j['packagingCharge']),
        acceptsDineIn: boolOf(j['acceptsDineIn'], true),
      );

  Outlet copyWith({bool? isOpen}) => Outlet(
        id: id,
        name: name,
        type: type,
        status: status,
        city: city,
        addressLine1: addressLine1,
        isOpen: isOpen ?? this.isOpen,
        avgPrepTimeMins: avgPrepTimeMins,
        isMobile: isMobile,
        ratingAvg: ratingAvg,
        ratingCount: ratingCount,
        kdsStations: kdsStations,
        packagingCharge: packagingCharge,
        acceptsDineIn: acceptsDineIn,
      );
}
