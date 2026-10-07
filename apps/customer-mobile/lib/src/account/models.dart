import '../common/json.dart';
import '../outlet/models.dart' show slotLabels;

class Profile {
  const Profile({required this.id, this.name, this.phone, this.email, this.referralCode});

  final String id;
  final String? name;
  final String? phone;
  final String? email;
  final String? referralCode;

  factory Profile.fromJson(Json j) =>
      Profile(id: str(j['id']), name: optStr(j['name']), phone: optStr(j['phone']), email: optStr(j['email']), referralCode: optStr(j['referralCode']));
}

class NotificationPrefs {
  const NotificationPrefs({this.pushEnabled = true, this.smsEnabled = true, this.emailEnabled = true, this.marketingEnabled = true, this.quietHoursStart, this.quietHoursEnd});

  final bool pushEnabled;
  final bool smsEnabled;
  final bool emailEnabled;
  final bool marketingEnabled;
  final String? quietHoursStart;
  final String? quietHoursEnd;

  factory NotificationPrefs.fromJson(Json j) => NotificationPrefs(
        pushEnabled: toBool(j['pushEnabled'], true),
        smsEnabled: toBool(j['smsEnabled'], true),
        emailEnabled: toBool(j['emailEnabled'], true),
        marketingEnabled: toBool(j['marketingEnabled'], true),
        quietHoursStart: optStr(j['quietHoursStart']),
        quietHoursEnd: optStr(j['quietHoursEnd']),
      );

  bool flag(String key) => switch (key) {
        'pushEnabled' => pushEnabled,
        'smsEnabled' => smsEnabled,
        'emailEnabled' => emailEnabled,
        _ => marketingEnabled,
      };

  NotificationPrefs withFlag(String key, bool value) => NotificationPrefs(
        pushEnabled: key == 'pushEnabled' ? value : pushEnabled,
        smsEnabled: key == 'smsEnabled' ? value : smsEnabled,
        emailEnabled: key == 'emailEnabled' ? value : emailEnabled,
        marketingEnabled: key == 'marketingEnabled' ? value : marketingEnabled,
        quietHoursStart: quietHoursStart,
        quietHoursEnd: quietHoursEnd,
      );
}

class WalletTxn {
  const WalletTxn({required this.id, required this.type, required this.reason, required this.amount, this.balanceAfter = 0, this.description, this.createdAt});

  final String id;
  final String type;
  final String reason;
  final double amount;
  final double balanceAfter;
  final String? description;
  final DateTime? createdAt;

  bool get isCredit => type == 'CREDIT';

  factory WalletTxn.fromJson(Json j) => WalletTxn(
        id: str(j['id']),
        type: str(j['type']),
        reason: str(j['reason']),
        amount: toNum(j['amount']),
        balanceAfter: toNum(j['balanceAfter']),
        description: optStr(j['description']),
        createdAt: optDate(j['createdAt']),
      );
}

class WalletStatement {
  const WalletStatement({required this.balance, required this.status, this.transactions = const [], this.page = 1, this.totalPages = 1});

  final double balance;
  final String status;
  final List<WalletTxn> transactions;
  final int page;
  final int totalPages;

  factory WalletStatement.fromJson(Json j) {
    final wallet = asJson(j['wallet']);
    final meta = asJson(j['meta']);
    return WalletStatement(
      balance: toNum(wallet['balance']),
      status: str(wallet['status'], 'ACTIVE'),
      transactions: listOf(j['transactions'], WalletTxn.fromJson),
      page: toInt(meta['page'], 1),
      totalPages: toInt(meta['totalPages'], 1),
    );
  }
}

class MembershipPlan {
  const MembershipPlan({required this.id, required this.name, this.code = '', this.description, this.price = 0, this.durationDays = 30, this.extraDiscountPct, this.freeDeliveryAbove, this.maxDiscountPerOrder});

  final String id;
  final String code;
  final String name;
  final String? description;
  final double price;
  final int durationDays;
  final double? extraDiscountPct;
  final double? freeDeliveryAbove;
  final double? maxDiscountPerOrder;

  factory MembershipPlan.fromJson(Json j) {
    final b = asJson(j['benefits']);
    return MembershipPlan(
      id: str(j['id']),
      code: str(j['code']),
      name: str(j['name']),
      description: optStr(j['description']),
      price: toNum(j['price']),
      durationDays: toInt(j['durationDays'], 30),
      extraDiscountPct: optNum(b['extraDiscountPct']),
      freeDeliveryAbove: optNum(b['freeDeliveryAbove']),
      maxDiscountPerOrder: optNum(b['maxDiscountPerOrder']),
    );
  }
}

class ActiveMembership {
  const ActiveMembership({required this.id, required this.status, required this.plan, this.startsAt, this.endsAt, this.autoRenew = false, this.savings = 0});

  final String id;
  final String status;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final bool autoRenew;
  final double savings;
  final MembershipPlan plan;

  factory ActiveMembership.fromJson(Json j) => ActiveMembership(
        id: str(j['id']),
        status: str(j['status']),
        startsAt: optDate(j['startsAt']),
        endsAt: optDate(j['endsAt']),
        autoRenew: toBool(j['autoRenew']),
        savings: toNum(j['savings']),
        plan: MembershipPlan.fromJson(asJson(j['plan'])),
      );
}

class MealSubscription {
  const MealSubscription({
    required this.id,
    required this.status,
    required this.planName,
    required this.slot,
    this.outletId = '',
    this.startDate,
    this.endDate,
    this.deliveryTime = '',
    this.mealsTotal = 0,
    this.mealsDelivered = 0,
    this.pausedDates = const [],
    this.amountPaid = 0,
  });

  final String id;
  final String outletId;
  final String status;
  final String planName;
  final String slot;
  final DateTime? startDate;
  final DateTime? endDate;
  final String deliveryTime;
  final int mealsTotal;
  final int mealsDelivered;

  /// yyyy-MM-dd
  final List<String> pausedDates;
  final double amountPaid;

  bool get isLive => status == 'ACTIVE' || status == 'PAUSED';
  String get slotLabel => slotLabels[slot] ?? slot;

  factory MealSubscription.fromJson(Json j) {
    final plan = asJson(j['plan']);
    return MealSubscription(
      id: str(j['id']),
      outletId: str(j['outletId']),
      status: str(j['status']),
      planName: str(plan['name'], 'Meal plan'),
      slot: str(j['slot'], str(plan['slot'])),
      startDate: optDate(j['startDate']),
      endDate: optDate(j['endDate']),
      deliveryTime: str(j['deliveryTime']),
      mealsTotal: toInt(j['mealsTotal']),
      mealsDelivered: toInt(j['mealsDelivered']),
      pausedDates: [for (final d in strings(j['pausedDates'])) d.length >= 10 ? d.substring(0, 10) : d],
      amountPaid: toNum(j['amountPaid']),
    );
  }
}

class AppNotification {
  const AppNotification({required this.id, required this.title, required this.body, this.data = const {}, this.readAt, this.createdAt});

  final String id;
  final String title;
  final String body;
  final Json data;
  final DateTime? readAt;
  final DateTime? createdAt;

  bool get unread => readAt == null;

  /// Where tapping it should go (an order, or the push's deep link).
  String? get link => optStr(data['deepLink']) ?? (optStr(data['orderId']) == null ? null : 'foodgrid://orders/${data['orderId']}');

  factory AppNotification.fromJson(Json j) => AppNotification(
        id: str(j['id']),
        title: str(j['title']),
        body: str(j['body']),
        data: asJson(j['data']),
        readAt: optDate(j['readAt']),
        createdAt: optDate(j['createdAt']),
      );
}
