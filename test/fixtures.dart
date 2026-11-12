/// The account the fake servers of the tests sign in, shaped as the sign-in reply's `user`.
const userJson = {
  'id': 3,
  'email': 'harare.station@example.org',
  'first_name': 'Demo',
  'last_name': 'Station Admin',
  'is_superuser': false,
  'role': {'name': 'Station administrator', 'level': 2},
  'station': {'id': 12, 'station_code': 'HRE-001', 'name': 'Harare Belvedere', 'station_type': 'Climate reference'},
};

/// GET /api/analysis/farm-climate/ as the backend shapes it (analysis/services.py farm_climate).
const farmClimateJson = {
  'station': 12,
  'station_code': 'HRE-001',
  'station_name': 'Harare Belvedere',
  'province': 'Harare',
  'status': 'Active',
  'is_rural': true,
  'period': {'from': '2026-10-27', 'to': '2026-11-02', 'days': 7},
  'rain': {'total_mm': 12.4, 'readings': 3, 'rain_days': 2, 'normal_mm': 7.2, 'vs_normal': 'above'},
  'season': {'from': '2026-10-01', 'to': '2026-11-02', 'total_mm': 21.4, 'readings': 9, 'normal_mm': 33.0, 'vs_normal': 'below'},
  'temperature': {'min_c': 17.2, 'max_c': 31.6, 'mean_c': 24.4, 'readings': 7},
  'daily_rain': <Object>[],
  'alerts': [
    {
      'id': 24,
      'event_type': 'Flood',
      'severity': 'High',
      'started_at': '2026-11-02T04:00:00Z',
      'alert_issued': true,
      'description': null,
      'names': {
        'en': {'event': 'Flood', 'severity': 'High'},
        'sn': {'event': 'Mafashamo', 'severity': 'Yakakwira'},
        'nd': {'event': 'Izikhukhula', 'severity': 'Phezulu'},
      },
    },
  ],
  'risks': <Object>[],
  'farmers': {
    'active': 2,
    'opted_out': 1,
    'reached': 1,
    'by_language': <Object>[],
  },
  'last_bulletin_at': null,
  'next_bulletin': {'from': '2026-11-02', 'to': '2026-11-08', 'sends_on': '2026-11-09', 'readings': 0, 'at_risk': true},
  'reply_number': '32123',
  'bulletin': [
    {
      'language': 'en',
      'name': 'English',
      'reviewed': true,
      'sent_as': 'en',
      'text': 'Harare Belvedere weather 27/10-2/11: rain 12 mm on 2 day(s), above normal (7.2 mm).',
    },
    {
      'language': 'sn',
      'name': 'Shona',
      'reviewed': false,
      'sent_as': 'en',
      'text': 'Mamiriro ekunze Harare Belvedere 27/10-2/11: mvura 12 mm (mazuva 2).',
    },
    {
      'language': 'nd',
      'name': 'Ndebele',
      'reviewed': false,
      'sent_as': 'en',
      'text': 'Isimo sezulu Harare Belvedere 27/10-2/11: imvula 12 mm (insuku 2).',
    },
  ],
};

/// A national superadmin as the sign-in reply gives it: no role and no station.
const superadminJson = {
  'id': 1,
  'email': 'superadmin@example.org',
  'first_name': '',
  'last_name': '',
  'is_superuser': true,
  'role': null,
  'station': null,
};

/// GET /api/farmers/messages/ rows: a delivered welcome and an undelivered bulletin.
const smsMessagesJson = [
  {
    'id': 41,
    'station': 12,
    'farmer': 5,
    'farmer_name': 'Nomsakhona Ncube-Mlilo Sibanda',
    'kind': 'Welcome',
    'language': 'en',
    'body': 'Welcome to DCCES climate updates from Harare Belvedere station. Every Monday: the rain and temperature measured there.',
    'status': 'Delivered',
    'provider': 'africastalking',
    'error': '',
    'created_at': '2026-11-02T06:00:00Z',
    'sent_at': '2026-11-02T06:00:02Z',
    'delivered_at': '2026-11-02T06:00:09Z',
  },
  {
    'id': 42,
    'station': 12,
    'farmer': 6,
    'farmer_name': 'Peter Kapfunde',
    'kind': 'Bulletin',
    'language': 'en',
    'body': 'Harare Belvedere weather 26/10-1/11: rain 12 mm on 2 day(s), above normal (7.2 mm). No weather alerts.',
    'status': 'Undelivered',
    'provider': 'africastalking',
    'error': "Africa's Talking: AbsentSubscriber",
    'created_at': '2026-11-02T04:00:00Z',
    'sent_at': '2026-11-02T04:00:03Z',
    'delivered_at': null,
  },
];

/// GET /api/farmers/incoming/ rows: RAIN answered, and a text from a number nobody registered.
const incomingJson = [
  {
    'id': 7,
    'station': 12,
    'farmer': 5,
    'farmer_name': 'Nomsakhona Ncube-Mlilo Sibanda',
    'keyword': 'Weather',
    'body': 'Mvura',
    'outcome': "Answered with last week's rain and temperature.",
    'reply': 43,
    'reply_status': 'Sent',
    'reply_body': 'Harare Belvedere weather ...',
    'received_at': '2026-11-03T07:30:00Z',
  },
  {
    'id': 8,
    'station': null,
    'farmer': null,
    'farmer_name': null,
    'keyword': 'Other',
    'body': 'JOIN',
    'outcome': 'Not answered: the number is not registered at any station.',
    'reply': null,
    'reply_status': null,
    'reply_body': null,
    'received_at': '2026-11-03T08:00:00Z',
  },
];

/// GET /api/analysis/adoption/?days=30&rural=true as the backend shapes it (analysis/services.py adoption).
const adoptionJson = {
  'period': {'from': '2026-10-04', 'to': '2026-11-03', 'days': 30},
  'target': {'deadline': '2026-11-30', 'days_left': 27, 'farmers': 40, 'farmers_pct': 2.5},
  'next_bulletin': {'from': '2026-11-02', 'to': '2026-11-08', 'sends_on': '2026-11-09'},
  'totals': {
    'stations': 1,
    'rural_stations': 1,
    'stations_in_use': 1,
    'stations_bulletin_at_risk': 1,
    'farmers_active': 2,
    'farmers_new': 2,
    'farmers_opted_out': 1,
    'farmers_reached': 1,
    'farmers_texted': 1,
    'sms_sent': 2,
    'sms_delivered': 1,
    'sms_undelivered': 1,
    'sms_awaiting': 0,
    'sms_failed': 0,
    'accounts_signed_in': 1,
    'readings_entered': 14,
  },
  'count': 1,
  'next': null,
  'previous': null,
  'results': [
    {
      'station': 21,
      'station_code': 'MRD-001',
      'station_name': 'Marondera Grasslands',
      'province': 'Mashonaland East',
      'status': 'Active',
      'is_rural': true,
      'farmers_active': 2,
      'farmers_opted_out': 1,
      'farmers_new': 2,
      'farmers_reached': 1,
      'farmers_texted': 1,
      'sms_sent': 2,
      'sms_delivered': 1,
      'sms_undelivered': 1,
      'sms_awaiting': 0,
      'sms_failed': 0,
      'sms_queued': 0,
      'accounts': 1,
      'accounts_signed_in': 1,
      'last_sign_in_at': '2026-11-03T06:00:00Z',
      'readings_entered': 14,
      'readings_this_week': 0,
      'bulletin_at_risk': true,
      'in_use': true,
    },
  ],
};

/// GET /api/farmers/setup/ on a development server with the SMS simulator and no reply number.
const smsSetupJson = {
  'environment': 'development',
  'mode': 'simulator',
  'real_sms': false,
  'open': 1,
  'items': [
    {
      'key': 'provider',
      'label': 'SMS company',
      'state': 'check',
      'detail': 'The development SMS simulator (sms-simulator), through the HTTP API settings.',
      'owner': 'DCCES and procurement open an account with a company that has an HTTP API',
    },
    {'key': 'sender', 'label': 'Sender', 'state': 'done', 'detail': 'Messages come from DCCES.', 'owner': ''},
    {
      'key': 'reply_number',
      'label': 'Number farmers text',
      'state': 'todo',
      'detail': 'None (SMS_REPLY_NUMBER): farmers cannot text STOP or RAIN.',
      'owner': 'DCCES asks the company for a two-way number or short code',
    },
  ],
};
