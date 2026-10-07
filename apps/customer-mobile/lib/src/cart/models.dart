import '../common/json.dart';

class Address {
  const Address({
    required this.id,
    required this.label,
    required this.line1,
    required this.city,
    required this.state,
    required this.pincode,
    required this.lat,
    required this.lng,
    this.contactName,
    this.contactPhone,
    this.line2,
    this.landmark,
    this.isDefault = false,
  });

  final String id;
  final String label;
  final String? contactName;
  final String? contactPhone;
  final String line1;
  final String? line2;
  final String? landmark;
  final String city;
  final String state;
  final String pincode;
  final double lat;
  final double lng;
  final bool isDefault;

  factory Address.fromJson(Json j) => Address(
        id: str(j['id']),
        label: str(j['label'], 'Address'),
        contactName: optStr(j['contactName']),
        contactPhone: optStr(j['contactPhone']),
        line1: str(j['line1']),
        line2: optStr(j['line2']),
        landmark: optStr(j['landmark']),
        city: str(j['city']),
        state: str(j['state']),
        pincode: str(j['pincode']),
        lat: toNum(j['lat']),
        lng: toNum(j['lng']),
        isDefault: toBool(j['isDefault']),
      );

  /// "#208, 1st Cross, Koramangala, Bengaluru 560034"
  String get oneLine => [line1, ?line2, '$city $pincode'.trim()].where((s) => s.isNotEmpty).join(', ');

  /// The address as an order/subscription snapshot.
  Json toSnapshot() => {
        'label': label,
        'contactName': ?contactName,
        'contactPhone': ?contactPhone,
        'line1': line1,
        'line2': ?line2,
        'landmark': ?landmark,
        'city': city,
        'state': state,
        'pincode': pincode,
        'lat': lat,
        'lng': lng,
      };
}

class CartLine {
  const CartLine({
    required this.lineId,
    required this.menuItemId,
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.totalPrice,
    this.variantId,
    this.variant,
    this.addonIds = const [],
    this.addons = const [],
    this.isVeg = true,
  });

  final String lineId;
  final String menuItemId;
  final String name;
  final int quantity;
  final String? variantId;
  final String? variant;
  final List<String> addonIds;
  final List<String> addons;
  final double unitPrice;
  final double totalPrice;
  final bool isVeg;

  factory CartLine.fromJson(Json j) => CartLine(
        lineId: str(j['lineId']),
        menuItemId: str(j['menuItemId']),
        name: str(j['name']),
        quantity: toInt(j['quantity'], 1),
        variantId: optStr(j['variantId']),
        variant: optStr(j['variant']),
        addonIds: strings(j['addonIds']),
        addons: strings(j['addons']),
        unitPrice: toNum(j['unitPrice']),
        totalPrice: toNum(j['totalPrice']),
        isVeg: toBool(j['isVeg'], true),
      );

  String get detail => [?variant, ...addons].join(' · ');
}

/// The bill. Also built from an order (which has no savings or messages).
class Pricing {
  const Pricing({
    required this.subtotal,
    required this.total,
    this.couponDiscount = 0,
    this.membershipDiscount = 0,
    this.deliveryFee = 0,
    this.packagingCharge = 0,
    this.platformFee = 0,
    this.cgst = 0,
    this.sgst = 0,
    this.igst = 0,
    this.taxTotal = 0,
    this.tip = 0,
    this.roundOff = 0,
    this.savings = 0,
    this.messages = const [],
  });

  final double subtotal;
  final double couponDiscount;
  final double membershipDiscount;
  final double deliveryFee;
  final double packagingCharge;
  final double platformFee;
  final double cgst;
  final double sgst;
  final double igst;
  final double taxTotal;
  final double tip;
  final double roundOff;
  final double total;
  final double savings;
  final List<String> messages;

  factory Pricing.fromJson(Json j) => Pricing(
        subtotal: toNum(j['subtotal']),
        couponDiscount: toNum(j['couponDiscount']),
        membershipDiscount: toNum(j['membershipDiscount']),
        deliveryFee: toNum(j['deliveryFee']),
        packagingCharge: toNum(j['packagingCharge']),
        platformFee: toNum(j['platformFee']),
        cgst: toNum(j['cgst']),
        sgst: toNum(j['sgst']),
        igst: toNum(j['igst']),
        taxTotal: toNum(j['taxTotal']),
        tip: toNum(j['tip']),
        roundOff: toNum(j['roundOff']),
        total: toNum(j['total']),
        savings: toNum(j['savings']),
        messages: strings(j['messages']),
      );
}

class Cart {
  const Cart({this.outletId, this.outletName, this.couponCode, this.removedItems = const [], this.lines = const [], this.pricing});

  final String? outletId;
  final String? outletName;
  final String? couponCode;
  final List<String> removedItems;
  final List<CartLine> lines;
  final Pricing? pricing;

  static const empty = Cart();

  factory Cart.fromJson(Json j) => Cart(
        outletId: optStr(j['outletId']),
        outletName: optStr(j['outletName']),
        couponCode: optStr(j['couponCode']),
        removedItems: strings(j['removedItems']),
        lines: listOf(j['lines'], CartLine.fromJson),
        pricing: j['pricing'] is Map ? Pricing.fromJson(asJson(j['pricing'])) : null,
      );

  bool get isEmpty => lines.isEmpty;
  int get count => lines.fold(0, (s, l) => s + l.quantity);
  double get itemsTotal => lines.fold(0, (s, l) => s + l.totalPrice);
  int quantityOf(String menuItemId) => lines.where((l) => l.menuItemId == menuItemId).fold(0, (s, l) => s + l.quantity);

  /// Changes whenever the lines or coupon change (keys the quote).
  String get signature => '${lines.map((l) => '${l.lineId}:${l.quantity}').join(',')}|$couponCode';
}

class DeliveryQuote {
  const DeliveryQuote({required this.serviceable, this.reason, this.distanceKm = 0, this.deliveryFee = 0, this.etaMins = 0});

  final bool serviceable;
  final String? reason;
  final double distanceKm;
  final double deliveryFee;
  final int etaMins;

  factory DeliveryQuote.fromJson(Json j) => DeliveryQuote(
        serviceable: toBool(j['serviceable']),
        reason: optStr(j['reason']),
        distanceKm: toNum(j['distanceKm']),
        deliveryFee: toNum(j['deliveryFee']),
        etaMins: toInt(j['etaMins']),
      );
}

class Quote {
  const Quote({required this.cart, this.delivery, this.couponValid, this.couponReason, this.isMember = false});

  final Cart cart;
  final DeliveryQuote? delivery;
  final bool? couponValid;
  final String? couponReason;
  final bool isMember;

  factory Quote.fromJson(Json j) {
    final coupon = j['coupon'] is Map ? asJson(j['coupon']) : null;
    return Quote(
      cart: Cart.fromJson(asJson(j['cart'])),
      delivery: j['delivery'] is Map ? DeliveryQuote.fromJson(asJson(j['delivery'])) : null,
      couponValid: coupon == null ? null : toBool(coupon['valid'], true),
      couponReason: coupon == null ? null : optStr(coupon['reason']),
      isMember: toBool(j['isMember']),
    );
  }
}

class Coupon {
  const Coupon({
    required this.code,
    required this.title,
    required this.type,
    this.description,
    this.value = 0,
    this.maxDiscount,
    this.minOrderValue = 0,
    this.validTo,
    this.eligible = true,
    this.reason,
  });

  final String code;
  final String title;
  final String? description;
  final String type;
  final double value;
  final double? maxDiscount;
  final double minOrderValue;
  final DateTime? validTo;
  final bool eligible;
  final String? reason;

  factory Coupon.fromJson(Json j) => Coupon(
        code: str(j['code']),
        title: str(j['title']),
        description: optStr(j['description']),
        type: str(j['type']),
        value: toNum(j['value']),
        maxDiscount: optNum(j['maxDiscount']),
        minOrderValue: toNum(j['minOrderValue']),
        validTo: optDate(j['validTo']),
        eligible: toBool(j['eligible'], true),
        reason: optStr(j['reason']),
      );
}

enum PaymentMethod {
  upi('UPI', 'UPI', 'Google Pay, PhonePe, Paytm or any UPI app'),
  card('CARD', 'Credit or debit card', null),
  netbanking('NETBANKING', 'Net banking', null),
  wallet('WALLET', 'FoodGrid wallet', null),
  cod('COD', 'Cash on delivery', 'Pay the rider in cash or UPI');

  const PaymentMethod(this.wire, this.label, this.hint);
  final String wire;
  final String label;
  final String? hint;

  static PaymentMethod fromWire(String? v) => PaymentMethod.values.firstWhere((m) => m.wire == v, orElse: () => PaymentMethod.upi);
}

class CheckoutResult {
  const CheckoutResult({required this.orderId, required this.orderNumber, required this.total, required this.paymentRequired, required this.status});

  final String orderId;
  final String orderNumber;
  final double total;
  final String status;
  final bool paymentRequired;

  factory CheckoutResult.fromJson(Json j) {
    final order = asJson(j['order']);
    final payment = j['payment'] is Map ? asJson(j['payment']) : const <String, dynamic>{};
    return CheckoutResult(
      orderId: str(order['id']),
      orderNumber: str(order['orderNumber']),
      total: toNum(order['total']),
      status: str(order['status']),
      paymentRequired: toBool(payment['required']),
    );
  }
}
