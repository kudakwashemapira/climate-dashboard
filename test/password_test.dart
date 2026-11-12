import 'dart:convert';

import 'package:climate_mobile/api/api_client.dart';
import 'package:climate_mobile/api/climate_api.dart';
import 'package:climate_mobile/screens/sign_in_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fixtures.dart';

http.Response reply(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  test('changing the password keeps this sign-in going with the new tokens', () async {
    String? sentWith;
    final api = ClimateApi(
      ApiClient(
        'http://test/api',
        client: MockClient((request) async {
          expect(request.url.path, '/api/users/me/password/');
          sentWith = request.headers['Authorization'];
          expect(jsonDecode(request.body), {'current_password': 'old-password-1', 'new_password': 'Rainfall-gauge-2027'});
          return reply({'detail': 'Password changed. Your other sign-ins have ended.', 'access': 'a2', 'refresh': 'r2', 'user': userJson});
        }),
      ),
    );
    api.client.tokens = Tokens('a1', 'r1');

    final message = await api.changePassword(current: 'old-password-1', next: 'Rainfall-gauge-2027');
    expect(sentWith, 'Bearer a1');
    expect(message, contains('other sign-ins have ended'));
    expect(api.client.tokens!.access, 'a2');
    expect(api.client.tokens!.refresh, 'r2');
  });

  test('the reset steps call the API without a token', () async {
    final seen = <String>[];
    final api = ClimateApi(
      ApiClient(
        'http://test/api',
        client: MockClient((request) async {
          seen.add('${request.url.path} ${request.headers['Authorization'] ?? '-'}');
          return reply({'detail': 'ok'});
        }),
      ),
    );
    api.client.tokens = Tokens('a1', 'r1');
    await api.requestPasswordReset(' a@example.org ');
    await api.confirmPasswordReset(email: 'a@example.org', code: '123456', newPassword: 'Rainfall-gauge-2027');
    expect(seen, ['/api/users/password-reset/ -', '/api/users/password-reset/confirm/ -']);
  });

  testWidgets('a forgotten password is reset from the sign-in page', (tester) async {
    final bodies = <String, Map<String, dynamic>>{};
    final api = ClimateApi(
      ApiClient(
        'http://test/api',
        client: MockClient((request) async {
          if (request.url.path == '/api/version/') {
            return reply({'product': 'Climate Dashboard', 'release': 'dev', 'api': '1.0', 'sign_in_code': true});
          }
          bodies[request.url.path] = jsonDecode(request.body) as Map<String, dynamic>;
          if (request.url.path == '/api/users/password-reset/') {
            return reply({'detail': 'If the address belongs to an account, a reset code is on its way to it.'});
          }
          final code = bodies[request.url.path]!['code'];
          return code == '123456'
              ? reply({'detail': 'Your password was changed. Sign in with the new password.'})
              : reply({
                  'code': ['The code is wrong or has expired. Ask for a new one.'],
                }, 400);
        }),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: SignInScreen(api: api, onSignedIn: (_) {}),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'harare.station@example.org');

    await tester.ensureVisible(find.text('Forgot your password?')); // below the fold of the test screen
    await tester.tap(find.text('Forgot your password?'));
    await tester.pumpAndSettle();
    expect(find.text('Reset your password'), findsOneWidget);
    await tester.ensureVisible(find.text('Send me a reset code'));
    await tester.tap(find.text('Send me a reset code'));
    await tester.pumpAndSettle();
    expect(bodies['/api/users/password-reset/'], {'email': 'harare.station@example.org'});
    expect(find.textContaining('a reset code is on its way'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Reset code'), '999999');
    await tester.enterText(find.widgetWithText(TextFormField, 'New password'), 'Rainfall-gauge-2027');
    await tester.enterText(find.widgetWithText(TextFormField, 'New password again'), 'Rainfall-gauge-2027');
    await tester.ensureVisible(find.text('Set the new password'));
    await tester.tap(find.text('Set the new password'));
    await tester.pumpAndSettle();
    expect(find.text('The code is wrong or has expired. Ask for a new one.'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Reset code'), '123456');
    await tester.ensureVisible(find.text('Set the new password'));
    await tester.tap(find.text('Set the new password'));
    await tester.pumpAndSettle();
    expect(find.text('Password changed'), findsOneWidget);
    await tester.tap(find.text('Back to sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in to your station'), findsOneWidget);
  });
}
