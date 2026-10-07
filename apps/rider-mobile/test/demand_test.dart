import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rider_mobile/src/demand/demand_screen.dart';
import 'package:rider_mobile/src/demand/models.dart';

import 'helpers.dart';

/// Two overlapping square zones (rings of [lng, lat], closed) and an outlier.
Map<String, dynamic> heatmapJson() => {
      'generatedAt': DateTime.now().toUtc().toIso8601String(),
      'zones': [
        {
          'id': 'z1',
          'name': 'Bengaluru - Koramangala',
          'surge': 1,
          'polygon': [
            [77.5945, 12.9052],
            [77.6545, 12.9052],
            [77.6545, 12.9652],
            [77.5945, 12.9652],
            [77.5945, 12.9052],
          ],
        },
        {
          'id': 'z2',
          'name': 'Bengaluru - HSR Layout',
          'surge': 1.5,
          'polygon': [
            [77.6200, 12.8800],
            [77.6800, 12.8800],
            [77.6800, 12.9400],
            [77.6200, 12.9400],
            [77.6200, 12.8800],
          ],
        },
      ],
      'cells': [
        // in both zones, nearer HSR's centre (12.91, 77.65)
        {'geohash': 'tdr1v9', 'lat': 12.925, 'lng': 77.645, 'demand': 4, 'riders': 1, 'pressure': 4},
        // only in Koramangala
        {'geohash': 'tdr1y2', 'lat': 12.955, 'lng': 77.600, 'demand': 2, 'riders': 2, 'pressure': 1},
        // no demand: never a "busy spot"
        {'geohash': 'tdr1zz', 'lat': 12.950, 'lng': 77.610, 'demand': 0, 'riders': 3, 'pressure': 0},
        // outside every zone
        {'geohash': 'tdr3aa', 'lat': 13.100, 'lng': 77.700, 'demand': 1, 'riders': 0, 'pressure': 1},
      ],
      'hotspots': [],
    };

void main() {
  group('geometry', () {
    final h = Heatmap.fromJson(heatmapJson());

    test('polygons are read as [lng, lat] rings', () {
      final z = h.zones.first;
      expect(z.polygon.first, (77.5945, 12.9052));
      expect(z.contains(12.93, 77.62), isTrue);
      expect(z.contains(12.93, 77.70), isFalse);
      // swapping the axes would put Bengaluru in the Indian Ocean
      expect(z.contains(77.62, 12.93), isFalse);
    });

    test('centre ignores the closing vertex', () {
      final (lat, lng) = h.zones.first.centre;
      expect(lat, closeTo(12.9352, 1e-9));
      expect(lng, closeTo(77.6245, 1e-9));
    });

    test('a cell is named by the containing zone whose centre is nearest', () {
      expect(h.areaOf(12.925, 77.645), 'HSR Layout');
      expect(h.areaOf(12.955, 77.600), 'Koramangala');
      expect(h.areaOf(13.100, 77.700), 'Outside zones');
    });

    test('zone names lose the city prefix', () {
      expect(shortZoneName('Bengaluru - MG Road'), 'MG Road');
      expect(shortZoneName('Indiranagar'), 'Indiranagar');
    });

    test('busiest spots: demand only, most orders per rider first', () {
      expect(h.busiest().map((c) => c.geohash), ['tdr1v9', 'tdr1y2', 'tdr3aa']);
    });

    test('pressure shades run light to dark on the blue ramp; circles grow with demand', () {
      expect(pressureColor(0, 4), const Color(0xFFCFE1F7));
      expect(pressureColor(4, 4), const Color(0xFF13498E));
      expect(demandRadius(0, 4), 6);
      expect(demandRadius(4, 4), 24);
      expect(demandRadius(1, 4), 15);
    });
  });

  testWidgets('demand screen lists the busiest spots with distance and a navigate button', (tester) async {
    final rig = TestRig();
    rig.api
      ..on('GET', '/riders/heatmap', (_) => heatmapJson())
      ..on('GET', '/riders/me', (_) => profileJson(online: false));

    await rig.pump(tester, const DemandScreen());

    expect(find.text('Busiest spots'), findsOneWidget);
    expect(find.text('HSR Layout'), findsWidgets);
    expect(find.text('Outside zones'), findsOneWidget);
    // distance from the rider's last known position (profile currentLat/Lng)
    expect(find.textContaining(RegExp(r'4 open orders · 1 rider nearby · \d+\.\d km from you')), findsOneWidget);
    expect(find.text('1.5× pay'), findsWidgets);
    expect(find.textContaining('More orders per rider'), findsOneWidget);

    await tester.tap(find.byTooltip('Navigate to HSR Layout'));
    await settle(tester);
    expect(rig.opened.single.toString(), 'https://www.google.com/maps/dir/?api=1&destination=12.925,77.645&travelmode=two-wheeler');
  });
}
