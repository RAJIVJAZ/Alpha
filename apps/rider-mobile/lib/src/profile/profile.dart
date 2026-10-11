import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/json.dart';
import '../common/polling.dart';
import '../duty/duty_repository.dart';

class BankAccount {
  const BankAccount({this.holder, this.ifsc, this.last4});
  final String? holder;
  final String? ifsc;
  final String? last4;

  static BankAccount? fromJson(Object? json) {
    final j = jsonOrNull(json);
    if (j == null) return null;
    return BankAccount(holder: strOrNull(j['holder']), ifsc: strOrNull(j['ifsc']), last4: strOrNull(j['last4']));
  }
}

/// GET riders/me
class RiderProfile {
  const RiderProfile({
    required this.id,
    required this.name,
    this.phone,
    this.city,
    required this.status,
    this.vehicleType,
    this.vehicleNumber,
    required this.rating,
    this.ratingCount = 0,
    required this.isOnline,
    this.isOnDelivery = false,
    this.acceptanceRate,
    required this.totalDeliveries,
    this.upiId,
    this.bankAccount,
    this.currentLat,
    this.currentLng,
    this.licenseNumber,
    this.documents = const {},
    this.rejectionReason,
  });

  final String id;
  final String name;
  final String? phone;
  final String? city;
  final String status;
  final String? vehicleType;
  final String? vehicleNumber;
  final double rating;
  final int ratingCount;
  final bool isOnline;
  final bool isOnDelivery;
  final double? acceptanceRate;
  final int totalDeliveries;
  final String? upiId;
  final BankAccount? bankAccount;
  final double? currentLat;
  final double? currentLng;
  final String? licenseNumber;

  /// Application documents: kind (DRIVING_LICENSE, ID_PROOF) → uploaded URL.
  final Map<String, String> documents;

  /// The reviewer's note when the application was rejected or changes were requested.
  final String? rejectionReason;

  String get firstName => name.trim().split(RegExp(r'\s+')).first;
  bool get isActive => status == 'ACTIVE';

  factory RiderProfile.fromJson(Json j) => RiderProfile(
        id: strOf(j['id']),
        name: strOf(j['name'], 'Rider'),
        phone: strOrNull(j['phone']),
        city: strOrNull(j['city']),
        status: strOf(j['status'], 'ACTIVE'),
        vehicleType: strOrNull(j['vehicleType']),
        vehicleNumber: strOrNull(j['vehicleNumber']),
        rating: numOf(j['rating']),
        ratingCount: intOf(j['ratingCount']),
        isOnline: j['isOnline'] == true,
        isOnDelivery: j['isOnDelivery'] == true,
        acceptanceRate: numOrNull(j['acceptanceRate']),
        totalDeliveries: intOf(j['totalDeliveries']),
        upiId: strOrNull(j['upiId']),
        bankAccount: BankAccount.fromJson(j['bankAccount']),
        currentLat: numOrNull(j['currentLat']),
        currentLng: numOrNull(j['currentLng']),
        licenseNumber: strOrNull(j['licenseNumber']),
        documents: {
          for (final d in jsonList(j['documents']))
            if (strOrNull(d['kind']) != null && strOrNull(d['url']) != null) d['kind'].toString(): d['url'].toString(),
        },
        rejectionReason: strOrNull(j['rejectionReason']),
      );
}

/// The rider's profile and duty state, refreshed every 30 s.
final profileProvider = AsyncNotifierProvider<ProfileController, RiderProfile>(ProfileController.new);

/// Whether the rider is on duty (false while the profile loads).
final isOnlineProvider = Provider<bool>((ref) => ref.watch(profileProvider.select((p) => p.value?.isOnline ?? false)));

class ProfileController extends AsyncNotifier<RiderProfile> {
  @override
  Future<RiderProfile> build() {
    pollEvery(ref, const Duration(seconds: 30));
    return ref.watch(dutyRepositoryProvider).profile();
  }

  /// Check-in at [fix] (attendance starts for the day). The caller gets the
  /// fix from the location tracker, which itself follows this provider.
  Future<void> goOnline(Fix fix) async {
    final repo = ref.read(dutyRepositoryProvider);
    await repo.goOnline(fix);
    await _reload(repo);
  }

  Future<void> goOffline() async {
    final repo = ref.read(dutyRepositoryProvider);
    await repo.goOffline();
    await _reload(repo);
  }

  Future<void> _reload(DutyRepository repo) async {
    final fresh = await repo.profile();
    if (ref.mounted) state = AsyncData(fresh);
  }
}

/// Today's earnings for the duty card (IST day), refreshed every minute.
final todayEarningsProvider = FutureProvider<double>((ref) async {
  pollEvery(ref, const Duration(minutes: 1));
  final today = istToday();
  final j = await ref.watch(dutyRepositoryProvider).earningsSummary(from: today, to: today);
  return numOf(j['today']);
});
