import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';

/// Filter chips: the categories a kitchen tracks most, plus "Other" for the rest.
const inventoryChips = ['FLOUR', 'OIL', 'SUGAR', 'DAIRY', 'VEGETABLES', 'PACKAGING', 'SPICES', 'OTHER'];
const namedInventoryCategories = {'FLOUR', 'OIL', 'SUGAR', 'DAIRY', 'VEGETABLES', 'PACKAGING', 'SPICES'};

class Ingredient {
  const Ingredient({
    required this.id,
    required this.name,
    required this.category,
    required this.unit,
    this.sku = '',
    this.currentStock = 0,
    this.reorderLevel = 0,
    this.avgUnitCost = 0,
    this.stockValue = 0,
    this.status = 'OK',
  });

  final String id;
  final String name;
  final String sku;
  final String category;
  final String unit;
  final double currentStock;
  final double reorderLevel;
  final double avgUnitCost;
  final double stockValue;

  /// OK, LOW or OUT.
  final String status;

  factory Ingredient.fromJson(Json j) => Ingredient(
        id: str(j['id']),
        name: str(j['name']),
        sku: str(j['sku']),
        category: str(j['category'], 'OTHER'),
        unit: str(j['unit']),
        currentStock: dec(j['currentStock']),
        reorderLevel: dec(j['reorderLevel']),
        avgUnitCost: dec(j['avgUnitCost']),
        stockValue: dec(j['stockValue']),
        status: str(j['status'], 'OK'),
      );

  /// Status for StatusChip (tone + icon + label).
  (String, String) get chip => switch (status) {
        'LOW' => ('LOW_STOCK', 'Low'),
        'OUT' => ('OUT_OF_STOCK', 'Out'),
        _ => ('IN_STOCK', 'OK'),
      };
}

class ExpiringBatch {
  const ExpiringBatch({required this.batchId, required this.ingredient, required this.unit, required this.remainingQty, this.expiresAt, this.value = 0});
  final String batchId;
  final String ingredient;
  final String unit;
  final double remainingQty;
  final DateTime? expiresAt;
  final double value;

  factory ExpiringBatch.fromJson(Json j) => ExpiringBatch(
        batchId: str(j['batchId']),
        ingredient: str(j['ingredient']),
        unit: str(j['unit']),
        remainingQty: dec(j['remainingQty']),
        expiresAt: dateOrNull(j['expiresAt']),
        value: dec(j['value']),
      );
}

class InventorySummary {
  const InventorySummary({this.totalItems = 0, this.totalValue = 0, this.lowStock = 0, this.outOfStock = 0, this.expiringSoon = const []});
  final int totalItems;
  final double totalValue;
  final int lowStock;
  final int outOfStock;
  final List<ExpiringBatch> expiringSoon;

  factory InventorySummary.fromJson(Json j) => InventorySummary(
        totalItems: intOf(j['totalItems']),
        totalValue: dec(j['totalValue']),
        lowStock: intOf(j['lowStock']),
        outOfStock: intOf(j['outOfStock']),
        expiringSoon: [for (final b in listOfMaps(j['expiringSoon'])) ExpiringBatch.fromJson(b)],
      );
}
