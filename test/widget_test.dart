import 'dart:convert';

import 'package:climate_mobile/api/api_client.dart';
import 'package:climate_mobile/api/climate_api.dart';
import 'package:climate_mobile/screens/sign_in_screen.dart';
import 'package:climate_mobile/api/models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fixtures.dart';

/// A fake server for the sign-in page. [signInCode] is what GET /api/version/ says.
ClimateApi fakeServer({required bool signInCode}) {
  return ClimateApi(
    ApiClient(
      'http://test/api',
      client: MockClient((request) async {
        final json = {'content-type': 'application/json'};
        if (request.url.path == '/api/version/') {
          return http.Response(
            jsonEncode({'product': 'Climate Dashboard', 'release': 'dev', 'api': '1.0', 'sign_in_code': signInCode}),
            200,
            headers: json,
          );
        }
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        final refused = http.Response(jsonEncode({'detail': 'Invalid credentials.'}), 401, headers: json);
        if (request.url.path == '/api/users/token/') {
          // The national sign-in: the superadmin only, and never a station code
          expect(body.containsKey('station_code'), isFalse);
          if (body['email'] != 'superadmin@example.org') return refused;
          if (signInCode && body['otp'] == null) return http.Response(jsonEncode({'otp_required': true}), 200, headers: json);
          return http.Response(jsonEncode({'access': 'a', 'refresh': 'r', 'user': superadminJson}), 200, headers: json);
        }
        if (body['station_code'] != 'HRE-001') return refused;
        if (signInCode && body['otp'] == null) return http.Response(jsonEncode({'otp_required': true}), 200, headers: json);
        return http.Response(jsonEncode({'access': 'a', 'refresh': 'r', 'user': userJson}), 200, headers: json);
      }),
    ),
  );
}

/// Taps a button, scrolled into view first: the form is taller than the test screen.
Future<void> press(WidgetTester tester, String label) async {
  await tester.ensureVisible(find.text(label));
  await tester.tap(find.text(label));
}

Future<void> fillAccount(WidgetTester tester, String station) async {
  await tester.enterText(find.widgetWithText(TextFormField, 'Station code'), station);
  await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'harare.station@example.org');
  await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'station');
}

void main() {
  testWidgets('a development server signs in with the password alone', (tester) async {
    User? signedIn;
    await tester.pumpWidget(
      MaterialApp(
        home: SignInScreen(api: fakeServer(signInCode: false), onSignedIn: (u) => signedIn = u),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sign in'), findsOneWidget);
    expect(find.textContaining('no one-time code is asked'), findsOneWidget);
    await fillAccount(tester, 'HRE-001');
    await press(tester, 'Sign in');
    await tester.pumpAndSettle();
    expect(signedIn?.station?.code, 'HRE-001');
  });

  testWidgets('staging and production ask for the emailed code', (tester) async {
    User? signedIn;
    await tester.pumpWidget(
      MaterialApp(
        home: SignInScreen(api: fakeServer(signInCode: true), onSignedIn: (u) => signedIn = u),
      ),
    );
    await tester.pumpAndSettle();

    await fillAccount(tester, 'HRE-001');
    await press(tester, 'Send me a code');
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField, 'One-time code'), findsOneWidget);
    expect(signedIn, isNull);

    await press(tester, 'Sign in');
    await tester.pumpAndSettle();
    expect(find.text('Enter the 6 digits from the email.'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'One-time code'), '123456');
    await press(tester, 'Sign in');
    await tester.pumpAndSettle();
    expect(signedIn?.email, 'harare.station@example.org');
  });

  testWidgets('another station code is refused with an explanation', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SignInScreen(api: fakeServer(signInCode: false), onSignedIn: (_) {}),
      ),
    );
    await tester.pumpAndSettle();

    await fillAccount(tester, 'BYO-001');
    await press(tester, 'Sign in');
    await tester.pumpAndSettle();
    expect(find.textContaining('only with the code of its own station'), findsOneWidget);
    expect(find.textContaining('a national administrator chooses National above'), findsOneWidget);
  });

  testWidgets('a national administrator signs in without a station code, with the emailed code', (tester) async {
    User? signedIn;
    await tester.pumpWidget(
      MaterialApp(
        home: SignInScreen(api: fakeServer(signInCode: true), onSignedIn: (u) => signedIn = u),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Sign in to your station'), findsOneWidget);

    await tester.tap(find.text('National'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in to the national dashboard'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Station code'), findsNothing);

    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'superadmin@example.org');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'admin');
    await press(tester, 'Send me a code');
    await tester.pumpAndSettle();
    expect(find.text('National'), findsNothing, reason: 'the choice is fixed on the code step');
    await tester.enterText(find.widgetWithText(TextFormField, 'One-time code'), '123456');
    await press(tester, 'Sign in');
    await tester.pumpAndSettle();
    expect(signedIn?.isSuperuser, isTrue);
    expect(signedIn?.station, isNull);
    expect(signedIn?.level, 1);
  });

  testWidgets('a station account at National is told to choose Station', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SignInScreen(api: fakeServer(signInCode: false), onSignedIn: (_) {}),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('National'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'harare.station@example.org');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'station');
    await press(tester, 'Sign in');
    await tester.pumpAndSettle();
    expect(find.textContaining('A station account chooses Station above'), findsOneWidget);

    // Back up to the choice: the page scrolled down to the button, and the ZCHPC credit makes it taller
    await tester.ensureVisible(find.text('Station'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Station'));
    await tester.pumpAndSettle();
    expect(find.textContaining('chooses Station above'), findsNothing, reason: 'the message goes with the choice');
    expect(find.widgetWithText(TextFormField, 'Station code'), findsOneWidget);
  });

  testWidgets('Android Back on the code step returns to the account step', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SignInScreen(api: fakeServer(signInCode: true), onSignedIn: (_) {}),
      ),
    );
    await tester.pumpAndSettle();

    await fillAccount(tester, 'HRE-001');
    await press(tester, 'Send me a code');
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField, 'One-time code'), findsOneWidget);

    expect(await tester.binding.handlePopRoute(), isTrue);
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField, 'Station code'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'One-time code'), findsNothing);
  });
}
