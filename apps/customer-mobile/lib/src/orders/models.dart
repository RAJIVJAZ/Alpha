import 'package:foodgrid_core/foodgrid_core.dart';

import '../cart/models.dart';
import '../common/json.dart';

/// Orders still moving through the kitchen or on the road.
const activeStatuses = {'PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'OUT_FOR_DELIVERY'};
const cancellableStatuses = {'PENDING_PAYMENT', 'PLACED'};
const doneStatuses = {'DELIVERED', 'COMPLETED'};

const _statusLabels = {
  'PENDING_PAYMENT': 'Awaiting payment',
  'PLACED': 'Placed',
  'ACCEPTED': 'Accepted',
  'PREPARING': 'Being prepared',
  'READY': 'Ready',
  'PICKED_UP': 'On the way',
  'OUT_FOR_DELIVERY': 'On the way',
  'DELIVERED': 'Delivered',
  'COMPLETED': 'Completed',
  'CANCELLED': 'Cancelled',
  'REJECTED': 'Declined by the restaurant',
};

String statusLabel(String status) => _statusLabels[status] ?? humanize(status);

class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.outletName,
    required this.outletSlug,
    this.type = 'DELIVERY',
    this.paymentStatus = '',
    this.paymentMethod = '',
    this.total = 0,
    this.createdAt,
    this.placedAt,
    this.outletImage,
    this.items = const [],
    this.reviewRating,
  });

  final String id;
  final String orderNumber;
  final String type;
  final String status;
  final String paymentStatus;
  final String paymentMethod;
  final double total;
  final DateTime? createdAt;
  final DateTime? placedAt;
  final String outletName;
  final String outletSlug;
  final String? outletImage;
  final List<({String name, int quantity})> items;
  final int? reviewRating;

  bool get isActive => activeStatuses.contains(status);
  bool get isDone => doneStatuses.contains(status);

  factory OrderSummary.fromJson(Json j) {
    final outlet = asJson(j['outlet']);
    final review = j['review'] is Map ? asJson(j['review']) : null;
    return OrderSummary(
      id: str(j['id']),
      orderNumber: str(j['orderNumber']),
      type: str(j['type'], 'DELIVERY'),
      status: str(j['status']),
      paymentStatus: str(j['paymentStatus']),
      paymentMethod: str(j['paymentMethod']),
      total: toNum(j['total']),
      createdAt: optDate(j['createdAt']),
      placedAt: optDate(j['placedAt']),
      outletName: str(outlet['name']),
      outletSlug: str(outlet['slug']),
      outletImage: optStr(outlet['coverImageUrl']),
      items: listOf(j['items'], (i) => (name: str(i['name']), quantity: toInt(i['quantity'], 1))),
      reviewRating: review == null ? null : toInt(review['rating']),
    );
  }
}

class OrderItem {
  const OrderItem({required this.id, required this.name, required this.quantity, required this.totalPrice, this.variant, this.addons = const [], this.isVeg = true, this.notes});

  final String id;
  final String name;
  final String? variant;
  final List<String> addons;
  final int quantity;
  final double totalPrice;
  final bool isVeg;
  final String? notes;

  String get detail => [?variant, ...addons].join(' · ');

  factory OrderItem.fromJson(Json j) => OrderItem(
        id: str(j['id']),
        name: str(j['name']),
        variant: optStr(j['variant']),
        addons: [for (final a in (j['addons'] as List? ?? const [])) a is Map ? str(a['name']) : a.toString()],
        quantity: toInt(j['quantity'], 1),
        totalPrice: toNum(j['totalPrice']),
        isVeg: toBool(j['isVeg'], true),
        notes: optStr(j['notes']),
      );
}

class OrderDetail {
  const OrderDetail({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.pricing,
    required this.outletName,
    this.type = 'DELIVERY',
    this.paymentStatus = '',
    this.paymentMethod = '',
    this.createdAt,
    this.placedAt,
    this.couponCode,
    this.deliveryLabel,
    this.deliveryLine,
    this.specialInstructions,
    this.cancelReason,
    this.items = const [],
    this.outletSlug = '',
    this.outletPhone,
    this.outletLat,
    this.outletLng,
    this.outletAddress,
    this.reviewRating,
    this.reviewComment,
  });

  final String id;
  final String orderNumber;
  final String type;
  final String status;
  final String paymentStatus;
  final String paymentMethod;
  final DateTime? createdAt;
  final DateTime? placedAt;
  final Pricing pricing;
  final String? couponCode;
  final String? deliveryLabel;
  final String? deliveryLine;
  final String? specialInstructions;
  final String? cancelReason;
  final List<OrderItem> items;
  final String outletName;
  final String outletSlug;
  final String? outletPhone;
  final double? outletLat;
  final double? outletLng;
  final String? outletAddress;
  final int? reviewRating;
  final String? reviewComment;

  bool get isDelivery => type == 'DELIVERY';
  bool get isActive => activeStatuses.contains(status);
  bool get isDone => doneStatuses.contains(status);
  bool get canCancel => cancellableStatuses.contains(status);
  bool get awaitingPayment => status == 'PENDING_PAYMENT' && paymentStatus != 'PAID';
  double get total => pricing.total;

  factory OrderDetail.fromJson(Json j) {
    final outlet = asJson(j['outlet']);
    final review = j['review'] is Map ? asJson(j['review']) : null;
    final address = j['deliveryAddress'] is Map ? asJson(j['deliveryAddress']) : null;
    return OrderDetail(
      id: str(j['id']),
      orderNumber: str(j['orderNumber']),
      type: str(j['type'], 'DELIVERY'),
      status: str(j['status']),
      paymentStatus: str(j['paymentStatus']),
      paymentMethod: str(j['paymentMethod']),
      createdAt: optDate(j['createdAt']),
      placedAt: optDate(j['placedAt']),
      pricing: Pricing.fromJson(j),
      couponCode: optStr(j['couponCode']),
      deliveryLabel: address == null ? null : optStr(address['label']),
      deliveryLine: address == null
          ? null
          : [str(address['line1']), ?optStr(address['line2']), '${str(address['city'])} ${str(address['pincode'])}'.trim()].where((s) => s.isNotEmpty).join(', '),
      specialInstructions: optStr(j['specialInstructions']),
      cancelReason: optStr(j['cancelReason']),
      items: listOf(j['items'], OrderItem.fromJson),
      outletName: str(outlet['name']),
      outletSlug: str(outlet['slug']),
      outletPhone: optStr(outlet['phone']),
      outletLat: optNum(outlet['lat']),
      outletLng: optNum(outlet['lng']),
      outletAddress: optStr(outlet['addressLine1']),
      reviewRating: review == null ? null : toInt(review['rating']),
      reviewComment: review == null ? null : optStr(review['comment']),
    );
  }
}

class RiderInfo {
  const RiderInfo({required this.name, required this.phone, this.vehicleNumber, this.rating = 0, this.lat, this.lng});

  final String name;
  final String phone;
  final String? vehicleNumber;
  final double rating;
  final double? lat;
  final double? lng;

  String get firstName => name.split(' ').first;

  RiderInfo at(double lat, double lng) => RiderInfo(name: name, phone: phone, vehicleNumber: vehicleNumber, rating: rating, lat: lat, lng: lng);

  factory RiderInfo.fromJson(Json j) => RiderInfo(
        name: str(j['name'], 'Your rider'),
        phone: str(j['phone']),
        vehicleNumber: optStr(j['vehicleNumber']),
        rating: toNum(j['rating']),
        lat: optNum(j['lat']),
        lng: optNum(j['lng']),
      );
}

typedef LatLngPoint = ({double lat, double lng});

class Tracking {
  const Tracking({
    required this.orderId,
    required this.status,
    this.orderNumber = '',
    this.deliveryStatus,
    this.timeline = const [],
    this.rider,
    this.outletName = '',
    this.outlet,
    this.drop,
    this.dropLabel,
    this.etaMins,
    this.deliveryOtp,
  });

  final String orderId;
  final String orderNumber;
  final String status;
  final String? deliveryStatus;
  final List<({String status, DateTime? at, String? note})> timeline;
  final RiderInfo? rider;
  final String outletName;
  final LatLngPoint? outlet;
  final LatLngPoint? drop;
  final String? dropLabel;
  final int? etaMins;
  final String? deliveryOtp;

  /// When the timeline first reached any of [statuses].
  DateTime? reached(Set<String> statuses) => timeline.where((e) => statuses.contains(e.status)).firstOrNull?.at;

  Tracking withRider(RiderInfo? r) => Tracking(
        orderId: orderId,
        orderNumber: orderNumber,
        status: status,
        deliveryStatus: deliveryStatus,
        timeline: timeline,
        rider: r,
        outletName: outletName,
        outlet: outlet,
        drop: drop,
        dropLabel: dropLabel,
        etaMins: etaMins,
        deliveryOtp: deliveryOtp,
      );

  static LatLngPoint? _point(Object? v) {
    if (v is! Map) return null;
    final lat = optNum(v['lat']);
    final lng = optNum(v['lng']);
    return lat == null || lng == null ? null : (lat: lat, lng: lng);
  }

  factory Tracking.fromJson(Json j) {
    final outlet = asJson(j['outlet']);
    final drop = j['drop'] is Map ? asJson(j['drop']) : null;
    return Tracking(
      orderId: str(j['orderId']),
      orderNumber: str(j['orderNumber']),
      status: str(j['status']),
      deliveryStatus: optStr(j['deliveryStatus']),
      timeline: listOf(j['timeline'], (e) => (status: str(e['status']), at: optDate(e['at']), note: optStr(e['note']))),
      rider: j['rider'] is Map ? RiderInfo.fromJson(asJson(j['rider'])) : null,
      outletName: str(outlet['name']),
      outlet: _point(outlet),
      drop: _point(drop),
      dropLabel: drop == null ? null : optStr(drop['label']) ?? optStr(drop['line1']),
      etaMins: optInt(j['etaMins']),
      deliveryOtp: optStr(j['deliveryOtp']),
    );
  }
}
