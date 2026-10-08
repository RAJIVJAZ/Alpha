import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

void main() {
  testWidgets('a new email is saved only after its code is confirmed', (tester) async {
    final api = FakeApi()
      ..on('GET /users/me', {'id': 'u-1', 'name': 'Aarav Sharma', 'phone': '+919845000001', 'email': 'a@example.com'})
      ..on('PATCH /users/me', {
        'id': 'u-1',
        'name': 'Aarav Sharma',
        'email': 'a@example.com',
        'emailVerification': {'pendingEmail': 'new@example.com', 'expiresInSeconds': 900, 'devCode': '123456'},
      })
      ..on('POST /users/me/email/verify', {'id': 'u-1', 'name': 'Aarav Sharma', 'email': 'new@example.com'});
    await pumpApp(tester, api, location: '/account/profile', signedIn: true);

    await tester.enterText(find.widgetWithText(TextFormField, 'a@example.com'), 'new@example.com');
    await tester.tap(find.text('Save'));
    // the code field autofocuses, so its blinking cursor never lets pumpAndSettle settle
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Code sent to new@example.com'), findsOneWidget);
    expect(find.text('Development code: 123456'), findsOneWidget);
    expect(api.callsTo('POST /users/me/email/verify'), isEmpty);

    await tester.enterText(find.widgetWithText(TextField, 'Code sent to new@example.com'), '123456');
    await tester.tap(find.text('Confirm'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(api.lastBody('POST /users/me/email/verify'), {'code': '123456'});
    expect(find.text('Email confirmed'), findsOneWidget);
    await unmount(tester);
  });
}
