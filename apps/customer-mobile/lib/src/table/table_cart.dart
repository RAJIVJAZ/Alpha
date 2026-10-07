import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../cart/cart_controller.dart';
import '../common/json.dart';
import '../common/local_store.dart';
import '../outlet/models.dart';

/// Reads a table token from a scanned QR code: a URL ending in `/t/<token>`
/// (e.g. https://foodgrid.in/t/OJLDvPvsvl4BgWGt) or the bare token.
String? parseTableToken(String? raw) {
  final s = raw?.trim() ?? '';
  if (s.isEmpty) return null;
  final uri = Uri.tryParse(s);
  if (uri != null && (uri.hasScheme || s.contains('/'))) {
    final segments = uri.pathSegments.where((p) => p.isNotEmpty).toList();
    final i = segments.lastIndexOf('t');
    if (i >= 0 && i + 1 < segments.length && _token.hasMatch(segments[i + 1])) return segments[i + 1];
    if (uri.scheme == 'foodgrid' && (uri.host == 't' || uri.host == 'table') && segments.isNotEmpty && _token.hasMatch(segments.first)) return segments.first;
    return null;
  }
  return _token.hasMatch(s) ? s : null;
}

final _token = RegExp(r'^[A-Za-z0-9_-]{6,64}$');

final tableMenuProvider = FutureProvider.autoDispose.family<TableMenu, String>((ref, token) async {
  return TableMenu.fromJson(asJson(await ref.watch(apiClientProvider).get<dynamic>('qr/${Uri.encodeComponent(token)}', auth: false)));
});

/// A dish in the table's local cart.
class TableLine {
  const TableLine({required this.key, required this.line, required this.name, required this.isVeg, required this.unit, this.detail = ''});

  final String key;
  final AddLine line;
  final String name;
  final bool isVeg;
  final double unit;
  final String detail;

  int get quantity => line.quantity;

  TableLine withQuantity(int q) => TableLine(
        key: key,
        line: AddLine(menuItemId: line.menuItemId, quantity: q, variantId: line.variantId, addonIds: line.addonIds, notes: line.notes),
        name: name,
        isVeg: isVeg,
        unit: unit,
        detail: detail,
      );

  Json toJson() => {'key': key, 'line': line.toJson(), 'name': name, 'isVeg': isVeg, 'unit': unit, 'detail': detail};

  factory TableLine.fromJson(Json j) {
    final l = asJson(j['line']);
    return TableLine(
      key: str(j['key']),
      line: AddLine(menuItemId: str(l['menuItemId']), quantity: toInt(l['quantity'], 1), variantId: optStr(l['variantId']), addonIds: strings(l['addonIds']), notes: optStr(l['notes'])),
      name: str(j['name']),
      isVeg: toBool(j['isVeg'], true),
      unit: toNum(j['unit']),
      detail: str(j['detail']),
    );
  }
}

/// An order already sent to the kitchen from this table.
class PlacedTableOrder {
  const PlacedTableOrder({required this.id, required this.orderNumber, required this.total, required this.paid});

  final String id;
  final String orderNumber;
  final double total;
  final bool paid;

  Json toJson() => {'id': id, 'orderNumber': orderNumber, 'total': total, 'paid': paid};

  factory PlacedTableOrder.fromJson(Json j) => PlacedTableOrder(id: str(j['id']), orderNumber: str(j['orderNumber']), total: toNum(j['total']), paid: toBool(j['paid']));
}

class TableCart {
  const TableCart({this.lines = const [], this.placed = const []});

  final List<TableLine> lines;
  final List<PlacedTableOrder> placed;

  int get count => lines.fold(0, (s, l) => s + l.quantity);
  double get subtotal => lines.fold(0, (s, l) => s + l.unit * l.quantity);
  int quantityOf(String menuItemId) => lines.where((l) => l.line.menuItemId == menuItemId).fold(0, (s, l) => s + l.quantity);
}

/// The local (device-only) cart for one table, kept across app restarts.
class TableCartController extends Notifier<TableCart> {
  TableCartController(this.token);
  final String token;

  String get _key => 'fg.table.$token';

  @override
  TableCart build() {
    _restore();
    return const TableCart();
  }

  Future<void> _restore() async {
    final saved = await ref.read(localStoreProvider).read(_key);
    if (saved == null || !ref.mounted || state.lines.isNotEmpty || state.placed.isNotEmpty) return;
    try {
      final j = asJson(jsonDecode(saved));
      state = TableCart(lines: listOf(j['lines'], TableLine.fromJson), placed: listOf(j['placed'], PlacedTableOrder.fromJson));
    } catch (_) {}
  }

  void _save(TableCart next) {
    state = next;
    ref.read(localStoreProvider).write(_key, jsonEncode({'lines': [for (final l in next.lines) l.toJson()], 'placed': [for (final p in next.placed) p.toJson()]}));
  }

  void add(MenuItem item, AddLine line) {
    final variant = item.variants.where((v) => v.id == line.variantId).firstOrNull;
    final addons = item.addonGroups.expand((g) => g.addons).where((a) => line.addonIds.contains(a.id));
    final key = [item.id, line.variantId ?? '', ([...line.addonIds]..sort()).join('+'), line.notes ?? ''].join('|');
    final hit = state.lines.where((l) => l.key == key).firstOrNull;
    if (hit != null) {
      _save(TableCart(lines: [for (final l in state.lines) l.key == key ? l.withQuantity((l.quantity + line.quantity).clamp(1, 30)) : l], placed: state.placed));
      return;
    }
    _save(TableCart(
      lines: [
        ...state.lines,
        TableLine(
          key: key,
          line: line,
          name: item.name,
          isVeg: item.isVeg,
          unit: item.unitPrice(variantId: line.variantId, addonIds: line.addonIds),
          detail: [if (variant != null && item.variants.length > 1) variant.name, ...addons.map((a) => a.name)].join(' · '),
        ),
      ],
      placed: state.placed,
    ));
  }

  void setQuantity(String key, int n) => _save(TableCart(
        lines: n <= 0 ? state.lines.where((l) => l.key != key).toList() : [for (final l in state.lines) l.key == key ? l.withQuantity(n.clamp(1, 30)) : l],
        placed: state.placed,
      ));

  void placed(PlacedTableOrder p) => _save(TableCart(lines: const [], placed: [p, ...state.placed]));
}

final tableCartProvider = NotifierProvider.family<TableCartController, TableCart, String>(TableCartController.new);
