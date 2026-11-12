/// The API records the app shows, read from the JSON replies. Plain Dart.
///
/// Only the fields the app uses are read. Station coordinates are never read or shown: they are
/// encrypted at rest and the phone has no need for them (ADR-003).
library;

DateTime? _time(dynamic value) => value is String ? DateTime.tryParse(value)?.toLocal() : null;

double? _number(dynamic value) => value is num ? value.toDouble() : double.tryParse('${value ?? ''}');

/// GET /api/version/: the build in use and whether a one-time code follows the password.
class ServerInfo {
  ServerInfo({required this.release, required this.api, required this.signInCode});

  factory ServerInfo.fromJson(Map<String, dynamic> json) => ServerInfo(
    release: '${json['release'] ?? ''}',
    api: '${json['api'] ?? ''}',
    signInCode: json['sign_in_code'] != false, // asked unless the server says otherwise
  );

  final String release;
  final String api;
  final bool signInCode;
}

class StationRef {
  StationRef({required this.id, required this.code, required this.name, this.type = '', this.province = ''});

  factory StationRef.fromJson(Map<String, dynamic> json) => StationRef(
    id: json['id'] as int,
    code: '${json['station_code']}',
    name: '${json['name']}',
    type: '${json['station_type'] ?? ''}',
    province: '${json['province'] ?? ''}',
  );

  final int id;
  final String code;
  final String name;
  final String type;
  final String province;

  /// The code with what is known of the station, for example "HRE-001 · Climate reference".
  String get label => [code, type, province].where((part) => part.isNotEmpty).join(' · ');
}

/// The signed-in account, from the sign-in reply.
class User {
  User({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    required this.level,
    this.station,
    this.isSuperuser = false,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    final role = json['role'] as Map<String, dynamic>?;
    final station = json['station'] as Map<String, dynamic>?;
    final name = '${json['first_name'] ?? ''} ${json['last_name'] ?? ''}'.trim();
    final superuser = json['is_superuser'] == true;
    return User(
      id: json['id'] as int,
      email: '${json['email']}',
      name: name.isEmpty ? '${json['email']}' : name,
      role: '${role?['name'] ?? (superuser ? 'National superadmin' : 'No role')}',
      // As on the server (core/permissions.py user_level): a superadmin is level 1, no role reads only
      level: superuser ? 1 : (role?['level'] as int?) ?? 4,
      station: station == null ? null : StationRef.fromJson(station),
      isSuperuser: superuser,
    );
  }

  final int id;
  final String email;
  final String name;
  final String role;

  /// Access level 1 to 4 (FR-021): levels 1 to 3 add readings, level 4 reads only.
  final int level;
  final StationRef? station;

  /// A national superadmin (DCCES): sees every station and names the station of each reading it adds.
  final bool isSuperuser;

  bool get canAddReadings => level <= 3;

  /// Levels 1 to 3 register farmers, as they add readings (core/permissions.py).
  bool get canRegisterFarmers => level <= 3;

  /// Levels 1 and 2 send the farmers' bulletin by hand (ADMIN_ACTIONS in core/permissions.py).
  bool get canSendBulletin => level <= 2;
}

class ResultPage<T> {
  ResultPage({required this.count, required this.hasMore, required this.results});

  factory ResultPage.fromJson(Map<String, dynamic> json, T Function(Map<String, dynamic>) item) => ResultPage(
    count: json['count'] as int? ?? 0,
    hasMore: json['next'] != null,
    results: [for (final row in json['results'] as List) item(row as Map<String, dynamic>)],
  );

  final int count;
  final bool hasMore;
  final List<T> results;
}

class Metric {
  Metric({required this.code, required this.name, required this.unit, this.min, this.max, this.active = true});

  factory Metric.fromJson(Map<String, dynamic> json) => Metric(
    code: '${json['code']}',
    name: '${json['name']}',
    unit: '${json['unit']}',
    min: _number(json['min_valid']),
    max: _number(json['max_valid']),
    active: json['is_active'] != false,
  );

  final String code;
  final String name;
  final String unit;
  final double? min;
  final double? max;
  final bool active;
}

const qualityFlags = ['Valid', 'Suspect', 'Estimated', 'Rejected'];

/// A Suspect or Rejected reading carries a note that says why (CD-3.05 section 5.1).
const flagsNeedingANote = {'Suspect', 'Rejected'};

class Observation {
  Observation({
    required this.id,
    required this.metric,
    required this.observedAt,
    required this.value,
    required this.unit,
    required this.qualityFlag,
    required this.source,
    this.notes,
    this.sensorLabel,
  });

  factory Observation.fromJson(Map<String, dynamic> json) => Observation(
    id: json['id'] as int,
    metric: '${json['metric']}',
    observedAt: _time(json['observed_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
    value: '${json['value']}',
    unit: '${json['unit'] ?? ''}',
    qualityFlag: '${json['quality_flag'] ?? 'Valid'}',
    source: '${json['source'] ?? ''}',
    notes: json['notes'] as String?,
    sensorLabel: json['sensor_label'] as String?,
  );

  final int id;
  final String metric;
  final DateTime observedAt;
  final String value;
  final String unit;
  final String qualityFlag;
  /// Manual, Bulk upload, Telemetry, or Model: a weather model's values for the area (demo data only).
  final String source;

  String get sourceName => source == 'Model' ? 'Weather model' : source;
  final String? notes;
  final String? sensorLabel;
}

class Sensor {
  Sensor({
    required this.id,
    required this.code,
    required this.type,
    required this.status,
    required this.calibrationStatus,
    this.manufacturer,
    this.model,
  });

  factory Sensor.fromJson(Map<String, dynamic> json) => Sensor(
    id: json['id'] as int,
    code: '${json['sensor_code']}',
    type: '${json['sensor_type'] ?? ''}',
    status: '${json['status'] ?? ''}',
    calibrationStatus: '${json['calibration_status'] ?? 'Unknown'}',
    manufacturer: json['manufacturer'] as String?,
    model: json['model'] as String?,
  );

  final int id;
  final String code;
  final String type;
  final String status;
  final String calibrationStatus;
  final String? manufacturer;
  final String? model;

  bool get inService => status != 'Retired';
}

class ExtremeEvent {
  ExtremeEvent({
    required this.id,
    required this.stationId,
    required this.type,
    required this.severity,
    required this.startedAt,
    required this.alertIssued,
    this.endedAt,
    this.description,
  });

  factory ExtremeEvent.fromJson(Map<String, dynamic> json) => ExtremeEvent(
    id: json['id'] as int,
    stationId: json['station'] as int? ?? 0,
    type: '${json['event_type']}',
    severity: '${json['severity'] ?? ''}',
    startedAt: _time(json['started_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
    endedAt: _time(json['ended_at']),
    alertIssued: json['alert_issued'] == true,
    description: json['description'] as String?,
  );

  final int id;
  final int stationId;
  final String type;
  final String severity;
  final DateTime startedAt;
  final DateTime? endedAt;
  final bool alertIssued;
  final String? description;

  bool get ongoing => endedAt == null;
}

class DayCount {
  DayCount(this.date, this.count);

  final String date;
  final int count;
}

class LastUpload {
  LastUpload({required this.filename, required this.status, required this.createdAt, required this.saved, required this.refused});

  final String filename;
  final String status;
  final DateTime? createdAt;
  final int saved;
  final int refused;
}

/// GET /api/analysis/overview/: the dashboard figures, computed on the server (CD-3.02 section 4.6).
/// The app draws them and never recalculates one.
class Overview {
  Overview({
    required this.from,
    required this.to,
    required this.stationsTotal,
    required this.stationsActive,
    required this.sensorsTotal,
    required this.sensorsInService,
    required this.observationsTotal,
    required this.observationsInPeriod,
    required this.activeAlerts,
    required this.completenessPct,
    required this.calibrationPct,
    required this.calibrationStatus,
    required this.byDay,
    this.lastUpload,
  });

  factory Overview.fromJson(Map<String, dynamic> json) {
    final period = json['period'] as Map<String, dynamic>;
    final stations = json['stations'] as Map<String, dynamic>? ?? const {};
    final sensors = json['sensors'] as Map<String, dynamic>;
    final observations = json['observations'] as Map<String, dynamic>;
    final upload = json['last_upload'] as Map<String, dynamic>?;
    return Overview(
      from: '${period['from']}',
      to: '${period['to']}',
      stationsTotal: stations['total'] as int? ?? 0,
      stationsActive: stations['active'] as int? ?? 0,
      sensorsTotal: sensors['total'] as int? ?? 0,
      sensorsInService: sensors['in_service'] as int? ?? 0,
      observationsTotal: observations['total'] as int? ?? 0,
      observationsInPeriod: observations['in_period'] as int? ?? 0,
      activeAlerts: json['active_alerts'] as int? ?? 0,
      completenessPct: _number(json['data_completeness_pct']),
      calibrationPct: _number(json['calibration_compliance_pct']),
      calibrationStatus: {
        for (final entry in (json['calibration_status'] as Map<String, dynamic>? ?? const {}).entries) entry.key: entry.value as int? ?? 0,
      },
      byDay: [
        for (final day in json['observations_by_day'] as List? ?? const []) DayCount('${(day as Map)['date']}', day['count'] as int? ?? 0),
      ],
      lastUpload: upload == null
          ? null
          : LastUpload(
              filename: '${upload['filename']}',
              status: '${upload['status']}',
              createdAt: _time(upload['created_at']),
              saved: upload['success_count'] as int? ?? 0,
              refused: upload['error_count'] as int? ?? 0,
            ),
    );
  }

  final String from;
  final String to;

  /// The stations in the figures: one for a station account or an opened station, every station
  /// for a national account. Active stations are the ones expected to report.
  final int stationsTotal;
  final int stationsActive;
  final int sensorsTotal;
  final int sensorsInService;
  final int observationsTotal;
  final int observationsInPeriod;
  final int activeAlerts;

  /// Null when the period expected no readings.
  final double? completenessPct;
  final double? calibrationPct;
  final Map<String, int> calibrationStatus;
  final List<DayCount> byDay;
  final LastUpload? lastUpload;
}

/// One row of GET /api/analysis/data-quality/: how a station has reported over the period, as the
/// national Data Quality screen shows it (SCR-020). The figures are the server's.
class StationHealth {
  StationHealth({
    required this.station,
    required this.status,
    required this.received,
    required this.suspectRows,
    required this.rejectedRows,
    required this.sensors,
    required this.overdueCalibrations,
    required this.dueCalibrations,
    this.expected,
    this.completenessPct,
    this.lastObservationAt,
  });

  factory StationHealth.fromJson(Map<String, dynamic> json) => StationHealth(
    station: StationRef(
      id: json['station'] as int,
      code: '${json['station_code']}',
      name: '${json['station_name']}',
      province: '${json['province'] ?? ''}',
    ),
    status: '${json['status'] ?? ''}',
    expected: json['expected'] as int?,
    received: json['received'] as int? ?? 0,
    completenessPct: _number(json['completeness_pct']),
    suspectRows: json['suspect_rows'] as int? ?? 0,
    rejectedRows: json['rejected_rows'] as int? ?? 0,
    sensors: json['sensors'] as int? ?? 0,
    overdueCalibrations: json['overdue_calibrations'] as int? ?? 0,
    dueCalibrations: json['due_calibrations'] as int? ?? 0,
    lastObservationAt: _time(json['last_observation_at']),
  );

  final StationRef station;
  final String status;

  /// Null for a station that is not Active: nothing is expected of it.
  final int? expected;
  final int received;
  final double? completenessPct;
  final int suspectRows;
  final int rejectedRows;
  final int sensors;
  final int overdueCalibrations;
  final int dueCalibrations;
  final DateTime? lastObservationAt;

  bool get active => status == 'Active';
}

// ---- rural pilot: farmers and their SMS (backend farmers/) ---------------------------------------

/// The languages a farmer's SMS are written in, as the server names them.
const smsLanguages = {'en': 'English', 'sn': 'Shona', 'nd': 'Ndebele'};

/// A farmer registered at a station. Farmers have no account; they receive SMS from the station.
class Farmer {
  Farmer({
    required this.id,
    required this.name,
    required this.phone,
    required this.language,
    required this.receivesSms,
    this.village,
    this.crops,
    this.consentGivenOn,
  });

  factory Farmer.fromJson(Map<String, dynamic> json) => Farmer(
    id: json['id'] as int,
    name: '${json['full_name']}',
    phone: '${json['phone']}',
    language: '${json['language'] ?? 'en'}',
    receivesSms: json['is_active'] != false,
    village: json['village'] as String?,
    crops: json['main_crops'] as String?,
    consentGivenOn: json['consent_given_on'] as String?,
  );

  final int id;
  final String name;

  /// As the server stores it: +2637XXXXXXXX.
  final String phone;
  final String language;
  final bool receivesSms;
  final String? village;
  final String? crops;
  final String? consentGivenOn;

  String get languageName => smsLanguages[language] ?? language;
}

/// One active extreme weather event, with its name and severity in each SMS language.
class FarmAlert {
  FarmAlert({required this.type, required this.severity, required this.startedAt, required this.names});

  factory FarmAlert.fromJson(Map<String, dynamic> json) => FarmAlert(
    type: '${json['event_type']}',
    severity: '${json['severity'] ?? ''}',
    startedAt: _time(json['started_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
    names: {
      for (final entry in (json['names'] as Map<String, dynamic>? ?? const {}).entries)
        entry.key: '${(entry.value as Map)['event']} (${(entry.value as Map)['severity']})',
    },
  );

  final String type;
  final String severity;
  final DateTime startedAt;

  /// Language code to "event (severity)", worded as the SMS word them.
  final Map<String, String> names;
}

/// This week's SMS bulletin in one language. [reviewed] is false while the translation is a draft.
class Bulletin {
  Bulletin({required this.language, required this.name, required this.reviewed, required this.text, required this.sentAs});

  factory Bulletin.fromJson(Map<String, dynamic> json) => Bulletin(
    language: '${json['language']}',
    name: '${json['name']}',
    reviewed: json['reviewed'] == true,
    text: '${json['text']}',
    sentAs: '${json['sent_as'] ?? json['language']}',
  );

  final String language;
  final String name;
  final bool reviewed;
  final String text;

  /// The language a farmer who chose [language] receives: English while a draft is held back.
  final String sentAs;

  bool get heldBack => sentAs != language;
}

/// GET /api/analysis/farm-climate/: what farmers near one station need to know, computed on the
/// server from the station's readings (the web Farm climate screen shows the same figures), and the
/// bulletin the farmers get this week. The app shows them as they come; it computes nothing.
class FarmClimate {
  FarmClimate({
    required this.from,
    required this.to,
    required this.rainReadings,
    required this.rainDays,
    required this.seasonFrom,
    required this.seasonReadings,
    required this.temperatureReadings,
    required this.alerts,
    required this.farmersActive,
    required this.farmersStopped,
    required this.farmersReached,
    required this.bulletins,
    required this.nextBulletinSendsOn,
    required this.readingsThisWeek,
    required this.nextBulletinAtRisk,
    this.rainMm,
    this.rainNormalMm,
    this.rainVersus,
    this.seasonMm,
    this.seasonNormalMm,
    this.seasonVersus,
    this.minC,
    this.maxC,
    this.lastBulletinAt,
    this.replyNumber,
    this.weatherModel,
  });

  factory FarmClimate.fromJson(Map<String, dynamic> json) {
    final period = json['period'] as Map<String, dynamic>;
    final rain = json['rain'] as Map<String, dynamic>;
    final season = json['season'] as Map<String, dynamic>;
    final temperature = json['temperature'] as Map<String, dynamic>;
    final farmers = json['farmers'] as Map<String, dynamic>? ?? const {};
    final next = json['next_bulletin'] as Map<String, dynamic>? ?? const {};
    return FarmClimate(
      from: '${period['from']}',
      to: '${period['to']}',
      rainMm: _number(rain['total_mm']),
      rainReadings: rain['readings'] as int? ?? 0,
      rainDays: rain['rain_days'] as int? ?? 0,
      rainNormalMm: _number(rain['normal_mm']),
      rainVersus: rain['vs_normal'] as String?,
      seasonFrom: '${season['from']}',
      seasonMm: _number(season['total_mm']),
      seasonReadings: season['readings'] as int? ?? 0,
      seasonNormalMm: _number(season['normal_mm']),
      seasonVersus: season['vs_normal'] as String?,
      minC: _number(temperature['min_c']),
      maxC: _number(temperature['max_c']),
      temperatureReadings: temperature['readings'] as int? ?? 0,
      alerts: [for (final a in json['alerts'] as List? ?? const []) FarmAlert.fromJson(a as Map<String, dynamic>)],
      farmersActive: farmers['active'] as int? ?? 0,
      farmersStopped: farmers['opted_out'] as int? ?? 0,
      farmersReached: farmers['reached'] as int? ?? 0,
      lastBulletinAt: _time(json['last_bulletin_at']),
      nextBulletinSendsOn: '${next['sends_on'] ?? ''}',
      readingsThisWeek: next['readings'] as int? ?? 0,
      nextBulletinAtRisk: next['at_risk'] == true,
      replyNumber: json['reply_number'] as String?,
      weatherModel: json['weather_model'] as String?,
      bulletins: [for (final b in json['bulletin'] as List? ?? const []) Bulletin.fromJson(b as Map<String, dynamic>)],
    );
  }

  /// The last complete week, Monday to Sunday, the same whichever day it is asked for.
  final String from;
  final String to;
  final double? rainMm;
  final int rainReadings;

  /// Days with 1 mm or more.
  final int rainDays;
  final double? rainNormalMm;

  /// above, near or below the normal for the same days; null without readings or a normal.
  final String? rainVersus;
  final String seasonFrom;
  final double? seasonMm;
  final int seasonReadings;
  final double? seasonNormalMm;
  final String? seasonVersus;
  final double? minC;
  final double? maxC;
  final int temperatureReadings;
  final List<FarmAlert> alerts;
  final int farmersActive;
  final int farmersStopped;

  /// Receiving SMS, with at least one message the provider reported delivered.
  final int farmersReached;
  final DateTime? lastBulletinAt;
  final List<Bulletin> bulletins;

  /// The Monday the next bulletin goes out, and this week's rain and temperature readings so far.
  /// With none by Sunday it is not sent ([nextBulletinAtRisk] while farmers wait for it).
  final String nextBulletinSendsOn;
  final int readingsThisWeek;
  final bool nextBulletinAtRisk;

  /// The number farmers text STOP, START, RAIN or HELP to; null while there is none.
  final String? replyNumber;

  /// Demo data only: the week's figures are a weather model's values for the area; the credit to show.
  final String? weatherModel;
}

/// The reply to POST /api/farmers/farmers/send_bulletin/: a count first, the sending only after confirm.
class BulletinReply {
  BulletinReply({
    required this.requiresConfirmation,
    required this.farmers,
    required this.queued,
    required this.alreadySent,
    required this.detail,
    this.skipped,
  });

  factory BulletinReply.fromJson(Map<String, dynamic> json) => BulletinReply(
    requiresConfirmation: json['requires_confirmation'] == true,
    farmers: json['farmers'] as int? ?? 0,
    queued: json['queued'] as int? ?? 0,
    alreadySent: json['already_sent'] as int? ?? 0,
    skipped: json['skipped'] as String?,
    detail: '${json['detail'] ?? ''}',
  );

  final bool requiresConfirmation;
  final int farmers;
  final int queued;
  final int alreadySent;

  /// Why nothing was sent, for example a week without a single reading.
  final String? skipped;
  final String detail;
}

/// One SMS to a farmer (GET /api/farmers/messages/). Sent: the SMS company accepted it; Delivered or
/// Undelivered: its delivery report said so; Failed: never handed over, [error] says why.
class SmsMessage {
  SmsMessage({
    required this.id,
    required this.kind,
    required this.language,
    required this.body,
    required this.status,
    required this.error,
    this.farmerName,
    this.createdAt,
    this.deliveredAt,
  });

  factory SmsMessage.fromJson(Map<String, dynamic> json) => SmsMessage(
    id: json['id'] as int,
    kind: '${json['kind']}',
    language: '${json['language'] ?? 'en'}',
    body: '${json['body'] ?? ''}',
    status: '${json['status']}',
    error: '${json['error'] ?? ''}',
    farmerName: json['farmer_name'] as String?,
    createdAt: _time(json['created_at']),
    deliveredAt: _time(json['delivered_at']),
  );

  final int id;

  /// Welcome, Bulletin, Alert, or Reply (an answer to a farmer's text).
  final String kind;
  final String language;
  final String body;
  final String status;
  final String error;

  /// Null once the farmer was removed (the message stays on record without the name), or for the
  /// consent question sent to a number not registered yet (joining by SMS).
  final String? farmerName;
  final DateTime? createdAt;
  final DateTime? deliveredAt;

  String get languageName => smsLanguages[language] ?? language;
}

/// One text a farmer sent to the system's number (GET /api/farmers/incoming/), and what was done.
/// The sender's number is never sent to the app: the server does not keep it.
class IncomingText {
  IncomingText({
    required this.id,
    required this.keyword,
    required this.body,
    required this.outcome,
    required this.fromRegisteredNumber,
    this.farmerName,
    this.replyStatus,
    this.receivedAt,
  });

  factory IncomingText.fromJson(Map<String, dynamic> json) => IncomingText(
    id: json['id'] as int,
    keyword: '${json['keyword']}',
    body: '${json['body'] ?? ''}',
    outcome: '${json['outcome'] ?? ''}',
    fromRegisteredNumber: json['station'] != null,
    farmerName: json['farmer_name'] as String?,
    replyStatus: json['reply_status'] as String?,
    receivedAt: _time(json['received_at']),
  );

  final int id;

  /// Stop, Start, Weather, Help or Other (farmers/messages.py KEYWORDS).
  final String keyword;
  final String body;
  final String outcome;

  /// False for a number nobody registered: kept without a station, seen by superadmins only.
  final bool fromRegisteredNumber;
  final String? farmerName;

  /// The status of the SMS that answered it; null when it was not answered.
  final String? replyStatus;
  final DateTime? receivedAt;

  /// The word the farmer sends for it, as the web apps show it.
  String get asked =>
      const {'Weather': 'RAIN', 'Stop': 'STOP', 'Start': 'START', 'Help': 'HELP', 'Join': 'JOIN', 'Yes': 'YES'}[keyword] ?? 'Other text';
}

/// GET /api/analysis/adoption/: who uses the system in rural areas, per station, against the target.
/// The target counts farmers reached: receiving SMS, with at least one message reported delivered.
class Adoption {
  Adoption({
    required this.days,
    required this.deadline,
    required this.daysLeft,
    required this.sendsOn,
    required this.totals,
    required this.rows,
    this.targetFarmers,
    this.targetPct,
  });

  factory Adoption.fromJson(Map<String, dynamic> json) {
    final target = json['target'] as Map<String, dynamic>;
    final next = json['next_bulletin'] as Map<String, dynamic>? ?? const {};
    return Adoption(
      days: (json['period'] as Map<String, dynamic>)['days'] as int? ?? 30,
      deadline: '${target['deadline']}',
      daysLeft: target['days_left'] as int? ?? 0,
      targetFarmers: target['farmers'] as int?,
      targetPct: _number(target['farmers_pct']),
      sendsOn: '${next['sends_on'] ?? ''}',
      totals: {for (final MapEntry(:key, :value) in (json['totals'] as Map<String, dynamic>).entries) key: value is num ? value.toInt() : 0},
      rows: [for (final row in json['results'] as List) AdoptionRow.fromJson(row as Map<String, dynamic>)],
    );
  }

  /// The period of the counts, in days.
  final int days;
  final String deadline;
  final int daysLeft;

  /// The number of farmers reached aimed for; null while no target is set (RURAL_PILOT_TARGET_FARMERS).
  final int? targetFarmers;
  final double? targetPct;

  /// The Monday the next bulletin goes out.
  final String sendsOn;

  /// The national counts, by the server's names: farmers_reached, sms_delivered, stations_in_use ...
  final Map<String, int> totals;
  final List<AdoptionRow> rows;

  int total(String name) => totals[name] ?? 0;
}

class AdoptionRow {
  AdoptionRow({
    required this.station,
    required this.isRural,
    required this.inUse,
    required this.bulletinAtRisk,
    required this.counts,
  });

  factory AdoptionRow.fromJson(Map<String, dynamic> json) => AdoptionRow(
    station: StationRef(
      id: json['station'] as int,
      code: '${json['station_code']}',
      name: '${json['station_name']}',
      province: '${json['province'] ?? ''}',
    ),
    isRural: json['is_rural'] == true,
    inUse: json['in_use'] == true,
    bulletinAtRisk: json['bulletin_at_risk'] == true,
    counts: {for (final MapEntry(:key, :value) in json.entries) if (value is int) key: value},
  );

  final StationRef station;
  final bool isRural;
  final bool inUse;

  /// Farmers wait for next Monday's bulletin and no rain or temperature reading came in this week.
  final bool bulletinAtRisk;

  /// The station's counts, by the server's names: farmers_active, farmers_reached, sms_delivered ...
  final Map<String, int> counts;

  int count(String name) => counts[name] ?? 0;
}

/// GET /api/farmers/setup/ (superadmins): what is in place, and still needed, for real SMS to farmers.
/// The server works it out from its own settings and records; keys and tokens are never in it.
class SmsSetup {
  SmsSetup({required this.mode, required this.realSms, required this.open, required this.items});

  factory SmsSetup.fromJson(Map<String, dynamic> json) => SmsSetup(
    mode: '${json['mode'] ?? ''}',
    realSms: json['real_sms'] == true,
    open: json['open'] as int? ?? 0,
    items: [for (final item in json['items'] as List? ?? const []) SetupItem.fromJson(item as Map<String, dynamic>)],
  );

  /// Where farmers' SMS go: none, console (the worker log), simulator (the development stand-in) or company.
  final String mode;
  final bool realSms;

  /// The number of items still to do.
  final int open;
  final List<SetupItem> items;
}

class SetupItem {
  SetupItem({required this.key, required this.label, required this.state, required this.detail, required this.owner});

  factory SetupItem.fromJson(Map<String, dynamic> json) => SetupItem(
    key: '${json['key']}',
    label: '${json['label']}',
    state: '${json['state']}',
    detail: '${json['detail'] ?? ''}',
    owner: '${json['owner'] ?? ''}',
  );

  final String key;
  final String label;

  /// done, todo, check or note.
  final String state;
  final String detail;

  /// Who does it, for an item not done.
  final String owner;

  /// The word the badge shows, as the web SMS setup page.
  String get stateName => const {'done': 'Done', 'todo': 'To do', 'check': 'Check'}[state] ?? 'Note';
}

/// The data-quality reply: the period and a row per station, lowest completeness first.
class StationHealthReport {
  StationHealthReport({required this.from, required this.to, required this.rows});

  factory StationHealthReport.fromJson(Map<String, dynamic> json) {
    final period = json['period'] as Map<String, dynamic>;
    return StationHealthReport(
      from: '${period['from']}',
      to: '${period['to']}',
      rows: [for (final row in json['results'] as List) StationHealth.fromJson(row as Map<String, dynamic>)],
    );
  }

  final String from;
  final String to;
  final List<StationHealth> rows;
}
