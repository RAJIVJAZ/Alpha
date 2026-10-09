import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

FakeApi homeApi() {
  final api = FakeApi()
    ..on('GET /cms/banners', [
      {'id': 'b-1', 'title': 'Flat ₹50 off your first order', 'subtitle': 'Use code WELCOME50', 'imageUrl': null, 'linkUrl': 'foodgrid://offers/WELCOME50', 'placement': 'HOME_HERO'},
    ])
    ..on('GET /recommendations/home', {
      'recommended': [outletJson()],
      // the same single outlet again: this rail must be skipped
      'topRated': [outletJson()],
      'fastDelivery': [],
      'reorder': [],
    })
    ..on('GET /outlets/nearby', {
      'data': [
        outletJson(),
        // switched on, but outside its hours
        outletJson(id: 'o-2', slug: 'momo-wagon', name: 'Momo Wagon - Koramangala', open: false),
        outletJson(id: 'o-3', slug: 'dosa-corner', name: 'Dosa Corner - Jayanagar', sponsored: true, campaign: 'camp-9'),
      ],
      'meta': {'page': 1, 'pageSize': 12, 'total': 3, 'totalPages': 1},
    });
  return api;
}

void main() {
  testWidgets('home renders banners, rails and nearby outlets from the API', (tester) async {
    final api = homeApi();
    await pumpApp(tester, api);

    expect(find.text('Flat ₹50 off your first order'), findsOneWidget);
    expect(find.text('Popular near you'), findsOneWidget);
    // "Top rated" repeats the recommended list exactly, so it is skipped
    expect(find.text('Top rated'), findsNothing);
    expect(find.text('Restaurants and food carts near you'), findsOneWidget);
    expect(find.text('3 places deliver to Koramangala'), findsOneWidget);

    expect(find.text('Momo Wagon - Koramangala'), findsOneWidget);
    expect(find.text('Dosa Corner - Jayanagar'), findsOneWidget);
    // closed places (isOpenNow false) are dimmed and labelled; sponsored ones carry "Ad"
    expect(find.text('Closed now'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^Momo Wagon - Koramangala, Closed now')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^Spice Garden - Koramangala, rated')), findsWidgets);
    expect(find.text('Ad'), findsOneWidget);

    final q = api.callsTo('GET /outlets/nearby').single.queryParameters;
    expect(q['lat'], 12.9352);
    expect(q['lng'], 77.6245);
    expect(q['sort'], 'relevance');
    expect(q['page'], 1);
    expect(q['pageSize'], 12);
    expect(q.containsKey('veg'), isFalse);
  });

  testWidgets('filters refetch nearby outlets with the right query', (tester) async {
    final api = homeApi();
    await pumpApp(tester, api);

    await tester.tapAndSettle(find.widgetWithText(FilterChip, 'Pure veg'));
    await tester.tapAndSettle(find.widgetWithText(FilterChip, 'Open now'));

    final q = api.callsTo('GET /outlets/nearby').last.queryParameters;
    expect(q['veg'], true);
    expect(q['openNow'], true);
  });

  testWidgets('tapping a sponsored card reports the ad click and opens the outlet', (tester) async {
    final api = homeApi()..on('POST /ads/events/click', {'charged': false});
    await pumpApp(tester, api);

    await tester.tapAndSettle(find.byKey(const Key('outlet-dosa-corner')));

    expect(api.lastBody('POST /ads/events/click'), {'campaignId': 'camp-9', 'clickToken': 'tok-camp-9'});
    expect(api.log, contains('GET /outlets/dosa-corner/menu'));
  });

  testWidgets('choosing a popular area moves the feed there and remembers it', (tester) async {
    final api = homeApi();
    final h = await pumpApp(tester, api);

    await tester.tapAndSettle(find.bySemanticsLabel(RegExp('Delivering to Koramangala')));
    await tester.tapAndSettle(find.widgetWithText(ChoiceChip, 'Indiranagar'));

    final q = api.callsTo('GET /outlets/nearby').last.queryParameters;
    expect(q['lat'], 12.9784);
    expect(q['lng'], 77.6408);
    expect(h.store.values['fg.place'], contains('Indiranagar'));
  });
}
