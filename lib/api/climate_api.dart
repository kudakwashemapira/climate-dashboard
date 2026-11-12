/// The endpoints the app calls, one method each. Every rule (station scope, access levels, the
/// observation rules RU-01 to RU-06) is applied by the server; the app only shows the answer.
///
/// | Method            | Endpoint                                   |
/// |-------------------|--------------------------------------------|
/// | version           | GET  /api/version/                         |
/// | signIn            | POST /api/instauth/login/  (FR-019)        |
/// | (token renewal)   | POST /api/users/token/refresh/             |
/// | station           | GET  /api/stations/stations/               |
/// | overview          | GET  /api/analysis/overview/               |
/// | metrics           | GET  /api/weather/metrics/                 |
/// | observations      | GET  /api/weather/observations/            |
/// | addObservation    | POST /api/weather/observations/            |
/// | deleteObservation | DELETE /api/weather/observations/{id}/     |
/// | sensors           | GET  /api/sensors/hardware/                |
/// | events            | GET  /api/events/extreme/                  |
/// | farmClimate       | GET  /api/analysis/farm-climate/           |
/// | farmers           | GET  /api/farmers/farmers/                 |
/// | addFarmer         | POST /api/farmers/farmers/                 |
/// | setReceivesSms    | PATCH /api/farmers/farmers/{id}/           |
/// | sendBulletin      | POST /api/farmers/farmers/send_bulletin/   |
/// | smsMessages       | GET  /api/farmers/messages/                |
/// | incomingTexts     | GET  /api/farmers/incoming/                |
/// | adoption          | GET  /api/analysis/adoption/               |
/// | smsSetup          | GET  /api/farmers/setup/                   |
///
/// The last eight are the rural pilot's, the same endpoints the web apps' Farm climate, Farmers, SMS
/// to farmers, Texts from farmers and Rural adoption screens use.
library;

import 'api_client.dart';
import 'models.dart';

class ClimateApi {
  ClimateApi(this.client);

  final ApiClient client;

  Future<ServerInfo> version() async => ServerInfo.fromJson(await client.get('/version/') as Map<String, dynamic>);

  /// Station sign-in. The station is named by its code (for example HRE-001); an account signs in
  /// only with the code of its own station.
  ///
  /// Returns null when the server has emailed a one-time code: call again with [otp].
  Future<User?> signIn({required String email, required String password, required String stationCode, String? otp}) async => _signedIn(
    await client.post('/instauth/login/', {
      'email': email.trim(),
      'password': password,
      'station_code': stationCode.trim(),
      if (otp != null && otp.trim().isNotEmpty) 'otp': otp.trim(),
    }, auth: false),
  );

  /// National sign-in: a superadmin of DCCES, with no station code (POST /api/users/token/, as the
  /// national web app). The server refuses a station account here, and a superadmin at [signIn].
  ///
  /// Returns null when the server has emailed a one-time code: call again with [otp].
  Future<User?> signInNational({required String email, required String password, String? otp}) async => _signedIn(
    await client.post('/users/token/', {
      'email': email.trim(),
      'password': password,
      if (otp != null && otp.trim().isNotEmpty) 'otp': otp.trim(),
    }, auth: false),
  );

  User? _signedIn(Object? body) {
    final reply = body as Map<String, dynamic>;
    if (reply['otp_required'] == true) return null;
    client.tokens = Tokens(reply['access'] as String, reply['refresh'] as String);
    return User.fromJson(reply['user'] as Map<String, dynamic>);
  }

  void signOut() => client.tokens = null;

  /// The signed-in account changes its own password. The reply carries new tokens, so this sign-in
  /// goes on while every other one ends. Returns the server's message.
  Future<String> changePassword({required String current, required String next}) async {
    final reply = await client.post('/users/me/password/', {'current_password': current, 'new_password': next}) as Map<String, dynamic>;
    client.tokens = Tokens(reply['access'] as String, reply['refresh'] as String);
    return '${reply['detail'] ?? 'Password changed.'}';
  }

  /// Emails a reset code to the address if it belongs to an active account; the reply is the same
  /// for every address. Returns the server's message.
  Future<String> requestPasswordReset(String email) async {
    final reply = await client.post('/users/password-reset/', {'email': email.trim()}, auth: false) as Map<String, dynamic>;
    return '${reply['detail']}';
  }

  /// Sets a new password with the emailed code. Every earlier sign-in of the account ends.
  Future<String> confirmPasswordReset({required String email, required String code, required String newPassword}) async {
    final reply = await client.post('/users/password-reset/confirm/', {
      'email': email.trim(),
      'code': code.trim(),
      'new_password': newPassword,
    }, auth: false) as Map<String, dynamic>;
    return '${reply['detail']}';
  }

  // [station] below is the station a national account has opened. A station account leaves it out:
  // the server limits every list and figure to the account's own station whatever is asked.

  /// The stations this account can see. For a station account that is its own station only.
  Future<ResultPage<StationRef>> stations() async => ResultPage.fromJson(
    await client.get('/stations/stations/', query: {'page_size': '200'}) as Map<String, dynamic>,
    StationRef.fromJson,
  );

  /// The dashboard figures: of one station, or of every station for a national account.
  Future<Overview> overview({int? station}) async =>
      Overview.fromJson(await client.get('/analysis/overview/', query: {'station': ?station?.toString()}) as Map<String, dynamic>);

  /// How each station has reported over the last 30 complete days, lowest completeness first.
  Future<StationHealthReport> stationHealth() async =>
      StationHealthReport.fromJson(await client.get('/analysis/data-quality/') as Map<String, dynamic>);

  Future<List<Metric>> metrics() async {
    final page = ResultPage.fromJson(
      await client.get('/weather/metrics/', query: {'page_size': '100'}) as Map<String, dynamic>,
      Metric.fromJson,
    );
    return [
      for (final metric in page.results)
        if (metric.active) metric,
    ];
  }

  /// Newest first, [pageSize] at a time. [metric] narrows the list to one metric code.
  Future<ResultPage<Observation>> observations({int page = 1, int pageSize = 25, String? metric, int? station}) async {
    final reply = await client.get(
      '/weather/observations/',
      query: {'page': '$page', 'page_size': '$pageSize', 'metric': ?metric, 'station': ?station?.toString()},
    );
    return ResultPage.fromJson(reply as Map<String, dynamic>, Observation.fromJson);
  }

  /// Adds one reading to the signed-in station, or to [station] for a national account, which the
  /// server asks to name it. The time is sent in UTC with its offset, so the server stores the moment
  /// the person picked whatever the phone's time zone.
  Future<Observation> addObservation({
    required Metric metric,
    required DateTime observedAt,
    required String value,
    String qualityFlag = 'Valid',
    String? notes,
    int? sensorId,
    int? station,
  }) async {
    final reply = await client.post('/weather/observations/', {
      'station': ?station,
      'metric': metric.code,
      'observed_at': observedAt.toUtc().toIso8601String(),
      'value': value.trim(),
      'unit': metric.unit,
      'quality_flag': qualityFlag,
      if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      'sensor': ?sensorId,
    });
    return Observation.fromJson(reply as Map<String, dynamic>);
  }

  /// Station administrators (level 2) only; the server refuses everyone else.
  Future<void> deleteObservation(int id) async => client.delete('/weather/observations/$id/');

  Future<List<Sensor>> sensors({int? station}) async {
    final page = ResultPage.fromJson(
      await client.get('/sensors/hardware/', query: {'page_size': '200', 'station': ?station?.toString()}) as Map<String, dynamic>,
      Sensor.fromJson,
    );
    return page.results;
  }

  Future<ResultPage<ExtremeEvent>> events({int page = 1, int pageSize = 50, int? station}) async => ResultPage.fromJson(
    await client.get('/events/extreme/', query: {'page': '$page', 'page_size': '$pageSize', 'station': ?station?.toString()})
        as Map<String, dynamic>,
    ExtremeEvent.fromJson,
  );

  // ---- rural pilot -----------------------------------------------------------------------------

  /// The farm climate of the signed-in station, or of [station] for a national account (which the
  /// server asks to name one).
  Future<FarmClimate> farmClimate({int? station}) async =>
      FarmClimate.fromJson(await client.get('/analysis/farm-climate/', query: {'station': ?station?.toString()}) as Map<String, dynamic>);

  /// The station's farmers, in name order.
  Future<ResultPage<Farmer>> farmers({int page = 1, int pageSize = 50, int? station}) async => ResultPage.fromJson(
    await client.get('/farmers/farmers/', query: {'page': '$page', 'page_size': '$pageSize', 'station': ?station?.toString()})
        as Map<String, dynamic>,
    Farmer.fromJson,
  );

  /// Registers a farmer at the signed-in station, or at [station] for a national account. The number
  /// is sent as typed: the server writes it +263... and refuses one already registered. A farmer saved
  /// with [receivesSms] gets the welcome SMS at once.
  Future<Farmer> addFarmer({
    required String name,
    required String phone,
    required String language,
    required DateTime consentGivenOn,
    String? village,
    String? crops,
    bool receivesSms = true,
    int? station,
  }) async {
    final day = '${consentGivenOn.year}-${_two(consentGivenOn.month)}-${_two(consentGivenOn.day)}';
    final reply = await client.post('/farmers/farmers/', {
      'station': ?station,
      'full_name': name.trim(),
      'phone': phone.trim(),
      'language': language,
      'consent_given_on': day,
      if (village != null && village.trim().isNotEmpty) 'village': village.trim(),
      if (crops != null && crops.trim().isNotEmpty) 'main_crops': crops.trim(),
      'is_active': receivesSms,
    });
    return Farmer.fromJson(reply as Map<String, dynamic>);
  }

  /// This week's bulletin to every farmer of the station who receives SMS. Without [confirm] nothing
  /// is sent: the reply says how many farmers would get it. Station administrators (level 2) and
  /// superadmins, who name the station in the address as for an upload.
  Future<BulletinReply> sendBulletin({bool confirm = false, int? station}) async => BulletinReply.fromJson(
    await client.post('/farmers/farmers/send_bulletin/${station == null ? '' : '?station=$station'}', {if (confirm) 'confirm': true})
        as Map<String, dynamic>,
  );

  /// Stops a farmer's SMS, or starts them again: the same change as Receives SMS on the web Farmers
  /// screen (levels 1 to 3). A farmer can also do it by texting STOP or START.
  Future<Farmer> setReceivesSms(int farmer, {required bool receives}) async =>
      Farmer.fromJson(await client.patch('/farmers/farmers/$farmer/', {'is_active': receives}) as Map<String, dynamic>);

  /// Every SMS to the station's farmers, newest first.
  Future<ResultPage<SmsMessage>> smsMessages({int page = 1, int pageSize = 50, int? station}) async => ResultPage.fromJson(
    await client.get('/farmers/messages/', query: {'page': '$page', 'page_size': '$pageSize', 'station': ?station?.toString()})
        as Map<String, dynamic>,
    SmsMessage.fromJson,
  );

  /// Every text the station's farmers sent and what the system did, newest first.
  Future<ResultPage<IncomingText>> incomingTexts({int page = 1, int pageSize = 50, int? station}) async => ResultPage.fromJson(
    await client.get('/farmers/incoming/', query: {'page': '$page', 'page_size': '$pageSize', 'station': ?station?.toString()})
        as Map<String, dynamic>,
    IncomingText.fromJson,
  );

  /// The rural adoption report over the last [days] days: rural pilot stations only unless [ruralOnly]
  /// is false. A station account gets its own station; a national account names one with [station].
  Future<Adoption> adoption({int days = 30, bool ruralOnly = true, int? station}) async => Adoption.fromJson(
    await client.get(
          '/analysis/adoption/',
          query: {'days': '$days', if (ruralOnly) 'rural': 'true', 'station': ?station?.toString()},
        )
        as Map<String, dynamic>,
  );

  /// What is in place, and still needed, for farmers to get real SMS (national accounts).
  Future<SmsSetup> smsSetup() async => SmsSetup.fromJson(await client.get('/farmers/setup/') as Map<String, dynamic>);

  static String _two(int n) => n.toString().padLeft(2, '0');
}
