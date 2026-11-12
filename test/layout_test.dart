import 'dart:convert';

import 'package:climate_mobile/api/api_client.dart';
import 'package:climate_mobile/api/climate_api.dart';
import 'package:climate_mobile/api/models.dart';
import 'package:climate_mobile/screens/home_screen.dart';
import 'package:climate_mobile/screens/national_home_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fixtures.dart';

Map<String, dynamic> page(List<Map<String, dynamic>> rows) => {'count': rows.length, 'next': null, 'previous': null, 'results': rows};

/// Replies shaped as the backend's, with long names to stress the layout.
final replies = <String, Object>{
  '/api/analysis/overview/': {
    'period': {'from': '2026-09-14', 'to': '2026-10-13', 'days': 30},
    'stations': {'total': 1, 'active': 1},
    'sensors': {'total': 125, 'in_service': 118},
    'observations': {'total': 1234567, 'in_period': 45678},
    'active_alerts': 3,
    'data_completeness_pct': 93.3,
    'calibration_compliance_pct': 100.0,
    'calibration_status': {'Current': 100, 'Due': 10, 'Overdue': 8, 'Unknown': 0},
    'observations_by_day': [
      for (var i = 0; i < 30; i++) {'date': '2026-09-${(14 + i) % 30 + 1}', 'count': i * 3 % 17},
    ],
    'last_upload': {
      'id': 'x',
      'filename': 'observations_week_40_with_a_very_long_file_name.csv',
      'status': 'Completed',
      'created_at': '2026-10-09T07:25:32Z',
      'success_count': 28,
      'error_count': 2,
      'station': 12,
      'station_code': 'HRE-001',
    },
  },
  '/api/weather/metrics/': page([
    {'id': 1, 'code': 'TEMP_C', 'name': 'Air temperature', 'unit': '°C', 'min_valid': '-20.00', 'max_valid': '55.00', 'is_active': true},
    {
      'id': 3,
      'code': 'HUMIDITY_PCT',
      'name': 'Relative humidity',
      'unit': '%',
      'min_valid': '0.00',
      'max_valid': '100.00',
      'is_active': true,
    },
  ]),
  '/api/weather/observations/': page([
    for (var i = 0; i < 6; i++)
      {
        'id': i,
        'station': 12,
        'sensor': 48,
        'sensor_label': 'HRE-001-H1',
        'metric': 'HUMIDITY_PCT',
        'observed_at': '2026-10-13T12:18:00Z',
        'value': '100.00',
        'unit': '%',
        'quality_flag': i.isEven ? 'Valid' : 'Suspect',
        'notes': 'A long remark about why this reading is suspect',
        'source': 'Bulk upload',
        'upload_batch': null,
        'created_at': '2026-10-13T12:19:57Z',
      },
  ]),
  '/api/sensors/hardware/': page([
    {
      'id': 48,
      'station': 12,
      'sensor_code': 'HRE-001-H1',
      'sensor_type': 'Hygrometer',
      'manufacturer': 'Campbell Scientific',
      'model': 'HygroVUE10',
      'status': 'Out for calibration',
      'calibration_status': 'Overdue',
    },
    {
      'id': 49,
      'station': 12,
      'sensor_code': 'HRE-001-T0',
      'sensor_type': 'Thermometer',
      'manufacturer': 'Vaisala',
      'model': 'HMP45',
      'status': 'Retired',
      'calibration_status': 'Unknown',
    },
  ]),
  '/api/analysis/data-quality/': {
    'period': {'from': '2026-09-21', 'to': '2026-10-20', 'days': 30},
    'count': 3,
    'next': null,
    'previous': null,
    'results': [
      {
        'station': 19,
        'station_code': 'BBR-001',
        'station_name': 'Beitbridge Border Post Meteorological Station',
        'province': 'Matabeleland South',
        'status': 'Active',
        'expected': 120,
        'received': 40,
        'completeness_pct': 33.3,
        'rejected_rows': 0,
        'suspect_rows': 1,
        'sensors': 5,
        'overdue_calibrations': 2,
        'due_calibrations': 1,
        'last_observation_at': '2026-09-30T06:00:00Z',
      },
      {
        'station': 12,
        'station_code': 'HRE-001',
        'station_name': 'Harare Belvedere',
        'province': 'Harare',
        'status': 'Active',
        'expected': 120,
        'received': 118,
        'completeness_pct': 98.3,
        'rejected_rows': 0,
        'suspect_rows': 0,
        'sensors': 4,
        'overdue_calibrations': 0,
        'due_calibrations': 0,
        'last_observation_at': '2026-10-20T06:00:00Z',
      },
      {
        'station': 30,
        'station_code': 'GWE-002',
        'station_name': 'Gweru Old Airfield',
        'province': 'Midlands',
        'status': 'Decommissioned',
        'expected': null,
        'received': 0,
        'completeness_pct': null,
        'rejected_rows': 0,
        'suspect_rows': 0,
        'sensors': 0,
        'overdue_calibrations': 0,
        'due_calibrations': 0,
        'last_observation_at': null,
      },
    ],
  },
  '/api/stations/stations/': page([
    {'id': 12, 'station_code': 'HRE-001', 'name': 'Harare Belvedere', 'station_type': 'Climate reference', 'province': 'Harare'},
    {
      'id': 19,
      'station_code': 'BBR-001',
      'name': 'Beitbridge Border Post Meteorological Station',
      'station_type': 'Meteorological',
      'province': 'Matabeleland South',
    },
  ]),
  '/api/analysis/farm-climate/': farmClimateJson,
  '/api/farmers/messages/': page(smsMessagesJson),
  '/api/farmers/incoming/': page(incomingJson),
  '/api/analysis/adoption/': adoptionJson,
  '/api/farmers/setup/': smsSetupJson,
  '/api/farmers/farmers/': page([
    {
      'id': 5,
      'station': 12,
      'full_name': 'Nomsakhona Ncube-Mlilo Sibanda',
      'phone': '+263712345678',
      'language': 'nd',
      'village': 'Ward 15, a long village name beside the river',
      'main_crops': 'Sorghum, millet, cowpeas',
      'consent_given_on': '2026-10-20',
      'is_active': true,
    },
    {
      'id': 6,
      'station': 12,
      'full_name': 'Peter Kapfunde',
      'phone': '+263771000002',
      'language': 'sn',
      'village': null,
      'main_crops': null,
      'consent_given_on': '2026-10-21',
      'is_active': false,
    },
  ]),
  '/api/events/extreme/': page([
    {
      'id': 24,
      'station': 12,
      'event_type': 'Severe thunderstorm with hail',
      'severity': 'Extreme',
      'started_at': '2026-09-21T04:00:00Z',
      'ended_at': null,
      'alert_issued': true,
      'description': 'Hail reported; crop and roof damage in the district.',
    },
  ]),
};

/// Every request the fake server was sent, as path?query.
final asked = <String>[];

ClimateApi fakeApi() => ClimateApi(
  ApiClient(
    'http://test/api',
    client: MockClient((request) async {
      asked.add('${request.method} ${request.url.path}${request.url.hasQuery ? '?${request.url.query}' : ''}');
      final body = replies[request.url.path];
      return body == null
          ? http.Response('{"detail": "Not found."}', 404)
          : http.Response(jsonEncode(body), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    }),
  ),
);

void main() {
  for (final size in const [Size(320, 640), Size(392, 820)]) {
    testWidgets('every tab and the reading form fit a ${size.width.toInt()} x ${size.height.toInt()} screen', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final user = User.fromJson({
        ...userJson,
        'station': {
          'id': 12,
          'station_code': 'HRE-001',
          'name': 'Harare Belvedere Meteorological Office',
          'station_type': 'Climate reference',
        },
      });

      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(api: fakeApi(), user: user, onSignOut: () {}),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Data completeness'), findsOneWidget);

      // The rural pilot card of the station: its own farmers (no rural filter), the days left, the bulletin at risk
      final overview = find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down).first;
      await tester.scrollUntilVisible(find.text('1 farmer reached'), 200, scrollable: overview);
      expect(find.text('Rural pilot'), findsOneWidget);
      expect(find.text('27 days'), findsOneWidget);
      expect(find.textContaining('No rain or temperature reading this week'), findsOneWidget);
      expect(asked, contains('GET /api/analysis/adoption/?days=30'));
      await tester.scrollUntilVisible(find.text('Data completeness'), -200, scrollable: overview);

      for (final (tab, shown) in [
        ('Readings', 'Relative humidity: 100.00 %'),
        ('Sensors', 'HRE-001-H1 · Hygrometer'),
        ('Alerts', 'Severe thunderstorm with hail'),
        ('Farmers', 'Last week at the station'),
        ('Overview', 'Data completeness'),
      ]) {
        await tester.tap(find.text(tab));
        await tester.pumpAndSettle();
        expect(find.text(shown), findsWidgets, reason: tab);
      }

      // The Farmers tab: the server's figures and bulletin, a farmer who stopped, the register form
      await tester.tap(find.text('Farmers'));
      await tester.pumpAndSettle();
      expect(find.text('12 mm'), findsOneWidget);
      expect(find.text('Above normal: normal 7.2 mm'), findsOneWidget);
      // The view's list, not the bar of views above it (which scrolls sideways)
      final list = find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down).hitTestable().first;
      await tester.scrollUntilVisible(find.text('Shona'), 200, scrollable: list);
      await tester.ensureVisible(find.text('Shona')); // to the top of the list, clear of the Register farmer button
      await tester.pumpAndSettle();
      await tester.tap(find.text('Shona'));
      await tester.pumpAndSettle();
      expect(find.textContaining('mvura 12 mm'), findsOneWidget);
      expect(find.text('Draft translation'), findsOneWidget);
      expect(find.textContaining('get the English text until this translation is reviewed'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Nomsakhona Ncube-Mlilo Sibanda'), 200, scrollable: list);
      await tester.scrollUntilVisible(find.text('Stopped'), 200, scrollable: list);
      // A farmer who stopped is started again from the list, after a question
      await tester.ensureVisible(find.text('Peter Kapfunde')); // clear of the Register farmer button
      await tester.pumpAndSettle();
      await tester.tap(find.text('Peter Kapfunde'));
      await tester.pumpAndSettle();
      expect(find.text('Start SMS to Peter Kapfunde again?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      // The SMS and the texts, as the web apps list them; on a narrow phone the bar of views scrolls sideways
      await tester.ensureVisible(find.text('SMS to farmers'));
      await tester.tap(find.text('SMS to farmers'));
      await tester.pumpAndSettle();
      expect(find.text('Welcome to Nomsakhona Ncube-Mlilo Sibanda'), findsOneWidget);
      expect(find.text('Delivered'), findsOneWidget);
      expect(find.text('Undelivered'), findsOneWidget);
      expect(find.text("Africa's Talking: AbsentSubscriber"), findsOneWidget);
      await tester.ensureVisible(find.text('Texts from farmers'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Texts from farmers'));
      await tester.pumpAndSettle();
      expect(find.text('RAIN'), findsOneWidget);
      expect(find.text('"Mvura"'), findsOneWidget);
      expect(find.text('Number not registered'), findsOneWidget);
      await tester.tap(find.text('Farm climate'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Register farmer'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Save farmer'), 200, scrollable: find.byType(Scrollable).hitTestable().first);
      expect(find.text('Save farmer'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Overview'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Readings'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add reading'));
      await tester.pumpAndSettle();
      expect(find.text('Save reading'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.account_circle_outlined));
      await tester.pumpAndSettle();
      expect(find.text('Sign out'), findsOneWidget);
    });
  }

  testWidgets('Android Back on another tab returns to Overview instead of closing the app', (tester) async {
    final user = User.fromJson(userJson);
    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(api: fakeApi(), user: user, onSignOut: () {}),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Sensors'));
    await tester.pumpAndSettle();
    expect(find.text('HRE-001-H1 · Hygrometer'), findsOneWidget);

    final handled = await tester.binding.handlePopRoute(); // the system Back button
    await tester.pumpAndSettle();
    expect(handled, isTrue, reason: 'the app handled Back itself');
    expect(find.text('Data completeness'), findsOneWidget);
    expect(find.text('HRE-001-H1 · Hygrometer'), findsNothing);
  });

  for (final size in const [Size(320, 640), Size(392, 820)]) {
    testWidgets('the national tabs fit a ${size.width.toInt()} x ${size.height.toInt()} screen and open a station', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      asked.clear();
      final user = User.fromJson(superadminJson);

      await tester.pumpWidget(
        MaterialApp(
          home: NationalHomeScreen(api: fakeApi(), user: user, onSignOut: () {}),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('All stations · 1 of 1 active'), findsOneWidget);
      expect(asked, contains('GET /api/analysis/overview/'), reason: 'the national figures name no station');

      await tester.tap(find.text('Stations'));
      await tester.pumpAndSettle();
      expect(find.text('BBR-001 · Beitbridge Border Post Meteorological Station'), findsOneWidget);
      expect(find.text('33.3 %'), findsOneWidget);
      expect(find.textContaining('2 overdue calibrations'), findsOneWidget);
      expect(find.text('Decommissioned'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'midlands');
      await tester.pumpAndSettle();
      expect(find.text('GWE-002 · Gweru Old Airfield'), findsOneWidget);
      expect(find.textContaining('BBR-001'), findsNothing);
      await tester.enterText(find.byType(TextField), '');
      await tester.pumpAndSettle();

      await tester.tap(find.text('Rural'));
      await tester.pumpAndSettle();
      expect(find.text('No real phone receives these SMS yet: they go to the development SMS simulator. 1 to do.'), findsOneWidget);
      expect(find.text('Number farmers text'), findsOneWidget);
      expect(find.text('To do'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('2.5 % of the target of 40'),
        200,
        scrollable: find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down).hitTestable().first,
      );
      expect(find.text('2.5 % of the target of 40'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('MRD-001 · Marondera Grasslands'),
        200,
        scrollable: find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down).hitTestable().first,
      );
      expect(find.text('MRD-001 · Marondera Grasslands'), findsOneWidget);
      expect(find.text('No bulletin yet'), findsOneWidget);
      expect(asked, contains('GET /api/analysis/adoption/?days=30&rural=true'));

      await tester.tap(find.text('Alerts'));
      await tester.pumpAndSettle();
      expect(find.text('HRE-001 Harare Belvedere'), findsOneWidget, reason: 'each alert names its station');

      // An alert opens its station, in the station tabs, with the station named in each request
      asked.clear();
      await tester.tap(find.text('Severe thunderstorm with hail'));
      await tester.pumpAndSettle();
      expect(find.text('HRE-001 · Climate reference · Harare'), findsOneWidget);
      expect(asked, contains('GET /api/analysis/overview/?station=12'));
      await tester.tap(find.text('Readings'));
      await tester.pumpAndSettle();
      expect(asked.any((a) => a.startsWith('GET /api/weather/observations/') && a.contains('station=12')), isTrue);
      await tester.tap(find.text('Add reading'));
      await tester.pumpAndSettle();
      expect(find.text('HRE-001 Harare Belvedere'), findsOneWidget, reason: 'the form says which station the reading is for');
      expect(asked, contains('GET /api/sensors/hardware/?page_size=200&station=12'));
      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();

      // The arrow returns to every station from any tab
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      expect(find.text('National'), findsOneWidget);
    });
  }
}
