import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:rider_mobile/src/earnings/earnings_screen.dart';

import 'helpers.dart';

Map<String, dynamic> earningsJson({double total = 4887, int deliveries = 82, double today = 250}) => {
      'from': '2026-09-29T18:30:00.000Z',
      'to': '2026-10-07T18:29:59.999Z',
      'total': total,
      'deliveries': deliveries,
      'averagePerDelivery': 59.6,
      'today': today,
      'byType': {'BASE_PAY': 2050, 'DISTANCE_PAY': 2537, 'TIP': 300},
      'daily': [
        {'date': istToday(offsetDays: -1), 'amount': 893.2, 'deliveries': 14},
        {'date': istToday(), 'amount': 250, 'deliveries': 4},
      ],
      'recent': [],
    };

Map<String, dynamic> walletJson(String balance, {int page = 1, int totalPages = 3}) => {
      'wallet': {'id': 'w1', 'ownerType': 'RIDER', 'balance': balance, 'currency': 'INR', 'status': 'ACTIVE'},
      'transactions': [
        {
          'id': 't1',
          'type': 'DEBIT',
          'reason': 'COD_COLLECTION',
          'amount': '583',
          'balanceAfter': balance,
          'description': 'Cash collected for ORD-261006-00235',
          'createdAt': '2026-10-06T17:51:02.000Z',
        },
        {
          'id': 't2',
          'type': 'CREDIT',
          'reason': 'TIP',
          'amount': '20',
          'balanceAfter': '-807.8',
          'description': null,
          'createdAt': '2026-10-06T17:51:01.000Z',
        },
      ],
      'meta': {'page': page, 'pageSize': 15, 'total': 40, 'totalPages': totalPages},
    };

void earningsRoutes(FakeApi api, {required String balance, List<Object?> payouts = const []}) {
  api
    ..on('GET', '/riders/me', (_) => profileJson())
    ..on('GET', '/riders/me/earnings', (c) => c.query['from'] == c.query['to'] ? earningsJson(total: 250, deliveries: 4) : earningsJson())
    ..on('GET', '/wallets/me', (c) => walletJson(balance, page: c.query['page'] as int))
    ..on('GET', '/wallets/me/payouts', (_) => payouts);
}

FilledButton cashOutButton(WidgetTester tester) =>
    tester.widget<FilledButton>(find.ancestor(of: find.text('Cash out'), matching: find.byWidgetPredicate((w) => w is FilledButton)));

void main() {
  testWidgets('earnings show the period totals and a cash-due notice for a negative wallet', (tester) async {
    final rig = TestRig();
    earningsRoutes(rig.api, balance: '-1390.8');

    await rig.pump(tester, const EarningsScreen());

    // 7-day preset by default, as IST dates
    final first = rig.api.called('GET', '/riders/me/earnings').first;
    expect(first.query, {'from': istToday(offsetDays: -6), 'to': istToday()});

    expect(find.text('Earned'), findsOneWidget);
    expect(find.text('₹4,887'), findsOneWidget);
    expect(find.text('82'), findsOneWidget);
    expect(find.text('₹59.60'), findsOneWidget);
    expect(find.text('₹250'), findsOneWidget);

    // wallet: negative balance means COD cash to hand in
    expect(find.text('−₹1,390.80'), findsOneWidget); // U+2212 minus
    expect(find.text('Cash due'), findsOneWidget);
    expect(find.textContaining('You hold ₹1,390.80 of COD cash beyond your earnings'), findsOneWidget);
    expect(cashOutButton(tester).onPressed, isNull);

    // where it came from, largest first
    final types = ['Distance pay', 'Base pay', 'Tip'].map((t) => tester.getTopLeft(find.text(t).first).dy).toList();
    expect(types, orderedEquals([...types]..sort()));

    // statement and pager
    expect(find.text('Cash collected for ORD-261006-00235'), findsOneWidget);
    expect(find.text('Tip'), findsWidgets);
    expect(find.text('1 / 3'), findsOneWidget);
    await tester.ensureVisible(find.text('Older'));
    await tester.pump();
    await tester.tap(find.text('Older'));
    await settle(tester);
    expect(rig.api.called('GET', '/wallets/me').map((c) => c.query['page']), containsAllInOrder([1, 2]));
    expect(rig.api.called('GET', '/wallets/me').last.query, {'as': 'RIDER', 'page': 2, 'pageSize': 15});
  });

  testWidgets('switching to Today asks for a single IST day', (tester) async {
    final rig = TestRig();
    earningsRoutes(rig.api, balance: '520');

    await rig.pump(tester, const EarningsScreen());
    await tester.tap(find.widgetWithText(ChoiceChip, 'Today'));
    await settle(tester);

    expect(rig.api.called('GET', '/riders/me/earnings').last.query, {'from': istToday(), 'to': istToday()});
    expect(find.text('Cash due'), findsNothing);
    expect(cashOutButton(tester).onPressed, isNotNull);
  });

  testWidgets('cash-out posts amount, method and UPI destination with an idempotency key', (tester) async {
    final rig = TestRig();
    earningsRoutes(rig.api, balance: '520.5');
    rig.api.on('POST', '/wallets/me/payouts', (_) => {'id': 'p1', 'status': 'REQUESTED'}, status: 201);

    await rig.pump(tester, const EarningsScreen());
    await tester.tap(find.text('Cash out'));
    await settle(tester);

    expect(find.text('ishaan1@okaxis'), findsOneWidget, reason: 'UPI ID prefilled from the profile');
    await tester.enterText(find.widgetWithText(TextField, 'Amount'), '50');
    await tester.pump();
    expect(find.text('The minimum cash-out is ₹100'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Amount'), '500');
    await tester.pump();
    await tester.tap(find.text('Request ₹500.00'));
    await settle(tester);

    final post = rig.api.called('POST', '/wallets/me/payouts').single;
    expect(post.body, {
      'amount': 500.0,
      'method': 'UPI',
      'destination': {'upiId': 'ishaan1@okaxis'},
    });
    expect(post.headers['idempotency-key'], isA<String>());
    expect(find.text('Cash-out requested — usually paid within a working day'), findsOneWidget);
  });

  testWidgets('cash-out is disabled while a payout is in flight', (tester) async {
    final rig = TestRig();
    earningsRoutes(rig.api, balance: '900', payouts: [
      {'id': 'p1', 'amount': '400', 'status': 'PROCESSING', 'method': 'UPI', 'destination': {'upiId': 'ishaan1@okaxis'}, 'requestedAt': '2026-10-06T05:00:00.000Z'},
      {'id': 'p0', 'amount': '89.1', 'status': 'PAID', 'method': 'UPI', 'destination': {'upiId': 'ishaan@okaxis'}, 'utr': 'UTR242119318009', 'requestedAt': '2026-09-28T05:00:00.000Z'},
    ]);

    await rig.pump(tester, const EarningsScreen());

    expect(cashOutButton(tester).onPressed, isNull);
    expect(find.text('A cash-out of ₹400.00 is being processed'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('₹89.10 to ishaan@okaxis'), 300, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(find.text('₹89.10 to ishaan@okaxis'));
    await tester.pump();
    expect(find.text('₹89.10 to ishaan@okaxis'), findsOneWidget);
    expect(find.text('${date('2026-09-28T05:00:00.000Z')} · UTR242119318009'), findsOneWidget);
    expect(find.text('Paid'), findsOneWidget);
  });
}
