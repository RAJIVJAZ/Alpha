import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';

class OrderItem {
  const OrderItem({
    required this.id,
    required this.name,
    required this.quantity,
    this.variant,
    this.addons = const [],
    this.unitPrice = 0,
    this.totalPrice = 0,
    this.notes,
    this.isVeg,
  });

  final String id;
  final String name;
  final int quantity;
  final String? variant;
  final List<String> addons;
  final double unitPrice;
  final double totalPrice;
  final String? notes;
  final bool? isVeg;

  /// Variant and add-ons on one line, e.g. "Large · Extra cheese".
  String get options => [?variant, ...addons].join(' · ');

  factory OrderItem.fromJson(Json j) => OrderItem(
        id: str(j['id']),
        name: str(j['name']),
        quantity: intOf(j['quantity'], 1),
        variant: strOrNull(j['variant']),
        // add-ons are snapshotted as {id, name, price}; KDS copies use plain names
        addons: [for (final a in (j['addons'] is List ? j['addons'] as List : const [])) a is Map ? str(a['name']) : a.toString()],
        unitPrice: dec(j['unitPrice']),
        totalPrice: dec(j['totalPrice']),
        notes: strOrNull(j['notes']),
        isVeg: j['isVeg'] is bool ? j['isVeg'] as bool : null,
      );
}

class OrderEvent {
  const OrderEvent({required this.status, this.at, this.note});
  final String status;
  final DateTime? at;
  final String? note;

  factory OrderEvent.fromJson(Json j) => OrderEvent(status: str(j['toStatus'] ?? j['status']), at: dateOrNull(j['createdAt']), note: strOrNull(j['note']));
}

class MerchantOrder {
  const MerchantOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.type,
    this.outletId = '',
    this.channel = 'APP',
    this.customerName,
    this.customerPhone,
    this.paymentStatus = '',
    this.paymentMethod,
    this.subtotal = 0,
    this.discount = 0,
    this.deliveryFee = 0,
    this.packagingCharge = 0,
    this.platformFee = 0,
    this.cgst = 0,
    this.sgst = 0,
    this.igst = 0,
    this.tip = 0,
    this.roundOff = 0,
    this.total = 0,
    this.placedAt,
    this.acceptedAt,
    this.estimatedReadyAt,
    this.createdAt,
    this.specialInstructions,
    this.cancelReason,
    this.deliveryAddress,
    this.items = const [],
    this.events = const [],
  });

  final String id;
  final String orderNumber;
  final String outletId;
  final String status;
  final String type;
  final String channel;
  final String? customerName;
  final String? customerPhone;
  final String paymentStatus;
  final String? paymentMethod;
  final double subtotal;
  final double discount;
  final double deliveryFee;
  final double packagingCharge;
  final double platformFee;
  final double cgst;
  final double sgst;
  final double igst;
  final double tip;
  final double roundOff;
  final double total;
  final DateTime? placedAt;
  final DateTime? acceptedAt;
  final DateTime? estimatedReadyAt;
  final DateTime? createdAt;
  final String? specialInstructions;
  final String? cancelReason;
  final String? deliveryAddress;
  final List<OrderItem> items;
  final List<OrderEvent> events;

  DateTime? get placedOrCreated => placedAt ?? createdAt;
  int get itemCount => items.fold(0, (s, i) => s + i.quantity);
  bool get isDelivery => type == 'DELIVERY';

  factory MerchantOrder.fromJson(Json j) {
    final addr = j['deliveryAddress'];
    return MerchantOrder(
      id: str(j['id']),
      orderNumber: str(j['orderNumber']),
      outletId: str(j['outletId']),
      status: str(j['status']),
      type: str(j['type'], 'DELIVERY'),
      channel: str(j['channel'], 'APP'),
      customerName: strOrNull(j['customerName']),
      customerPhone: strOrNull(j['customerPhone']),
      paymentStatus: str(j['paymentStatus']),
      paymentMethod: strOrNull(j['paymentMethod']),
      subtotal: dec(j['subtotal']),
      discount: dec(j['couponDiscount']) + dec(j['membershipDiscount']),
      deliveryFee: dec(j['deliveryFee']),
      packagingCharge: dec(j['packagingCharge']),
      platformFee: dec(j['platformFee']),
      cgst: dec(j['cgst']),
      sgst: dec(j['sgst']),
      igst: dec(j['igst']),
      tip: dec(j['tip']),
      roundOff: dec(j['roundOff']),
      total: dec(j['total']),
      placedAt: dateOrNull(j['placedAt']),
      acceptedAt: dateOrNull(j['acceptedAt']),
      estimatedReadyAt: dateOrNull(j['estimatedReadyAt']),
      createdAt: dateOrNull(j['createdAt']),
      specialInstructions: strOrNull(j['specialInstructions']),
      cancelReason: strOrNull(j['cancelReason']),
      deliveryAddress: addr is Map ? [addr['line1'], addr['line2'], addr['city']].where((e) => e != null && '$e'.isNotEmpty).join(', ') : null,
      items: [for (final i in listOfMaps(j['items'])) OrderItem.fromJson(i)],
      events: [for (final e in listOfMaps(j['events'])) OrderEvent.fromJson(e)],
    );
  }
}
