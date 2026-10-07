import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:rider_mobile/src/duty/duty_screen.dart';

import 'helpers.dart';

void main() {
  testWidgets('an offer card counts down and accepting assigns the order', (tester) async {
    final rig = TestRig();
    var accepted = false;
    dutyRoutes(
      rig.api,
      offers: () => accepted ? [] : [offerJson()],
      current: () => accepted ? [deliveryJson()] : [],
    );
    rig.api.on('POST', '/deliveries/offers/of1/accept', (_) {
      accepted = true;
      return {'id': 'd1', 'status': 'ASSIGNED'};
    });

    await rig.pump(tester, const DutyScreen());

    expect(find.text('You are online'), findsOneWidget);
    expect(find.text('Earn ₹45.00'), findsOneWidget);
    expect(find.text('Spice Garden - Koramangala'), findsOneWidget);
    expect(find.text('1.2 km to pickup'), findsOneWidget);
    expect(find.text('3.4 km trip'), findsOneWidget);
    expect(find.textContaining(RegExp(r'^\d+s$')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'seconds left to accept')), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Accept'));
    await settle(tester);

    expect(rig.api.called('POST', '/deliveries/offers/of1/accept'), hasLength(1));
    expect(find.text('Order ORD-261007-00005 is yours — head to Spice Garden - Koramangala'), findsOneWidget);
    // the offer is gone and the delivery is now active
    expect(find.text('Earn ₹45.00'), findsNothing);
    expect(find.text("I've reached the restaurant"), findsOneWidget);
  });

  testWidgets('rejecting an offer sends the chosen reason', (tester) async {
    final rig = TestRig();
    var rejected = false;
    dutyRoutes(rig.api, offers: () => rejected ? [] : [offerJson()]);
    rig.api.on('POST', '/deliveries/offers/of1/reject', (_) {
      rejected = true;
      return {'ok': true};
    });

    await rig.pump(tester, const DutyScreen());
    await tester.tap(find.widgetWithText(OutlinedButton, 'Reject'));
    await settle(tester);
    await tester.tap(find.text('On a break'));
    await tester.pump();
    await tester.tap(find.text('Reject order'));
    await settle(tester);

    expect(rig.api.called('POST', '/deliveries/offers/of1/reject').single.body, {'reason': 'On a break'});
    expect(find.text('Earn ₹45.00'), findsNothing);
  });

  testWidgets('an active delivery moves through every step, pinging location before geofenced ones', (tester) async {
    final rig = TestRig();
    var status = 'ASSIGNED';
    dutyRoutes(rig.api, current: () => status == 'DELIVERED' ? [] : [deliveryJson(status: status)]);
    String advance(String to) {
      status = to;
      return to;
    }

    rig.api
      ..on('POST', '/deliveries/d1/arrived-pickup', (_) => {'status': advance('AT_PICKUP')})
      ..on('POST', '/deliveries/d1/picked-up', (_) => {'status': advance('PICKED_UP')})
      ..on('POST', '/deliveries/d1/arrived-drop', (_) => {'status': advance('AT_DROP')})
      ..on('POST', '/deliveries/d1/complete', (_) => {'status': advance('DELIVERED')});

    await rig.pump(tester, const DutyScreen());

    expect(find.text('PICK UP FROM'), findsOneWidget);
    expect(find.text('Going to the restaurant · earn ₹37.60 + ₹20 tip'), findsOneWidget);

    await tester.tap(find.text("I've reached the restaurant"));
    await settle(tester);
    expect(find.text('Order picked up'), findsOneWidget);

    await tester.tap(find.text('Order picked up'));
    await settle(tester);
    expect(find.text('DELIVER TO'), findsOneWidget);
    expect(find.text('Neha Singh'), findsOneWidget);

    await tester.tap(find.text("I've reached the customer"));
    await settle(tester);
    expect(find.text('Complete delivery'), findsOneWidget);

    await tester.tap(find.text('Complete delivery'));
    await settle(tester);
    await tester.enterText(find.byKey(const ValueKey('otp-field')), '5375');
    await tester.pump();
    await tester.tap(find.text('Mark delivered'));
    await settle(tester);

    expect(rig.api.postPaths(), [
      '/riders/me/location',
      '/deliveries/d1/arrived-pickup',
      '/deliveries/d1/picked-up', // not geofenced: no ping
      '/riders/me/location',
      '/deliveries/d1/arrived-drop',
      '/riders/me/location',
      '/deliveries/d1/complete',
    ]);
    // each ping carries the fresh fix
    for (final ping in rig.api.called('POST', '/riders/me/location')) {
      expect(ping.body, {'lat': 12.93548, 'lng': 77.61067, 'accuracyM': 8.0, 'speedKmph': 18.0, 'heading': 90.0});
    }
    expect(rig.location.currentCalls, 3);
    expect(find.text('Delivered! ₹57.60 added to your earnings'), findsOneWidget);
    expect(find.text('No orders right now'), findsOneWidget);
  });

  testWidgets('a pre-step ping falls back to the last streamed fix when GPS is slow', (tester) async {
    final location = _SlowLocation();
    final rig = TestRig(location: location);
    var status = 'PICKED_UP';
    dutyRoutes(rig.api, current: () => [deliveryJson(status: status)]);
    rig.api.on('POST', '/deliveries/d1/arrived-drop', (_) {
      status = 'AT_DROP';
      return {'status': status};
    });

    await rig.pump(tester, const DutyScreen());
    location.stream.add((lat: 12.9355, lng: 77.6107, accuracyM: 12.0, speedKmph: null, heading: null));
    await settle(tester); // first streamed fix is shared straight away

    await tester.tap(find.text("I've reached the customer"));
    await tester.pump(const Duration(seconds: 7)); // past the fresh-fix timeout
    await settle(tester);

    final pings = rig.api.called('POST', '/riders/me/location').toList();
    expect(pings, hasLength(2));
    expect(pings.last.body, {'lat': 12.9355, 'lng': 77.6107, 'accuracyM': 12.0});
    expect(rig.api.postPaths().last, '/deliveries/d1/arrived-drop');
  });

  testWidgets('completing a COD order sends the OTP and the cash confirmation', (tester) async {
    final rig = TestRig();
    var done = false;
    dutyRoutes(rig.api, current: () => done ? [] : [deliveryJson(status: 'AT_DROP', cod: true)]);
    rig.api.on('POST', '/deliveries/d1/complete', (_) {
      done = true;
      return {'status': 'DELIVERED'};
    });

    await rig.pump(tester, const DutyScreen());
    expect(find.text('Collect ₹583.00 in cash'), findsOneWidget);

    await tester.tap(find.text('Complete delivery'));
    await settle(tester);

    FilledButton submit() => tester.widget<FilledButton>(find.ancestor(of: find.text('Mark delivered'), matching: find.byWidgetPredicate((w) => w is FilledButton)));
    expect(submit().onPressed, isNull, reason: 'needs proof first');

    await tester.enterText(find.byKey(const ValueKey('otp-field')), '1234');
    await tester.pump();
    expect(submit().onPressed, isNull, reason: 'COD cash must be confirmed');

    await tester.tap(find.text('I collected ₹583.00 in cash'));
    await tester.pump();
    expect(submit().onPressed, isNotNull);

    await tester.tap(find.text('Mark delivered'));
    await settle(tester);

    final complete = rig.api.called('POST', '/deliveries/d1/complete').single;
    expect(complete.body, {'otp': '1234', 'codCollected': true});
    expect(rig.api.postPaths(), ['/riders/me/location', '/deliveries/d1/complete']);
    expect(find.text('Mark delivered'), findsNothing, reason: 'sheet closed');
  });

  testWidgets('completing far from the drop shows a clear TOO_FAR_FROM_DROP message', (tester) async {
    final rig = TestRig();
    dutyRoutes(rig.api, current: () => [deliveryJson(status: 'AT_DROP')]);
    rig.api.on('POST', '/deliveries/d1/complete', (_) => throw const ApiError(409, 'TOO_FAR_FROM_DROP', 'You seem to be away from the drop location'));

    await rig.pump(tester, const DutyScreen());
    await tester.tap(find.text('Complete delivery'));
    await settle(tester);
    await tester.enterText(find.byKey(const ValueKey('otp-field')), '5375');
    await tester.pump();
    await tester.tap(find.text('Mark delivered'));
    await settle(tester);

    expect(rig.api.postPaths(), ['/riders/me/location', '/deliveries/d1/complete']);
    expect(find.textContaining("You're too far from the drop location"), findsOneWidget);
    expect(find.textContaining('within 500 m'), findsOneWidget);
    // the sheet stays open so the rider can move closer and retry
    expect(find.text('Mark delivered'), findsOneWidget);
  });

  testWidgets('a wrong OTP is explained in the sheet', (tester) async {
    final rig = TestRig();
    dutyRoutes(rig.api, current: () => [deliveryJson(status: 'AT_DROP')]);
    rig.api.on('POST', '/deliveries/d1/complete', (_) => throw const ApiError(400, 'OTP_MISMATCH', 'Incorrect delivery OTP'));

    await rig.pump(tester, const DutyScreen());
    await tester.tap(find.text('Complete delivery'));
    await settle(tester);
    await tester.enterText(find.byKey(const ValueKey('otp-field')), '0000');
    await tester.pump();
    await tester.tap(find.text('Mark delivered'));
    await settle(tester);

    expect(find.textContaining("That code doesn't match"), findsOneWidget);
  });

  testWidgets('navigate and call open Maps directions and the dialer', (tester) async {
    final rig = TestRig();
    dutyRoutes(rig.api, current: () => [deliveryJson(status: 'ASSIGNED')]);

    await rig.pump(tester, const DutyScreen());
    await tester.tap(find.bySemanticsLabel('Navigate to restaurant'));
    await tester.tap(find.text('Call restaurant'));
    await settle(tester);

    expect(rig.opened.map((u) => u.toString()), [
      'https://www.google.com/maps/dir/?api=1&destination=12.9372,77.6235&travelmode=two-wheeler',
      'tel:+919900010001',
    ]);
  });

  testWidgets('going online sends the current fix', (tester) async {
    final rig = TestRig();
    var online = false;
    dutyRoutes(rig.api);
    rig.api
      ..on('GET', '/riders/me', (_) => profileJson(online: online))
      ..on('POST', '/riders/me/online', (_) {
        online = true;
        return {'online': true};
      });

    await rig.pump(tester, const DutyScreen());
    expect(find.text('You are offline'), findsOneWidget);
    expect(find.text('Go online to start receiving delivery offers.'), findsOneWidget);

    await tester.tap(find.text('Go online'));
    await settle(tester);

    expect(rig.api.called('POST', '/riders/me/online').single.body, {'lat': 12.93548, 'lng': 77.61067, 'accuracyM': 8.0, 'speedKmph': 18.0, 'heading': 90.0});
    expect(find.text('You are online'), findsOneWidget);
    expect(find.text('Go offline'), findsOneWidget);
    expect(rig.api.called('GET', '/riders/me/offers'), isNotEmpty, reason: 'offers are polled once online');
  });
}

/// GPS that never answers a one-off request, so the last streamed fix is used.
class _SlowLocation extends FakeLocation {
  @override
  Future<Fix> current() {
    currentCalls++;
    return Completer<Fix>().future;
  }
}
