import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:foodgrid_core/foodgrid_core.dart';
import 'package:rider_mobile/src/common/device.dart';

import 'helpers.dart';

const _kyc = 'https://cdn.test/kyc/u-rider/2026-10-11';

/// A signed-in account without the RIDER role, so the router opens the application.
Future<TestRig> applicantRig({String? phone = '+919740010199', Object? Function()? profile}) async {
  final rig = TestRig();
  await rig.tokens.write(Tokens(riderToken(roles: ['CUSTOMER'], phone: phone), 'refresh-1'));
  rig.api
    ..on('GET', '/auth/me', (_) => meJson(roles: ['CUSTOMER']))
    ..on('GET', '/riders/me', (_) => profile?.call() ?? (throw const ApiError(404, 'NOT_FOUND', 'Rider profile not found')));
  var shots = 0;
  rig.extra.add(photoTakerProvider.overrideWithValue(
    () async => PickedPhoto(bytes: Uint8List.fromList([1, 2, 3]), fileName: 'doc${++shots}.jpg', contentType: 'image/jpeg'),
  ));
  return rig;
}

Map<String, dynamic> applicationJson({required String status, String? reason}) => {
      ...profileJson(status: status),
      'vehicleNumber': 'KA03MR4364',
      'licenseNumber': 'KA0320190012345',
      'rejectionReason': reason,
      'documents': [
        {'kind': 'ID_PROOF', 'url': '$_kyc/0b8e3a52-1f7c-4c1e-9d55-3f0f7d2c9a10.jpg'},
        {'kind': 'DRIVING_LICENSE', 'url': '$_kyc/1c9f4b63-2a8d-4d2f-8e66-4a1a8e3dab21.jpg'},
      ],
    };

Future<void> field(WidgetTester tester, String label, String text) => tester.enterText(find.widgetWithText(TextFormField, label), text);

void main() {
  testWidgets('a new applicant uploads both documents, applies and sees the review status', (tester) async {
    Map<String, dynamic>? applied;
    final rig = await applicantRig(profile: () => applied == null ? null : applicationJson(status: 'PENDING_APPROVAL'));
    var presigned = 0;
    rig.api
      ..on('POST', '/media/presign', (c) {
        expect((c.body! as Map)['folder'], 'kyc');
        presigned++;
        return {
          'uploadUrl': 'https://media.test/upload/$presigned',
          'headers': {'content-type': 'image/jpeg'},
          'publicUrl': '$_kyc/00000000-0000-4000-8000-00000000000$presigned.jpg',
          'maxBytes': 10485760,
        };
      })
      ..on('PUT', 'https://media.test/upload/1', (_) => null)
      ..on('PUT', 'https://media.test/upload/2', (_) => null)
      ..on('POST', '/riders/onboarding', (c) {
        applied = Map<String, dynamic>.from(c.body! as Map);
        return applicationJson(status: 'PENDING_APPROVAL');
      });

    await rig.pumpApp(tester);
    expect(find.text('Deliver with FoodGrid'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Ishaan Bhat'), findsOneWidget, reason: 'the name comes from the account');

    // nothing is sent until the form and both documents are there
    await tester.tap(find.text('Submit application'));
    await settle(tester);
    expect(find.text('Required'), findsWidgets);
    expect(rig.api.called('POST', '/riders/onboarding'), isEmpty);

    await field(tester, 'City you will deliver in', 'Bengaluru');
    await field(tester, 'Vehicle number', 'ka-03 mr 4364');
    await field(tester, 'Driving licence number', 'KA0320190012345');
    await tester.tap(find.text('Submit application'));
    await settle(tester);
    expect(find.text('Add a photo: ID proof (Aadhaar, PAN or voter ID).'), findsOneWidget);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Take photo').first);
    await settle(tester);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Take photo'));
    await settle(tester);
    expect(find.text('Photo ready'), findsNWidgets(2));

    await tester.tap(find.text('Submit application'));
    await settle(tester);

    expect(rig.api.calls.where((c) => c.method == 'PUT'), hasLength(2));
    expect(rig.api.calls.firstWhere((c) => c.method == 'PUT').headers['authorization'], isNull, reason: 'object storage never sees the bearer token');
    expect(applied, {
      'name': 'Ishaan Bhat',
      'city': 'Bengaluru',
      'vehicleType': 'SCOOTER',
      'vehicleNumber': 'KA03MR4364',
      'licenseNumber': 'KA0320190012345',
      'documents': [
        {'kind': 'ID_PROOF', 'url': '$_kyc/00000000-0000-4000-8000-000000000001.jpg'},
        {'kind': 'DRIVING_LICENSE', 'url': '$_kyc/00000000-0000-4000-8000-000000000002.jpg'},
      ],
    });
    expect(find.textContaining('under review'), findsOneWidget);
    expect(find.text('Submit application'), findsNothing);
  });

  testWidgets('a rejected applicant sees why and resubmits with the documents sent earlier', (tester) async {
    var reapplied = false;
    final rig = await applicantRig(
      profile: () => applicationJson(status: reapplied ? 'PENDING_APPROVAL' : 'REJECTED', reason: reapplied ? null : 'Licence photo is blurred'),
    );
    rig.api.on('POST', '/riders/onboarding', (_) {
      reapplied = true;
      return applicationJson(status: 'PENDING_APPROVAL');
    });

    await rig.pumpApp(tester);
    expect(find.textContaining('Licence photo is blurred'), findsOneWidget);
    expect(find.text('Sent earlier'), findsNWidgets(2));

    await tester.tap(find.text('Submit again'));
    await settle(tester);

    final body = rig.api.called('POST', '/riders/onboarding').single.body! as Map;
    expect(body['city'], 'Bengaluru');
    expect(body['vehicleNumber'], 'KA03MR4364');
    expect(body['documents'], applicationJson(status: 'REJECTED')['documents']);
    expect(rig.api.called('POST', '/media/presign'), isEmpty);
    expect(find.textContaining('under review'), findsOneWidget);
  });

  testWidgets('a bicycle needs no vehicle number, licence or licence photo', (tester) async {
    final rig = await applicantRig();
    rig.api.on('POST', '/riders/onboarding', (_) => applicationJson(status: 'PENDING_APPROVAL'));
    await rig.pumpApp(tester);

    await tester.tap(find.text('Scooter'));
    await settle(tester);
    await tester.tap(find.text('Bicycle').last);
    await settle(tester);

    expect(find.widgetWithText(TextFormField, 'Vehicle number'), findsNothing);
    expect(find.text('Driving licence'), findsNothing);
    expect(find.widgetWithText(OutlinedButton, 'Take photo'), findsOneWidget);
  });

  testWidgets('an approved applicant renews the session and lands on Duty', (tester) async {
    final rig = await applicantRig(profile: () => profileJson());
    dutyRoutes(rig.api);
    rig.api
      ..on('POST', '/auth/refresh', (_) => {
            'tokens': {'accessToken': riderToken(), 'refreshToken': 'refresh-2'},
          })
      ..on('GET', '/auth/me', (_) => meJson());

    await rig.pumpApp(tester);
    expect(find.text('You are approved as a FoodGrid delivery partner.'), findsOneWidget);

    await tester.tap(find.text('Start delivering'));
    await settle(tester);

    expect(rig.api.called('POST', '/auth/refresh').single.body, {'refreshToken': 'refresh-1'});
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('Hi, Ishaan'), findsOneWidget);
  });

  testWidgets('an account without a phone number is told to sign in with one', (tester) async {
    final rig = await applicantRig(phone: null);
    await rig.pumpApp(tester);

    expect(find.textContaining('sign in with your mobile number to apply'), findsOneWidget);
    expect(find.text('Submit application'), findsNothing);
  });
}
