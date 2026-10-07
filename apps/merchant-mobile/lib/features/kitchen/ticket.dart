import '../../core/json.dart';

class TicketItem {
  const TicketItem({required this.name, required this.quantity, this.variant, this.addons = const [], this.notes});
  final String name;
  final int quantity;
  final String? variant;
  final List<String> addons;
  final String? notes;

  String get options => [?variant, ...addons].join(' · ');

  factory TicketItem.fromJson(Json j) => TicketItem(
        name: str(j['name']),
        quantity: intOf(j['quantity'], 1),
        variant: strOrNull(j['variant']),
        addons: [for (final a in (j['addons'] is List ? j['addons'] as List : const [])) a is Map ? str(a['name']) : a.toString()],
        notes: strOrNull(j['notes']),
      );
}

/// A kitchen ticket (one per order and station), as GET kds/tickets returns it.
class KitchenTicket {
  const KitchenTicket({
    required this.id,
    required this.orderId,
    required this.orderNumber,
    required this.ticketNumber,
    required this.station,
    required this.status,
    required this.orderType,
    required this.elapsedSeconds,
    this.createdAt,
    this.items = const [],
  });

  final String id;
  final String orderId;
  final String orderNumber;
  final int ticketNumber;
  final String station;
  final String status;
  final String orderType;
  final int elapsedSeconds;
  final DateTime? createdAt;
  final List<TicketItem> items;

  factory KitchenTicket.fromJson(Json j) => KitchenTicket(
        id: str(j['id']),
        orderId: str(j['orderId']),
        orderNumber: str(j['orderNumber']),
        ticketNumber: intOf(j['ticketNumber']),
        station: str(j['station'], 'MAIN'),
        status: str(j['status'], 'QUEUED'),
        orderType: str(j['orderType']),
        elapsedSeconds: intOf(j['elapsedSeconds']),
        createdAt: dateOrNull(j['createdAt']),
        items: [for (final i in listOfMaps(j['items'])) TicketItem.fromJson(i)],
      );
}

/// Ticket age against the kitchen SLA used by the web KDS (12 min warn, 20 min late).
enum TicketAge {
  onTime('On time'),
  dueSoon('Due soon'),
  overdue('Overdue');

  const TicketAge(this.label);
  final String label;

  static const warnAfter = Duration(minutes: 12);
  static const lateAfter = Duration(minutes: 20);

  static TicketAge of(int elapsedSeconds, String status) {
    if (status == 'READY') return TicketAge.onTime;
    if (elapsedSeconds >= lateAfter.inSeconds) return TicketAge.overdue;
    if (elapsedSeconds >= warnAfter.inSeconds) return TicketAge.dueSoon;
    return TicketAge.onTime;
  }
}

/// "12:05" (minutes:seconds), "1:02:05" past an hour.
String elapsedLabel(int seconds) {
  final s = seconds < 0 ? 0 : seconds;
  final h = s ~/ 3600;
  final m = (s % 3600) ~/ 60;
  final sec = (s % 60).toString().padLeft(2, '0');
  return h > 0 ? '$h:${m.toString().padLeft(2, '0')}:$sec' : '$m:$sec';
}
