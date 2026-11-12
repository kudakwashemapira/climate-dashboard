/// Simulates a phone session against a running backend, with the app's own API classes and
/// without a device: sign in, open each tab, add a reading, renew the token, sign out.
///
///   dart run tool/simulate.dart --password station
///   dart run tool/simulate.dart --base http://localhost:8000/api --station BYO-001 \
///       --email bulawayo.station@dcces.zchpc.ac.zw --password station
///   dart run tool/simulate.dart --national --password admin
///
/// Options: --base (default http://localhost:8000/api), --station (HRE-001), --email
/// (harare.station@dcces.zchpc.ac.zw), --password (or the CLIMATE_PASSWORD variable), --otp (the
/// emailed code, where the server asks for one), --keep (keep the test reading), --verbose (print each
/// API call, as the app logs it).
///
/// --national signs in as a national account instead (--email defaults to
/// superadmin@dcces.zchpc.ac.zw): the national figures, the stations, the alerts of every station, then
/// one station opened as the app opens it (--station, or the one with the lowest completeness).
///
/// The reading it adds is removed again at the end unless --keep is given; removing needs a station
/// administrator (level 2). It is for development and staging only, never production.
library;

import 'dart:io';

import 'package:climate_mobile/api/api_client.dart';
import 'package:climate_mobile/api/climate_api.dart';

var _step = 0;
var _failed = 0;

void ok(String text) => stdout.writeln('  ${(++_step).toString().padLeft(2)}. ok    $text');

void bad(String text) {
  _failed++;
  stdout.writeln('  ${(++_step).toString().padLeft(2)}. FAIL  $text');
}

void check(bool passed, String text) => passed ? ok(text) : bad(text);

Map<String, String> parse(List<String> args) {
  final options = <String, String>{};
  for (var i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) continue;
    final name = args[i].substring(2);
    final hasValue = i + 1 < args.length && !args[i + 1].startsWith('--');
    options[name] = hasValue ? args[++i] : 'true';
  }
  return options;
}

Future<void> main(List<String> args) async {
  final o = parse(args);
  final base = o['base'] ?? 'http://localhost:8000/api';
  final national = o['national'] != null;
  final station = o['station'] ?? 'HRE-001';
  final email = o['email'] ?? (national ? 'superadmin@dcces.zchpc.ac.zw' : 'harare.station@dcces.zchpc.ac.zw');
  final password = o['password'] ?? Platform.environment['CLIMATE_PASSWORD'];
  if (password == null || password.isEmpty) {
    stderr.writeln('Give the password with --password or the CLIMATE_PASSWORD variable.');
    exit(2);
  }

  final api = ClimateApi(ApiClient(base));
  if (o['verbose'] != null) api.client.log = (line) => stdout.writeln('            [api] $line');
  stdout.writeln('Simulated phone session on $base as $email (${national ? 'national' : station})');
  try {
    if (national) {
      await _national(api, o, email, password);
      stdout.writeln(_failed == 0 ? 'Simulation passed: $_step steps.' : 'Simulation FAILED: $_failed of $_step steps.');
      exit(_failed == 0 ? 0 : 1);
    }
    // Sign-in page
    final server = await api.version();
    ok('server release ${server.release}, API ${server.api}; one-time code ${server.signInCode ? 'asked' : 'not asked (development)'}');

    try {
      await api.signIn(email: email, password: password, stationCode: station == 'BYO-001' ? 'HRE-001' : 'BYO-001');
      bad('signing in with another station\'s code was accepted');
    } on ApiException catch (e) {
      check(e.status == 401, 'another station\'s code is refused (HTTP ${e.status}: ${e.message})');
    }

    var user = await api.signIn(email: email, password: password, stationCode: station.toLowerCase());
    if (user == null) {
      final code = o['otp'] ?? _ask('A one-time code was emailed to $email. Code: ');
      user = await api.signIn(email: email, password: password, stationCode: station, otp: code);
    }
    if (user == null) throw ApiException(0, 'The server asked for a code again.');
    check(
      user.station?.code == station.toUpperCase(),
      'signed in: ${user.name}, ${user.role} (level ${user.level}), station ${user.station?.code} ${user.station?.name}',
    );

    final stations = await api.stations();
    check(
      stations.count == 1 && stations.results.single.code == user.station?.code,
      'the account sees ${stations.count} station: ${stations.results.map((s) => s.code).join(', ')}',
    );

    // Overview tab
    final overview = await api.overview();
    ok(
      'overview: ${overview.observationsInPeriod} readings in the last 30 days, completeness ${overview.completenessPct ?? 'n/a'} %, '
      'calibration ${overview.calibrationPct ?? 'n/a'} %, ${overview.activeAlerts} active alerts',
    );

    // Readings tab
    final metrics = await api.metrics();
    check(metrics.isNotEmpty, 'metrics for the filter and the form: ${metrics.map((m) => m.code).join(', ')}');
    final readings = await api.observations();
    ok(
      'readings: ${readings.count} in all, first page ${readings.results.length}'
      '${readings.results.isEmpty ? '' : ', newest ${readings.results.first.metric} ${readings.results.first.value} ${readings.results.first.unit}'}',
    );
    if (metrics.isNotEmpty) {
      final filtered = await api.observations(metric: metrics.first.code, pageSize: 5);
      check(filtered.results.every((r) => r.metric == metrics.first.code), 'filter by ${metrics.first.code}: ${filtered.count} readings');
    }

    // Sensors and Alerts tabs
    final sensors = await api.sensors();
    ok('sensors: ${sensors.length}, calibration ${{for (final s in sensors) s.calibrationStatus}.join('/')}');
    final events = await api.events();
    ok('alerts: ${events.count} extreme events, ${events.results.where((e) => e.ongoing).length} ongoing');

    // Farmers tab (rural pilot): the endpoints of the web Farm climate and Farmers screens
    final farm = await api.farmClimate();
    check(
      farm.bulletins.map((b) => b.language).join('/') == 'en/sn/nd',
      'farm climate: rain ${farm.rainReadings == 0 ? 'no readings' : '${farm.rainMm} mm'} in 7 days, '
      '${farm.farmersActive} farmers receive SMS, this week\'s bulletin in en/sn/nd',
    );
    final farmers = await api.farmers();
    check(
      farmers.count == farm.farmersActive + farm.farmersStopped,
      'farmers: ${farmers.count} registered, as the farm climate counts them',
    );
    if (user.canSendBulletin) {
      final asked = await api.sendBulletin();
      check(asked.requiresConfirmation && asked.queued == 0, 'bulletin: ${asked.farmers} farmers would get it; nothing is sent without confirm');
    }
    // Its SMS to farmers and Texts from farmers views
    final sms = await api.smsMessages();
    final byStatus = <String, int>{};
    for (final m in sms.results) {
      byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
    }
    ok('SMS to farmers: ${sms.count}, newest ${sms.results.length} ${byStatus.entries.map((e) => '${e.value} ${e.key}').join(', ')}');
    final texts = await api.incomingTexts();
    ok('texts from farmers: ${texts.count}${texts.results.isEmpty ? '' : ', newest ${texts.results.first.asked}: ${texts.results.first.outcome}'}');

    // Add reading
    final metric = metrics.firstWhere((m) => m.code == 'TEMP_C', orElse: () => metrics.first);
    try {
      await api.addObservation(metric: metric, observedAt: DateTime.now(), value: '${(metric.max ?? 1000) + 100}');
      bad('a value outside the metric\'s range was accepted');
    } on ApiException catch (e) {
      check(e.status == 400 && e.fields.containsKey('value'), 'out-of-range value refused by the server: ${e.fields['value']?.join(' ')}');
    }
    if (!user.canAddReadings) {
      ok('level ${user.level} reads only: the app hides "Add reading"');
    } else {
      final value = ((metric.min ?? 0) + (metric.max ?? 10)) / 2;
      final saved = await api.addObservation(
        metric: metric,
        observedAt: DateTime.now().subtract(const Duration(minutes: 5)),
        value: value.toStringAsFixed(1),
        notes: 'Simulated mobile app reading',
      );
      ok('reading added: #${saved.id} ${saved.metric} ${saved.value} ${saved.unit}, ${saved.qualityFlag}, source ${saved.source}');
      final newest = await api.observations(pageSize: 5);
      check(newest.results.any((r) => r.id == saved.id), 'the new reading is in the station\'s list');

      // Token renewal: spoil the access token, as if it had expired
      api.client.tokens!.access = 'expired';
      final again = await api.overview();
      check(
        again.observationsTotal == overview.observationsTotal + 1,
        'expired token renewed silently; total now ${again.observationsTotal}',
      );

      if (o['keep'] == null) {
        try {
          await api.deleteObservation(saved.id);
          ok('test reading #${saved.id} removed');
        } on ApiException catch (e) {
          ok('test reading #${saved.id} kept: ${e.message} (a station administrator can remove it)');
        }
      }
    }

    api.signOut();
    try {
      await api.overview();
      bad('a call after sign-out was answered');
    } on ApiException catch (e) {
      check(e.status == 401, 'signed out: the API answers HTTP ${e.status} without a token');
    }
  } on ApiException catch (e) {
    bad('stopped: ${e.message} (HTTP ${e.status})');
  }

  stdout.writeln(_failed == 0 ? 'Simulation passed: $_step steps.' : 'Simulation FAILED: $_failed of $_step steps.');
  exit(_failed == 0 ? 0 : 1);
}

/// The national account's session: what NationalHomeScreen and an opened station ask the server.
Future<void> _national(ClimateApi api, Map<String, String> o, String email, String password) async {
  final server = await api.version();
  ok('server release ${server.release}, API ${server.api}; one-time code ${server.signInCode ? 'asked' : 'not asked (development)'}');

  try {
    await api.signIn(email: email, password: password, stationCode: 'HRE-001');
    bad('the station sign-in accepted a national account');
  } on ApiException catch (e) {
    check(e.status == 401, 'the station sign-in refuses a national account (HTTP ${e.status}): it chooses National');
  }

  var user = await api.signInNational(email: email, password: password);
  if (user == null) {
    final code = o['otp'] ?? _ask('A one-time code was emailed to $email. Code: ');
    user = await api.signInNational(email: email, password: password, otp: code);
  }
  if (user == null) throw ApiException(0, 'The server asked for a code again.');
  check(user.isSuperuser && user.station == null, 'signed in nationally: ${user.name}, ${user.role} (level ${user.level}), no station');

  // Overview tab: every station
  final overview = await api.overview();
  ok(
    'national overview: ${overview.stationsActive} of ${overview.stationsTotal} stations active, '
    '${overview.observationsInPeriod} readings in the last 30 days, completeness ${overview.completenessPct ?? 'n/a'} %, '
    '${overview.activeAlerts} active alerts',
  );

  // Stations tab
  final health = await api.stationHealth();
  check(health.rows.length == overview.stationsTotal, 'stations tab: ${health.rows.length} stations, as many as the overview counts');
  final measured = health.rows.where((r) => r.completenessPct != null).toList();
  check(
    [for (var i = 1; i < measured.length; i++) measured[i - 1].completenessPct! <= measured[i].completenessPct!].every((x) => x),
    'lowest completeness first: ${measured.take(3).map((r) => '${r.station.code} ${r.completenessPct} %').join(', ')}',
  );
  final stations = await api.stations();
  check(stations.count == health.rows.length, 'the account sees every station: ${stations.count}');

  // Alerts tab: every station, each named
  final events = await api.events();
  final names = {for (final s in stations.results) s.id: s.code};
  check(
    events.results.every((e) => names.containsKey(e.stationId)),
    'alerts: ${events.count} extreme events at ${{for (final e in events.results) names[e.stationId]}.join(', ')}',
  );

  // Rural tab: the adoption report, rural pilot stations only
  final adoption = await api.adoption();
  check(
    adoption.rows.length == adoption.total('stations'),
    'rural adoption: ${adoption.total('farmers_reached')} farmers reached'
    '${adoption.targetFarmers == null ? ' (no target set)' : ' of the target of ${adoption.targetFarmers}'}, '
    '${adoption.total('stations_bulletin_at_risk')} of ${adoption.rows.length} rural stations without a reading this week, '
    '${adoption.daysLeft} days to ${adoption.deadline}',
  );

  // A station opened from the list
  final wanted = o['station']?.toUpperCase();
  final row = wanted == null
      ? (measured.isEmpty ? health.rows.first : measured.first)
      : health.rows.firstWhere((r) => r.station.code == wanted, orElse: () => throw ApiException(0, 'No station $wanted.'));
  final id = row.station.id;
  final one = await api.overview(station: id);
  check(
    one.stationsTotal == 1,
    'opened ${row.station.code} ${row.station.name}: its own figures, completeness ${one.completenessPct ?? 'n/a'} %',
  );
  final sensors = await api.sensors(station: id);
  check(
    sensors.where((s) => s.inService).length == row.sensors,
    'its sensors: ${sensors.length}, ${row.sensors} in service as the stations tab says',
  );
  final readings = await api.observations(station: id, pageSize: 5);
  ok('its readings: ${readings.count}');
  final alerts = await api.events(station: id);
  check(alerts.results.every((e) => e.stationId == id), 'its alerts: ${alerts.count}, of this station only');
  final farm = await api.farmClimate(station: id);
  final farmers = await api.farmers(station: id);
  check(
    farmers.count == farm.farmersActive + farm.farmersStopped,
    'its farmers: ${farmers.count}, ${farm.farmersActive} receive SMS (farm climate of this station)',
  );

  // Add reading for the opened station
  final metrics = await api.metrics();
  final metric = metrics.firstWhere((m) => m.code == 'TEMP_C', orElse: () => metrics.first);
  final value = (((metric.min ?? 0) + (metric.max ?? 10)) / 2).toStringAsFixed(1);
  try {
    await api.addObservation(metric: metric, observedAt: DateTime.now(), value: value);
    bad('a national reading without a station was accepted');
  } on ApiException catch (e) {
    check(e.status == 400 && e.fields.containsKey('station'), 'a reading with no station is refused: ${e.fields['station']?.join(' ')}');
  }
  final saved = await api.addObservation(
    metric: metric,
    observedAt: DateTime.now().subtract(const Duration(minutes: 5)),
    value: value,
    notes: 'Simulated mobile app reading (national)',
    station: id,
  );
  ok('reading added to ${row.station.code}: #${saved.id} ${saved.metric} ${saved.value} ${saved.unit}, source ${saved.source}');
  final newest = await api.observations(station: id, pageSize: 5);
  check(newest.results.any((r) => r.id == saved.id), 'the new reading is in ${row.station.code}\'s list');
  final after = await api.overview();
  check(after.observationsTotal == overview.observationsTotal + 1, 'the national total counts it: ${after.observationsTotal}');
  if (o['keep'] == null) {
    await api.deleteObservation(saved.id);
    ok('test reading #${saved.id} removed');
  }

  api.signOut();
  try {
    await api.overview();
    bad('a call after sign-out was answered');
  } on ApiException catch (e) {
    check(e.status == 401, 'signed out: the API answers HTTP ${e.status} without a token');
  }
}

String _ask(String prompt) {
  stdout.write(prompt);
  return stdin.readLineSync()?.trim() ?? '';
}
