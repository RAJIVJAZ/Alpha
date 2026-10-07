import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';
import '../menu/menu_models.dart';
import '../outlets/outlet_providers.dart';

/// One bill line: an item with a chosen variant and add-ons.
class BillLine {
  const BillLine({required this.key, required this.item, required this.quantity, required this.unitPrice, required this.label, this.variantId, this.addonIds = const []});

  final String key;
  final MenuItem item;
  final String? variantId;
  final List<String> addonIds;
  final int quantity;
  final double unitPrice;
  final String label;

  double get amount => unitPrice * quantity;

  BillLine withQuantity(int q) => BillLine(key: key, item: item, variantId: variantId, addonIds: addonIds, quantity: q, unitPrice: unitPrice, label: label);
}

/// Counter bill. Prices are before GST; the receipt from pos/orders adds
/// CGST / SGST and packaging, exactly as the web POS.
class Bill {
  const Bill({this.lines = const [], required this.idempotencyKey});

  final List<BillLine> lines;

  /// One key per bill, so a retried charge can't bill twice.
  final String idempotencyKey;

  int get count => lines.fold(0, (s, l) => s + l.quantity);
  double get subtotal => lines.fold(0.0, (s, l) => s + l.amount);
  bool get isEmpty => lines.isEmpty;

  /// Payable before GST after a flat discount (never negative).
  double totalAfter(double discount) => (subtotal - discount).clamp(0, double.infinity).toDouble();

  Bill add(MenuItem item, {String? variantId, List<String> addonIds = const []}) {
    final sorted = [...addonIds]..sort();
    final key = [item.id, variantId ?? '', ...sorted].join('|');
    final variant = item.variants.where((v) => v.id == variantId).firstOrNull;
    final addons = [for (final g in item.addonGroups) for (final a in g.addons) if (addonIds.contains(a.id)) a];
    final unitPrice = item.price + (variant?.priceDelta ?? 0) + addons.fold(0.0, (s, a) => s + a.price);
    final label = [item.name, ?variant?.name, for (final a in addons) a.name].join(' · ');
    final existing = lines.any((l) => l.key == key);
    return Bill(
      idempotencyKey: idempotencyKey,
      lines: existing
          ? [for (final l in lines) l.key == key ? l.withQuantity((l.quantity + 1).clamp(1, 99)) : l]
          : [...lines, BillLine(key: key, item: item, variantId: variantId, addonIds: sorted, quantity: 1, unitPrice: unitPrice, label: label)],
    );
  }

  Bill bump(String key, int delta) => Bill(
        idempotencyKey: idempotencyKey,
        lines: [
          for (final l in lines)
            if (l.key != key)
              l
            else if (l.quantity + delta > 0)
              l.withQuantity((l.quantity + delta).clamp(1, 99)),
        ],
      );

  /// `items` for POST pos/orders.
  List<Json> toItemsJson() => [
        for (final l in lines)
          {
            'menuItemId': l.item.id,
            'quantity': l.quantity,
            'variantId': ?l.variantId,
            if (l.addonIds.isNotEmpty) 'addonIds': l.addonIds,
          },
      ];
}

class BillController extends Notifier<Bill> {
  @override
  Bill build() {
    ref.watch(currentOutletIdProvider); // a new outlet starts a new bill
    return Bill(idempotencyKey: newIdempotencyKey());
  }

  void add(MenuItem item, {String? variantId, List<String> addonIds = const []}) => state = state.add(item, variantId: variantId, addonIds: addonIds);
  void bump(String key, int delta) => state = state.bump(key, delta);
  void clear() => state = Bill(idempotencyKey: newIdempotencyKey());
}

final billProvider = NotifierProvider<BillController, Bill>(BillController.new);

class ReceiptLine {
  const ReceiptLine(this.name, this.qty, this.rate, this.amount);
  final String name;
  final int qty;
  final double rate;
  final double amount;
}

/// The tax receipt returned by POST pos/orders.
class Receipt {
  const Receipt({
    required this.orderNumber,
    required this.outletName,
    this.address = '',
    this.gstin,
    this.fssai,
    this.items = const [],
    this.subtotal = 0,
    this.discount = 0,
    this.packaging = 0,
    this.cgst = 0,
    this.sgst = 0,
    this.roundOff = 0,
    this.total = 0,
    this.paymentMethod = '',
    this.issuedAt,
  });

  final String orderNumber;
  final String outletName;
  final String address;
  final String? gstin;
  final String? fssai;
  final List<ReceiptLine> items;
  final double subtotal;
  final double discount;
  final double packaging;
  final double cgst;
  final double sgst;
  final double roundOff;
  final double total;
  final String paymentMethod;
  final DateTime? issuedAt;

  double get gst => cgst + sgst;

  factory Receipt.fromJson(Json j) {
    final outlet = mapOf(j['outlet']);
    return Receipt(
      orderNumber: str(j['orderNumber']),
      outletName: str(outlet['name']),
      address: str(outlet['address']),
      gstin: strOrNull(outlet['gstin']),
      fssai: strOrNull(outlet['fssai']),
      items: [for (final i in listOfMaps(j['items'])) ReceiptLine(str(i['name']), intOf(i['qty'], 1), dec(i['rate']), dec(i['amount']))],
      subtotal: dec(j['subtotal']),
      discount: dec(j['discount']),
      packaging: dec(j['packaging']),
      cgst: dec(j['cgst']),
      sgst: dec(j['sgst']),
      roundOff: dec(j['roundOff']),
      total: dec(j['total']),
      paymentMethod: str(j['paymentMethod']),
      issuedAt: dateOrNull(j['issuedAt']),
    );
  }
}

enum PayMethod { upi, cash, card }

extension PayMethodWire on PayMethod {
  String get wire => name.toUpperCase();
  String get label => switch (this) { PayMethod.upi => 'UPI', PayMethod.cash => 'Cash', PayMethod.card => 'Card' };
}

/// POST pos/orders with the bill's Idempotency-Key; returns the receipt.
Future<Receipt> chargeBill(
  ApiClient api, {
  required String outletId,
  required Bill bill,
  required PayMethod payment,
  required String orderType,
  String? tableId,
  String? customerName,
  String? customerPhone,
  double discount = 0,
}) async {
  final r = await api.post<Map<String, dynamic>>(
    'pos/orders',
    idempotencyKey: bill.idempotencyKey,
    body: {
      'outletId': outletId,
      'items': bill.toItemsJson(),
      'paymentMethod': payment.wire,
      'orderType': orderType,
      if (orderType == 'DINE_IN' && tableId != null) 'tableId': tableId,
      'customerName': ?customerName,
      'customerPhone': ?customerPhone,
      if (discount > 0) 'discount': discount,
    },
  );
  return Receipt.fromJson(mapOf(r['receipt']));
}
