import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:rider_mobile/src/common/errors.dart';
import 'package:rider_mobile/src/duty/duty_repository.dart';
import 'package:rider_mobile/src/duty/models.dart';
import 'package:rider_mobile/src/earnings/earnings_providers.dart';
import 'package:rider_mobile/src/earnings/models.dart';
import 'package:rider_mobile/src/performance/models.dart';
import 'package:rider_mobile/src/profile/profile.dart';
import 'package:rider_mobile/src/router.dart';

import 'helpers.dart';

void main() {
  test('deliveries read decimal strings and know which leg they are on', () {
    final d = Delivery.fromJson(deliveryJson(status: 'AT_PICKUP', cod: true));
    expect(d.riderEarning, 37.6);
    expect(d.tipAmount, 20);
    expect(d.totalEarning, closeTo(57.6, 1e-9));
    expect(d.codAmount, 583);
    expect(d.toPickup, isTrue);
    expect(Delivery.fromJson(deliveryJson(status: 'PICKED_UP')).toPickup, isFalse);
  });

  test('offers flatten the nested delivery and count down to zero', () {
    final o = Offer.fromJson(offerJson(expiresIn: const Duration(seconds: 20)));
    expect(o.estimatedEarning, 45);
    expect(o.pickupName, 'Spice Garden - Koramangala');
    expect(o.distanceKm, 3.4);
    expect(o.timeLeft().inSeconds, inInclusiveRange(18, 20));
    expect(o.timeLeft(DateTime.now().add(const Duration(minutes: 1))), Duration.zero);
  });

  test('the rider profile exposes duty state and payout details', () {
    final p = RiderProfile.fromJson(profileJson(online: true));
    expect(p.firstName, 'Ishaan');
    expect(p.isOnline, isTrue);
    expect(p.bankAccount?.last4, '5567');
    expect(p.upiId, 'ishaan1@okaxis');
  });

  test('location pings carry lat/lng and only the optional fields the fix has', () {
    expect(DutyRepository.fixBody((lat: 12.9, lng: 77.6, accuracyM: 7.6, speedKmph: null, heading: null)), {'lat': 12.9, 'lng': 77.6, 'accuracyM': 8.0});
    expect(DutyRepository.fixBody((lat: 12.9, lng: 77.6, accuracyM: null, speedKmph: 21.4, heading: 359.7)), {'lat': 12.9, 'lng': 77.6, 'speedKmph': 21.0, 'heading': 360.0});
  });

  test('earnings presets are IST calendar ranges', () {
    // 01:30 IST on 7 Oct is still 6 Oct in UTC
    final now = DateTime.utc(2026, 10, 6, 20, 0);
    expect(EarningsPreset.today.range(now: now), (from: '2026-10-07', to: '2026-10-07'));
    expect(EarningsPreset.week.range(now: now), (from: '2026-10-01', to: '2026-10-07'));
    expect(EarningsPreset.month.range(now: now), (from: '2026-09-08', to: '2026-10-07'));
    expect(EarningsPreset.thisMonth.range(now: now), (from: '2026-10-01', to: '2026-10-07'));
  });

  test('daily earnings are filled with zero days across the range', () {
    final e = Earnings.fromJson({
      'total': 100,
      'deliveries': 2,
      'averagePerDelivery': 50,
      'today': 0,
      'byType': {'TIP': 10, 'BASE_PAY': 90},
      'daily': [
        {'date': '2026-10-02', 'amount': 100, 'deliveries': 2},
      ],
    });
    final days = e.filledDays('2026-09-30', '2026-10-03');
    expect(days.map((d) => d.date), ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(days.map((d) => d.amount), [0, 0, 100, 0]);
    expect(e.breakdown.first.key, 'BASE_PAY');
  });

  test('a negative wallet balance is cash due', () {
    final w = WalletView.fromJson({
      'wallet': {'balance': '-1390.8', 'status': 'ACTIVE'},
      'transactions': [],
      'meta': {'page': 2, 'totalPages': 64},
    });
    expect(w.cashDue, isTrue);
    expect(w.balance, -1390.8);
    expect((w.page, w.totalPages), (2, 64));
  });

  test('payouts in REQUESTED or PROCESSING block another cash-out', () {
    Payout p(String s) => Payout.fromJson({'id': 'p', 'amount': '100', 'status': s, 'method': 'BANK_TRANSFER', 'destination': {'last4': '5567'}});
    expect(p('REQUESTED').inFlight, isTrue);
    expect(p('PROCESSING').inFlight, isTrue);
    expect(p('PAID').inFlight, isFalse);
    expect(p('PAID').destinationLabel, 'A/c ••5567');
  });

  test('incentives end on the day before their exclusive midnight end', () {
    Incentive i(String endsAt, {String type = 'ORDER_COUNT', double? minRating, String status = 'IN_PROGRESS'}) => Incentive.fromJson({
          'id': 'i',
          'name': 'n',
          'type': type,
          'target': 10,
          'progress': 4,
          'rewardAmount': '100',
          'status': status,
          'minRating': minRating,
          'endsAt': endsAt,
        });
    expect(i('2026-10-11T18:30:00.000Z').lastDayLabel, 'Sun, 11 Oct');
    expect(i('2026-10-11T18:30:00.001Z').lastDayLabel, 'Mon, 12 Oct');
    expect(i('2026-10-11T18:30:00.000Z').fraction, 0.4);
    expect(i('x', type: 'RATING', minRating: 4.7).pausedFor(4.6), isTrue);
    expect(i('x', type: 'RATING', minRating: 4.7).pausedFor(4.7), isFalse);
    expect(i('x', type: 'RATING', minRating: 4.7, status: 'ACHIEVED').pausedFor(4.2), isFalse);
    expect(i('x', minRating: 4.7).pausedFor(4.2), isFalse);
  });

  test('delivery errors get rider-facing wording', () {
    expect(riderMessage(const ApiException(409, 'TOO_FAR_FROM_DROP', 'You seem to be away from the drop location')), contains('too far from the drop location'));
    expect(riderMessage(const ApiException(409, 'ON_DELIVERY', 'Finish your current delivery before going offline')), 'Finish your current delivery before going offline');
  });

  group('session redirect', () {
    Session session(List<String> roles) =>
        Session(Claims.fromToken(riderToken(roles: roles))!, SessionUser(id: 'u', roles: roles));

    test('loading goes to splash, then login or duty', () {
      expect(sessionRedirect(const AsyncLoading(), '/duty'), '/splash');
      expect(sessionRedirect(const AsyncData(null), '/duty'), '/login');
      expect(sessionRedirect(const AsyncData(null), '/login'), isNull);
      expect(sessionRedirect(AsyncData(session(['RIDER'])), '/login'), '/duty');
      expect(sessionRedirect(AsyncData(session(['RIDER'])), '/earnings'), isNull);
    });

    test('a restored session without the rider role is not let in', () {
      expect(sessionRedirect(AsyncData(session(['CUSTOMER'])), '/duty'), '/login');
    });
  });
}
