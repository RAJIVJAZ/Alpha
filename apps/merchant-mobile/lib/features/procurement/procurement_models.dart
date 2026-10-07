import 'package:foodgrid_core/foodgrid_core.dart';

import '../../core/json.dart';

const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

class ReorderAlert {
  const ReorderAlert({
    required this.id,
    required this.outletId,
    required this.ingredientId,
    required this.ingredientName,
    required this.unit,
    required this.severity,
    this.category = '',
    this.currentStock = 0,
    this.reorderLevel = 0,
    this.avgDailyUsage = 0,
    this.daysOfCover = 0,
    this.predictedDepletionDate,
    this.suggestedQty = 0,
    this.purchaseOrderId,
  });

  final String id;
  final String outletId;
  final String ingredientId;
  final String ingredientName;
  final String category;
  final String unit;
  final double currentStock;
  final double reorderLevel;
  final double avgDailyUsage;
  final double daysOfCover;
  final DateTime? predictedDepletionDate;
  final double suggestedQty;
  final String severity;
  final String? purchaseOrderId;

  factory ReorderAlert.fromJson(Json j) => ReorderAlert(
        id: str(j['id']),
        outletId: str(j['outletId']),
        ingredientId: str(j['ingredientId']),
        ingredientName: str(j['ingredientName']),
        category: str(j['category']),
        unit: str(j['unit']),
        currentStock: dec(j['currentStock']),
        reorderLevel: dec(j['reorderLevel']),
        avgDailyUsage: dec(j['avgDailyUsage']),
        daysOfCover: dec(j['daysOfCover']),
        predictedDepletionDate: dateOrNull(j['predictedDepletionDate']),
        suggestedQty: dec(j['suggestedQty']),
        severity: str(j['severity'], 'LOW'),
        purchaseOrderId: strOrNull(j['purchaseOrderId']),
      );
}

class PoItem {
  const PoItem({
    required this.id,
    required this.name,
    required this.unit,
    this.quantity = 0,
    this.unitPrice = 0,
    this.gstRate = 0,
    this.lineTotal = 0,
    this.confirmedQty,
    this.receivedQty = 0,
  });

  final String id;
  final String name;
  final String unit;
  final double quantity;
  final double unitPrice;
  final double gstRate;
  final double lineTotal;
  final double? confirmedQty;
  final double receivedQty;

  double get outstanding => ((confirmedQty ?? quantity) - receivedQty).clamp(0, double.infinity).toDouble();

  factory PoItem.fromJson(Json j) => PoItem(
        id: str(j['id']),
        name: str(j['name']),
        unit: str(j['unit']),
        quantity: dec(j['quantity']),
        unitPrice: dec(j['unitPrice']),
        gstRate: dec(j['gstRate']),
        lineTotal: dec(j['lineTotal']),
        confirmedQty: decOrNull(j['confirmedQty']),
        receivedQty: dec(j['receivedQty']),
      );
}

class PoEvent {
  const PoEvent({required this.status, this.note, this.at});
  final String status;
  final String? note;
  final DateTime? at;

  factory PoEvent.fromJson(Json j) => PoEvent(status: str(j['status']), note: strOrNull(j['note']), at: dateOrNull(j['createdAt']));
}

class PoApproval {
  const PoApproval({required this.decision, this.comment, this.at});
  final String decision;
  final String? comment;
  final DateTime? at;

  factory PoApproval.fromJson(Json j) => PoApproval(decision: str(j['decision']), comment: strOrNull(j['comment']), at: dateOrNull(j['decidedAt']));
}

class PurchaseOrder {
  const PurchaseOrder({
    required this.id,
    required this.poNumber,
    required this.status,
    required this.supplierName,
    this.outletId = '',
    this.source = 'MANUAL',
    this.subtotal = 0,
    this.taxTotal = 0,
    this.deliveryCharge = 0,
    this.total = 0,
    this.paymentTerms = '',
    this.expectedDeliveryAt,
    this.notes,
    this.supplierNotes,
    this.tracking = const {},
    this.createdAt,
    this.items = const [],
    this.events = const [],
    this.approvals = const [],
  });

  final String id;
  final String poNumber;
  final String outletId;
  final String supplierName;
  final String status;
  final String source;
  final double subtotal;
  final double taxTotal;
  final double deliveryCharge;
  final double total;
  final String paymentTerms;
  final DateTime? expectedDeliveryAt;
  final String? notes;
  final String? supplierNotes;
  final Json tracking;
  final DateTime? createdAt;
  final List<PoItem> items;
  final List<PoEvent> events;
  final List<PoApproval> approvals;

  String get raisedBy => source == 'AUTO_REORDER' ? 'Procurement engine' : humanize(source);

  factory PurchaseOrder.fromJson(Json j) => PurchaseOrder(
        id: str(j['id']),
        poNumber: str(j['poNumber']),
        outletId: str(j['outletId']),
        supplierName: str(j['supplierName']),
        status: str(j['status']),
        source: str(j['source'], 'MANUAL'),
        subtotal: dec(j['subtotal']),
        taxTotal: dec(j['taxTotal']),
        deliveryCharge: dec(j['deliveryCharge']),
        total: dec(j['total']),
        paymentTerms: str(j['paymentTerms']),
        expectedDeliveryAt: dateOrNull(j['expectedDeliveryAt']),
        notes: strOrNull(j['notes']),
        supplierNotes: strOrNull(j['supplierNotes']),
        tracking: mapOf(j['trackingInfo']),
        createdAt: dateOrNull(j['createdAt']),
        items: [for (final i in listOfMaps(j['items'])) PoItem.fromJson(i)],
        events: [for (final e in listOfMaps(j['events'])) PoEvent.fromJson(e)],
        approvals: [for (final a in listOfMaps(j['approvals'])) PoApproval.fromJson(a)],
      );
}

class ProcurementDashboard {
  const ProcurementDashboard({this.openAlerts = const {}, this.pendingApproval = 0, this.awaitingSupplier = 0, this.inTransit = 0, this.deliveredNotReceived = 0, this.monthToDateSpend = 0});
  final Map<String, int> openAlerts;
  final int pendingApproval;
  final int awaitingSupplier;
  final int inTransit;
  final int deliveredNotReceived;
  final double monthToDateSpend;

  int get totalAlerts => openAlerts.values.fold(0, (a, b) => a + b);
  int get urgentAlerts => (openAlerts['CRITICAL'] ?? 0) + (openAlerts['HIGH'] ?? 0);

  factory ProcurementDashboard.fromJson(Json j) => ProcurementDashboard(
        openAlerts: {for (final e in mapOf(j['openAlerts']).entries) e.key: intOf(e.value)},
        pendingApproval: intOf(j['pendingApproval']),
        awaitingSupplier: intOf(j['awaitingSupplier']),
        inTransit: intOf(j['inTransit']),
        deliveredNotReceived: intOf(j['deliveredNotReceived']),
        monthToDateSpend: dec(j['monthToDateSpend']),
      );
}
