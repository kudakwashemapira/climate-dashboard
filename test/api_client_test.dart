import 'dart:convert';

import 'package:climate_mobile/api/api_client.dart';
import 'package:climate_mobile/api/climate_api.dart';
import 'package:climate_mobile/api/models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fixtures.dart';

http.Response reply(Object? body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

ClimateApi apiWith(Future<http.Response> Function(http.Request request) server) =>
    ClimateApi(ApiClient('http://test/api', client: MockClient(server)));

void main() {
  test('station sign-in asks for the one-time code, then keeps the tokens in memory', () async {
    final sent = <Map<String, dynamic>>[];
    final api = apiWith((request) async {
      expect(request.url.path, '/api/instauth/login/');
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      sent.add(body);
      if (body['otp'] == null) return reply({'otp_required': true});
      return reply({'access': 'a1', 'refresh': 'r1', 'user': userJson});
    });

    expect(await api.signIn(email: ' harare.station@example.org ', password: 'pw', stationCode: 'hre-001'), isNull);
    expect(api.client.signedIn, isFalse);
    expect(sent.first, {'email': 'harare.station@example.org', 'password': 'pw', 'station_code': 'hre-001'});

    final user = await api.signIn(email: 'harare.station@example.org', password: 'pw', stationCode: 'HRE-001', otp: '123456');
    expect(user!.station!.code, 'HRE-001');
    expect(user.level, 2);
    expect(user.canAddReadings, isTrue);
    expect(sent.last['otp'], '123456');
    expect(api.client.tokens!.access, 'a1');
  });

  test('a refused sign-in carries the server message', () async {
    final api = apiWith((_) async => reply({'detail': 'Invalid credentials.'}, 401));
    expect(
      () => api.signIn(email: 'x@example.org', password: 'bad', stationCode: 'BYO-001'),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 401).having((e) => e.message, 'message', 'Invalid credentials.')),
    );
  });

  test('an expired access token is renewed once and the call is repeated', () async {
    final seen = <String>[];
    final api = apiWith((request) async {
      seen.add('${request.method} ${request.url.path} ${request.headers['Authorization'] ?? '-'}');
      if (request.url.path == '/api/users/token/refresh/') {
        expect(jsonDecode(request.body), {'refresh': 'r1'});
        return reply({'access': 'a2'});
      }
      if (request.headers['Authorization'] == 'Bearer a1') return reply({'detail': 'Token is invalid or expired'}, 401);
      return reply({'count': 0, 'next': null, 'previous': null, 'results': []});
    });
    api.client.tokens = Tokens('a1', 'r1');

    final page = await api.events();
    expect(page.count, 0);
    expect(seen, ['GET /api/events/extreme/ Bearer a1', 'POST /api/users/token/refresh/ -', 'GET /api/events/extreme/ Bearer a2']);
  });

  test('a refused refresh ends the session', () async {
    var expired = 0;
    final api = apiWith((request) async => reply({'detail': 'Token is invalid or expired'}, 401));
    api.client
      ..tokens = Tokens('a1', 'r1')
      ..onSessionExpired = () => expired++;

    await expectLater(api.overview(), throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
    expect(api.client.signedIn, isFalse);
    expect(expired, 1);
  });

  test('field messages of a 400 are kept per field', () async {
    final api = apiWith((request) async {
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      expect(body['metric'], 'TEMP_C');
      expect(body['unit'], 'C');
      expect(body['observed_at'], endsWith('Z')); // sent in UTC with its offset
      expect(body.containsKey('sensor'), isFalse);
      return reply({
        'value': ['Value 99 is outside the range -20 to 55 for TEMP_C.'],
        'observed_at': ['The time of the reading is in the future.'],
      }, 400);
    });
    api.client.tokens = Tokens('a1', 'r1');

    try {
      await api.addObservation(
        metric: Metric(code: 'TEMP_C', name: 'Air temperature', unit: 'C'),
        observedAt: DateTime.now(),
        value: '99',
      );
      fail('expected a refusal');
    } on ApiException catch (e) {
      expect(e.status, 400);
      expect(e.fields.keys, containsAll(['value', 'observed_at']));
      expect(e.message, 'Value 99 is outside the range -20 to 55 for TEMP_C.');
    }
  });

  test('other refusals and an unreachable server read as plain sentences', () async {
    expect(ApiClient.refusal(403, null).message, 'Your access level does not allow this.');
    expect(ApiClient.refusal(502, null).message, 'The server had a problem. Try again later.');
    final api = apiWith((_) async => throw http.ClientException('connection refused'));
    await expectLater(api.version(), throwsA(isA<ApiException>().having((e) => e.status, 'status', 0)));
  });

  test('an address that answers with a web page instead of the API says so', () async {
    final api = apiWith((_) async => http.Response('<!DOCTYPE html><html></html>', 200, headers: {'content-type': 'text/html'}));
    await expectLater(api.version(), throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('Check the address'))));
  });

  test('the call log names method, address and status, never a password, code or token', () async {
    final lines = <String>[];
    final api = apiWith((request) async {
      if (request.url.path == '/api/instauth/login/') {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        if (body['otp'] == null) return reply({'otp_required': true});
        return reply({'access': 'access-token-secret', 'refresh': 'refresh-token-secret', 'user': userJson});
      }
      return reply({
        'value': ['Value 99 is outside the range -20 to 55 for TEMP_C.'],
      }, 400);
    });
    api.client.log = lines.add;

    await api.signIn(email: 'harare.station@example.org', password: 'pw-secret', stationCode: 'HRE-001');
    await api.signIn(email: 'harare.station@example.org', password: 'pw-secret', stationCode: 'HRE-001', otp: '654321');
    await expectLater(
      api.addObservation(
        metric: Metric(code: 'TEMP_C', name: 'Air temperature', unit: 'C'),
        observedAt: DateTime.now(),
        value: '99',
      ),
      throwsA(isA<ApiException>()),
    );

    expect(lines, hasLength(3));
    expect(lines.first, matches(RegExp(r'^POST /api/instauth/login/ 200 \(\d+ ms\)$')));
    expect(lines.last, contains('POST /api/weather/observations/ 400'));
    expect(lines.last, contains('outside the range'));
    final text = lines.join(' | ');
    for (final secret in ['pw-secret', '654321', 'access-token-secret', 'refresh-token-secret', 'harare.station@example.org']) {
      expect(text, isNot(contains(secret)), reason: secret);
    }
  });

  test('the overview is read as the server computed it', () {
    final o = Overview.fromJson({
      'period': {'from': '2026-09-14', 'to': '2026-10-13', 'days': 30},
      'stations': {'total': 1, 'active': 1},
      'sensors': {'total': 5, 'in_service': 4},
      'observations': {'total': 4583, 'in_period': 113},
      'active_alerts': 0,
      'data_completeness_pct': 93.3,
      'calibration_compliance_pct': null,
      'calibration_status': {'Current': 4, 'Due': 0, 'Overdue': 0, 'Unknown': 0},
      'observations_by_day': [
        {'date': '2026-09-14', 'count': 4},
      ],
      'last_upload': null,
    });
    expect(o.completenessPct, 93.3);
    expect(o.calibrationPct, isNull);
    expect(o.byDay.single.count, 4);
    expect(o.lastUpload, isNull);
  });

  test('the farmer calls are the web apps\' endpoints, with the station named for a national account', () async {
    final seen = <String>[];
    final bodies = <Object?>[];
    final api = apiWith((request) async {
      seen.add('${request.method} ${request.url.path}${request.url.hasQuery ? '?${request.url.query}' : ''}');
      if (request.method == 'POST' || request.method == 'PATCH') bodies.add(jsonDecode(request.body));
      return switch (request.url.path) {
        '/api/analysis/farm-climate/' => reply(farmClimateJson),
        '/api/farmers/farmers/send_bulletin/' => reply({
          'requires_confirmation': !(jsonDecode(request.body) as Map).containsKey('confirm'),
          'farmers': 2,
          'queued': 0,
          'already_sent': 0,
          'skipped': null,
          'detail': 'Nothing was sent.',
        }),
        '/api/farmers/farmers/6/' when request.method == 'PATCH' => reply({
          'id': 6,
          'station': 19,
          'full_name': 'Peter Kapfunde',
          'phone': '+263771000002',
          'language': 'sn',
          'is_active': false,
          'consent_given_on': '2026-10-21',
        }),
        '/api/farmers/messages/' => reply({'count': 2, 'next': null, 'previous': null, 'results': smsMessagesJson}),
        '/api/farmers/incoming/' => reply({'count': 2, 'next': null, 'previous': null, 'results': incomingJson}),
        '/api/analysis/adoption/' => reply(adoptionJson),
        '/api/farmers/farmers/' when request.method == 'POST' => reply({
          'id': 5,
          'station': 19,
          'full_name': 'Nomsa Ncube',
          'phone': '+263712345678',
          'language': 'nd',
          'is_active': true,
          'consent_given_on': '2026-11-02',
        }, 201),
        _ => reply({'count': 0, 'next': null, 'previous': null, 'results': []}),
      };
    });
    api.client.tokens = Tokens('a1', 'r1');

    final farm = await api.farmClimate(station: 19);
    await api.farmers(station: 19);
    final made = await api.addFarmer(
      name: ' Nomsa Ncube ',
      phone: '0712 345 678',
      language: 'nd',
      consentGivenOn: DateTime(2026, 11, 2),
      village: '',
      station: 19,
    );
    final asked = await api.sendBulletin(station: 19);
    await api.sendBulletin(confirm: true, station: 19);

    expect(seen, [
      'GET /api/analysis/farm-climate/?station=19',
      'GET /api/farmers/farmers/?page=1&page_size=50&station=19',
      'POST /api/farmers/farmers/',
      'POST /api/farmers/farmers/send_bulletin/?station=19',
      'POST /api/farmers/farmers/send_bulletin/?station=19',
    ]);
    expect(bodies[0], {
      'station': 19,
      'full_name': 'Nomsa Ncube',
      'phone': '0712 345 678', // as typed: the server writes it +263...
      'language': 'nd',
      'consent_given_on': '2026-11-02',
      'is_active': true,
    });
    expect(bodies.sublist(1), [<String, dynamic>{}, {'confirm': true}], reason: 'a count first, the sending only on confirm');
    expect(made.phone, '+263712345678');
    expect([farm.farmersReached, farm.readingsThisWeek, farm.nextBulletinAtRisk, farm.replyNumber], [1, 0, true, '32123']);
    expect(asked.requiresConfirmation, isTrue);
    expect(farm.rainMm, 12.4);
    expect(farm.rainVersus, 'above');
    expect(farm.bulletins.map((b) => (b.language, b.reviewed)), [('en', true), ('sn', false), ('nd', false)]);
    expect(farm.alerts.single.names['sn'], 'Mafashamo (Yakakwira)');
  });

  test('a national account signs in without a station code and names the station it opened', () async {
    final seen = <String>[];
    final api = apiWith((request) async {
      seen.add('${request.method} ${request.url.path}${request.url.hasQuery ? '?${request.url.query}' : ''}');
      if (request.url.path == '/api/users/token/') {
        expect(jsonDecode(request.body), {'email': 'superadmin@example.org', 'password': 'admin'});
        return reply({'access': 'a1', 'refresh': 'r1', 'user': superadminJson});
      }
      if (request.method == 'POST') {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['station'], 19, reason: 'the server asks a superadmin to name the station');
        return reply({
          'id': 7,
          'metric': 'TEMP_C',
          'observed_at': '2026-10-20T06:00:00Z',
          'value': '21.40',
          'unit': '°C',
          'quality_flag': 'Valid',
          'source': 'Manual',
        }, 201);
      }
      return reply({'count': 0, 'next': null, 'previous': null, 'results': []});
    });

    final user = await api.signInNational(email: ' superadmin@example.org ', password: 'admin');
    expect(user!.isSuperuser, isTrue);
    expect(user.role, 'National superadmin');
    expect(user.level, 1, reason: 'as the server counts a superadmin');
    expect(user.canAddReadings, isTrue);

    await api.observations(station: 19);
    await api.sensors(station: 19);
    await api.events(station: 19);
    await api.observations();
    final metric = Metric(code: 'TEMP_C', name: 'Air temperature', unit: '°C');
    await api.addObservation(metric: metric, observedAt: DateTime.utc(2026, 10, 20, 6), value: '21.4', station: 19);
    expect(seen, [
      'POST /api/users/token/',
      'GET /api/weather/observations/?page=1&page_size=25&station=19',
      'GET /api/sensors/hardware/?page_size=200&station=19',
      'GET /api/events/extreme/?page=1&page_size=50&station=19',
      'GET /api/weather/observations/?page=1&page_size=25',
      'POST /api/weather/observations/',
    ]);
  });

  test('the SMS, the texts, stopping a farmer and the adoption report are the web apps\' calls', () async {
    final seen = <String>[];
    final bodies = <Object?>[];
    final api = apiWith((request) async {
      seen.add('${request.method} ${request.url.path}${request.url.hasQuery ? '?${request.url.query}' : ''}');
      if (request.method == 'PATCH') bodies.add(jsonDecode(request.body));
      return switch (request.url.path) {
        '/api/farmers/farmers/6/' => reply({
          'id': 6,
          'station': 19,
          'full_name': 'Peter Kapfunde',
          'phone': '+263771000002',
          'language': 'sn',
          'is_active': false,
          'consent_given_on': '2026-10-21',
        }),
        '/api/farmers/messages/' => reply({'count': 2, 'next': null, 'previous': null, 'results': smsMessagesJson}),
        '/api/farmers/incoming/' => reply({'count': 2, 'next': null, 'previous': null, 'results': incomingJson}),
        '/api/analysis/adoption/' => reply(adoptionJson),
        _ => reply({'detail': 'Not found.'}, 404),
      };
    });
    api.client.tokens = Tokens('a1', 'r1');

    final stopped = await api.setReceivesSms(6, receives: false);
    final sms = await api.smsMessages(station: 19);
    final texts = await api.incomingTexts(station: 19);
    final adoption = await api.adoption();

    expect(seen, [
      'PATCH /api/farmers/farmers/6/',
      'GET /api/farmers/messages/?page=1&page_size=50&station=19',
      'GET /api/farmers/incoming/?page=1&page_size=50&station=19',
      'GET /api/analysis/adoption/?days=30&rural=true',
    ]);
    expect(bodies, [
      {'is_active': false},
    ]);
    expect(stopped.receivesSms, isFalse);
    expect([for (final m in sms.results) m.status], ['Delivered', 'Undelivered']);
    expect(sms.results.first.deliveredAt, isNotNull);
    expect(sms.results.last.error, "Africa's Talking: AbsentSubscriber");
    expect([for (final t in texts.results) t.asked], ['RAIN', 'Other text']);
    expect(texts.results.last.fromRegisteredNumber, isFalse);
    expect([adoption.total('farmers_reached'), adoption.targetFarmers, adoption.targetPct], [1, 40, 2.5]);
    expect(adoption.rows.single.station.code, 'MRD-001');
    expect([adoption.rows.single.count('farmers_active'), adoption.rows.single.bulletinAtRisk], [2, true]);
  });
}
