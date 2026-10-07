import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:rider_mobile/src/performance/performance_screen.dart';

import 'helpers.dart';

List<Map<String, dynamic>> incentivesJson() => [
      {
        'id': 'i1',
        'name': 'Weekly 60 deliveries bonus',
        'description': 'Complete 60 deliveries this week to earn ₹600.',
        'type': 'ORDER_COUNT',
        'target': 60,
        'progress': 21,
        'rewardAmount': '600',
        'status': 'IN_PROGRESS',
        'minRating': null,
        'startsAt': '2026-10-04T18:30:00.000Z',
        // midnight IST at the start of Monday 12 Oct: the last day is Sunday
        'endsAt': '2026-10-11T18:30:00.000Z',
        'percent': 35,
      },
      {
        'id': 'i2',
        'name': 'Five-star rider',
        'description': '40 deliveries with rating at or above 4.7.',
        'type': 'RATING',
        'target': 40,
        'progress': 0,
        'rewardAmount': '250',
        'status': 'IN_PROGRESS',
        'minRating': 4.7,
        'startsAt': '2026-10-04T18:30:00.000Z',
        'endsAt': '2026-10-31T18:30:00.000Z',
        'percent': 0,
      },
    ];

void performanceRoutes(FakeApi api, {double rating = 4.6}) {
  final month = istToday().substring(0, 7);
  api
    ..on('GET', '/riders/me', (_) => profileJson(rating: rating))
    ..on('GET', '/riders/me/incentives', (_) => incentivesJson())
    ..on('GET', '/riders/me/attendance', (c) => {
          'month': c.query['month'],
          'presentDays': c.query['month'] == month ? 2 : 0,
          'onlineHours': 26.1,
          'deliveries': 29,
          'days': c.query['month'] != month
              ? []
              : [
                  {'date': '$month-01T00:00:00.000Z', 'status': 'PRESENT', 'onlineMinutes': 721, 'deliveryCount': 15, 'distanceKm': 79.5},
                  {'date': '$month-02T00:00:00.000Z', 'status': 'PRESENT', 'onlineMinutes': 845, 'deliveryCount': 14, 'distanceKm': 58.5},
                ],
        });
}

void main() {
  testWidgets('incentives show progress, reward and the last day that counts', (tester) async {
    final rig = TestRig();
    performanceRoutes(rig.api);

    await rig.pump(tester, const PerformanceScreen());

    expect(find.text('Weekly 60 deliveries bonus'), findsOneWidget);
    expect(find.text('₹600'), findsOneWidget);
    expect(find.text('21 of 60'), findsOneWidget);
    // endsAt is midnight IST on Monday 12 Oct; endsAt − 1 ms is Sunday 11 Oct
    expect(find.text('Ends Sun, 11 Oct'), findsOneWidget);
    expect(find.text('Ends Sat, 31 Oct'), findsOneWidget);
    expect(find.bySemanticsLabel('Weekly 60 deliveries bonus progress'), findsOneWidget);
  });

  testWidgets('a rating incentive explains that progress is paused below the minimum rating', (tester) async {
    final rig = TestRig();
    performanceRoutes(rig.api, rating: 4.6);

    await rig.pump(tester, const PerformanceScreen());

    expect(find.textContaining('Progress is paused: your rating is 4.6'), findsOneWidget);
    expect(find.textContaining('4.7 or higher'), findsOneWidget);
  });

  testWidgets('no pause note once the rating is high enough', (tester) async {
    final rig = TestRig();
    performanceRoutes(rig.api, rating: 4.8);

    await rig.pump(tester, const PerformanceScreen());

    expect(find.textContaining('Progress is paused'), findsNothing);
  });

  testWidgets('attendance calendar summarises the month and marks worked days', (tester) async {
    final rig = TestRig();
    performanceRoutes(rig.api);

    await rig.pump(tester, const PerformanceScreen());

    final month = istToday().substring(0, 7);
    expect(rig.api.called('GET', '/riders/me/attendance').first.query, {'month': month});
    expect(find.text('2 days worked · 26.1 h online · 29 deliveries'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^\w+ 1 \w+: worked, 15 deliveries, 12\.0 hours online$')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^\w+ 3 \w+: off$')), findsOneWidget);

    await tester.tap(find.byTooltip('Previous month'));
    await settle(tester);
    expect(rig.api.called('GET', '/riders/me/attendance').last.query['month'], isNot(month));
    expect(find.textContaining('0 days worked'), findsOneWidget);
  });
}
