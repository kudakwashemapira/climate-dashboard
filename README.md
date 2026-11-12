# Climate Dashboard: Flutter phone app (simulation)

A phone app for station staff and for national administrators (the DCCES superadmins). It calls the same API endpoints as the two web apps, so every rule is still applied by the backend: station isolation, access levels, the observation rules RU-01 to RU-06 and the one-time sign-in code. The app adds no endpoint and needs no change to the backend.

**Scope.** This is a simulation, built on request on 14 October 2026. It is **not part of release 1.0.0**. CD-2.04 section 1.2 leaves native mobile apps out of scope, and CD-3.05 section 7 does not require phone support. Before a mobile app is planned, it needs a change request (CD-3.11). See `backend/docs/PILOT_READINESS.md`, sections 8 and 10.

## Station and national accounts

The first version (14 October 2026) served station accounts only. That was a scoping choice made when it was built, not a limit of the system: CD-3.05 places the national superadmins and DCCES leadership at a desktop browser and the station staff in the field, and CD-2.04 leaves mobile apps out of scope, so only the field persona was simulated. The API already had everything a national account needs: its own sign-in (`POST /api/users/token/`), figures over every station, and `?station=` to look at one station.

Since 21 October the sign-in page offers **Station** or **National**:

- **Station**: station code, email and password, as before. The server keeps the account to its own station.
- **National**: email and password only, no station code. The account sees every station: national figures, a Stations tab with how each station reports, and the alerts of every station. A station opens in the same five tabs a station account has, with that station named in each request, as the national web app does. A national administrator (access level 1) can add a reading there; the form names the station it is for.

The server refuses a national account at Station and a station account at National with the same "Invalid credentials." The page then names the other choice, so the person can find it.

## What it does

| Screen | What the user sees | Endpoint |
|---|---|---|
| Sign in | Station or National. Station: station code, email, password. National: email and password. Then the emailed 6-digit code where the server asks for one | `GET /api/version/`, `POST /api/instauth/login/` (station), `POST /api/users/token/` (national) |
| Overview | The station's figures for the last 30 days, readings per day, calibration status, last upload | `GET /api/analysis/overview/` |
| Readings | The station's readings, newest first, 25 at a time, filtered by metric | `GET /api/weather/metrics/`, `GET /api/weather/observations/` |
| Add reading | Metric, value, time, sensor, quality flag, note. The server's messages appear under the fields. Shown to access levels 1 to 3 only. | `GET /api/sensors/hardware/`, `POST /api/weather/observations/` |
| Sensors | Each sensor with its calibration status | `GET /api/sensors/hardware/` |
| Alerts | Extreme weather events, ongoing ones first | `GET /api/events/extreme/` |
| Farmers (rural pilot), view Farm climate | The week's rain against the normal, rain days, the season's rain, the temperature range and the alerts in force; this week's SMS bulletin in English, Shona or Ndebele (drafts marked); the station's farmers and how many are reached (an SMS reported delivered); a warning when this week has no reading yet, so next Monday's bulletin would not go out; the number farmers text RAIN or STOP to. "Send this week's bulletin" for access levels 1 and 2: a count first, then a confirmation. The same endpoints as the web Farm climate and Farmers screens. | `GET /api/analysis/farm-climate/`, `GET /api/farmers/farmers/`, `POST /api/farmers/farmers/send_bulletin/` |
| Farmers: stop or start a farmer's SMS | Tapping a farmer asks "Stop SMS to ...?" (or "Start SMS ... again?") and changes Receives SMS, as the web Farmers screen does when the farmer asks. Access levels 1 to 3. A farmer can also text STOP or START | `PATCH /api/farmers/farmers/{id}/` |
| Farmers, view SMS to farmers | Every SMS to the station's farmers, newest first: kind, farmer, text, language, Sent (the SMS company has it), Delivered (reported on the phone, with the time), Undelivered or Failed with the reason | `GET /api/farmers/messages/` |
| Farmers, view Texts from farmers | Every text the station's farmers sent: RAIN, STOP, START, HELP or another text, the words, what the system did and the answer's status; a number nobody registered shows as such (superadmins only) | `GET /api/farmers/incoming/` |
| Register farmer | Name, mobile number (as typed; the server writes it +263…), SMS language, village, crops, consent date, Receives SMS. The server's messages appear under the fields. Shown to access levels 1 to 3 only. | `POST /api/farmers/farmers/` |
| Account | Name, role, access level, station (or "Every station"); change password; sign out | `POST /api/users/me/password/` |
| National: Overview | The figures of every station: how many are active, readings, completeness, calibration, alerts | `GET /api/analysis/overview/` |
| National: Stations | Each station's completeness over the last 30 complete days, lowest first, with its last reading, overdue and due calibrations, suspect and rejected readings; a search by code, name or province. Tapping a station opens it. | `GET /api/analysis/data-quality/` |
| National: Alerts | Extreme weather events of every station, each naming its station; tapping one opens the station | `GET /api/events/extreme/`, `GET /api/stations/stations/` |
| National: Rural | The SMS setup of the web app on top (where farmers' SMS go, and each item still to do or to check, with who does it), then the rural adoption report of the web app, last 30 days, rural pilot stations only: farmers reached (an SMS reported delivered) against the target, days to the deadline, SMS delivered, farmers who texted, bulletins at risk, stations in use; a warning when no delivery report comes back; each rural station, fewest farmers first, with its farmers, SMS, staff sign-ins and readings this week. Tapping a station opens it | `GET /api/farmers/setup/`, `GET /api/analysis/adoption/?days=30&rural=true` |
| National: a station | Its Overview, Readings, Sensors, Alerts and Farmers (with SMS to farmers and Texts from farmers), and Add reading and Register farmer for it | the station screens' endpoints with `?station=<id>`; the new reading's and farmer's body carries `station` |
| Forgot your password? | From the sign-in page: the email, then the emailed code and a new password | `POST /api/users/password-reset/`, `/password-reset/confirm/` |

On Android, Back on another tab returns to Overview, and Back on the code step returns to the account form; only Back on Overview or the sign-in page leaves the app. In a station a national account opened, Back on its Overview returns to the national tabs, and the arrow at the top returns there from any tab.

When the access token expires, the app renews it once with `POST /api/users/token/refresh/` and repeats the call. If the refresh token is refused too, the user is signed out.

The figures are the server's. The app draws what `/api/analysis/` returns and never recalculates a figure (CD-3.02 section 4.6).

## Run the simulation in a browser

You need the Docker stack running (`docker compose up -d` in the project folder) and Flutter 3.47 or later. In PowerShell, from the project folder:

```
.\mobile\run.ps1
```

Chrome opens `http://localhost:8083` with the app drawn inside a phone outline, and the terminal shows the app's log (below). The keys work as with `flutter run`: `r` hot reload, `R` hot restart, `q` quit. The first start compiles for about a minute.

`run.ps1` does what `flutter run -d chrome` does, and also:
- stops with a clear message when the backend does not answer on port 8000;
- always uses port 8083, so the address stays the same;
- frees port 8083 when an earlier `flutter run` left its dev server running there, and closes the browser window that server had opened;
- starts on the next free port when another program uses 8083;
- gets the packages only when `pubspec.yaml` changed;
- saves everything `flutter run` prints in `mobile/logs/mobile-<date>-<time>.log` (not in git).

Options: `-Device android` (the phone connected by USB, below), `-Port 8090`, `-Device edge`, `-Device web-server` (no browser opened; the app's log then appears in the browser's developer console, F12), `-Full` (show every line of the Flutter tool too), `-Replay logs\mobile-<date>-<time>.log` (show only the app's lines of a saved log). Plain `flutter run` inside `mobile/` works too, whatever holds port 8083: see below.

On the development stack, sign in with:

| Field | Station | National |
|---|---|---|
| Station code | `HRE-001` | not asked |
| Email | `harare.station@dcces.zchpc.ac.zw` | `superadmin@dcces.zchpc.ac.zw` |
| Password | `DEMO_STATION_PASSWORD` from `.env` | `DJANGO_SUPERUSER_PASSWORD` from `.env` |

Every demo station has an account. `docker compose exec backend python manage.py station_accounts` lists each station code with its sign-in address. On a development machine no one-time code is asked; staging and production always ask for it.

How the browser reaches the API: the app calls `/api/` on its own address, and the Flutter dev server forwards those calls to `http://localhost:8000` (`web_dev_config.yaml`). The browser therefore makes no cross-origin request, and the backend needs no CORS setting. The forwarding works in debug mode only, which is the default of `flutter run`. With `--release`, the dev server does not forward `/api/`, and the app reports that the address does not answer as the API.

### Plain `flutter run` and "Failed to bind web development server"

`flutter run` (or `flutter run -d chrome`, `-d edge`) inside `mobile/` starts the app on a free port and opens the browser on it, for example `http://localhost:65351`. The calls to `/api/` are forwarded on any port, so the app works the same.

Until 21 October 2026 `web_dev_config.yaml` fixed the port at 8083. Then a plain `flutter run` stopped with this whenever port 8083 was already taken:

```
Failed to bind web development server:
SocketException: Failed to create server socket (OS Error: Only one usage of each socket address
(protocol/network address/port) is normally permitted, errno = 10048), address = localhost, port = 8083
```

Flutter does not try another port. The port is usually held by an earlier dev server that is still running: a `flutter run` in another terminal, `run.ps1`, or one that was stopped without `q`. That last case leaves its Dart process (`dartvm.exe`) holding the port. The config now fixes no port, so a plain `flutter run` always starts. `run.ps1` still uses 8083 (`--web-port`) and clears a dev server left there.

To see what holds a port and stop it, in PowerShell:

```
Get-NetTCPConnection -LocalPort 8083 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }
Stop-Process -Id <the process id>
```

Stop it only when it is `dartvm`, a leftover Flutter dev server. Leave any other program running.

### The app's log

In debug builds the app writes one line per event to the `flutter run` console; a release build writes nothing.

```
10:52:36 [app] Climate Dashboard started; API at http://localhost:8083/api
10:52:39 [api] GET /api/version/ 200 (2209 ms)
10:53:02 [api] POST /api/instauth/login/ 200 (412 ms)
10:53:02 [auth] signed in at station HRE-001, Station administrator (access level 2)
10:53:03 [api] GET /api/analysis/overview/ 200 (288 ms)
10:53:10 [nav] tab Readings
10:53:41 [api] POST /api/weather/observations/ 400 (95 ms): Value 99 is outside the range -20 to 55 for TEMP_C.
10:53:52 [readings] reading #87190 saved: TEMP_C 18.50, Valid
```

A line never carries a password, a one-time code, a token, an email address or a request body (`test/api_client_test.dart` checks this). `run.ps1` shows these lines and any error. It hides the Flutter tool's own messages, including the debugger's retries while it attaches to Chrome ("Timed out finding an execution context", "Error calling Runtime.evaluate"). Those retries are normal and the app starts after them. The log file keeps every line.

## Run the simulation without a device

`tool/simulate.dart` goes through a phone session with the app's own API classes against the running backend and prints each step:

```
cd mobile
dart run tool/simulate.dart --password station
dart run tool/simulate.dart --station BYO-001 --email bulawayo.station@dcces.zchpc.ac.zw --password station
dart run tool/simulate.dart --national --password admin
```

Add `--verbose` to print each API call as the app logs it. It reads the server version, checks that another station's code is refused, signs in, checks that the account sees only its own station, opens every tab, has an out-of-range value refused, adds a reading and finds it in the list, renews an expired token, removes the test reading again (`--keep` leaves it), and signs out. It exits with 1 if a step fails.

With `--national` it signs in as `superadmin@dcces.zchpc.ac.zw` (or `--email`): it checks that the station sign-in refuses the account, signs in nationally, reads the national figures, checks that the Stations tab lists as many stations as the overview counts and lowest completeness first, labels every alert with its station, opens one station (`--station`, or the one with the lowest completeness) and checks its figures, sensors and alerts are that station's only, has a reading without a station refused, adds one for the station, finds it in the station's list and the national total, removes it again and signs out.

Other options: `--base` (default `http://localhost:8000/api`), `--otp` (the emailed code on staging). It is for development and staging only, never production.

## Tests

```
flutter analyze
flutter test
```

`test/api_client_test.dart` covers the sign-in with and without the one-time code, token renewal, the end of a session, and the error shapes of the API. `test/widget_test.dart` covers the sign-in page, the Station and National choice included. `test/layout_test.dart` opens every tab and the reading form on a 320 by 640 and a 392 by 820 screen and fails on any overflow, for a station account and for a national one (its Stations search, the station named on each alert, a station opened with `?station=` in each request, and the reading form naming the station); it also checks that Back on another tab returns to Overview. The tests use a fake server, not the backend.

## On an Android phone (USB)

Tried on 14 October 2026 with an Honor 50 (NTH-NX9, Android 13).

1. On the phone: Settings > About phone, tap the build number seven times to unlock Developer options. In Settings > System > Developer options turn on **USB debugging** and, on Honor and Huawei phones, **Install via USB**.
2. Connect the phone by USB, choose "File transfer" if it asks, and accept **Allow USB debugging** for this computer. `flutter devices` then lists the phone.
3. With the Docker stack running, in PowerShell from the project folder:

```
.\mobile\run.ps1 -Device android
```

The launcher finds the phone and forwards the phone's port 8000 to this computer over the USB cable (`adb reverse tcp:8000 tcp:8000`). The app on the phone then reaches the backend at `http://localhost:8000/api`, so no Wi-Fi address, firewall rule or `ALLOWED_HOSTS` change is needed. It builds the app, installs it as **Climate Dashboard**, starts it, and shows its log here. Android's own system messages are hidden; the log file keeps them.

The first build on a computer takes long: on this machine 13 minutes, because Gradle downloaded itself, the Android NDK, Android Platform 36 and CMake. Later builds took about a minute and a half.

Good to know:
- The forwarding ends when the cable is unplugged. Run the launcher again after reconnecting.
- The app stays installed on the phone. Opened without the cable and the launcher, it cannot reach the development backend and says "The server could not be reached".
- A debug build allows plain HTTP for the development backend. A release build allows it only when `API_BASE` is an `http://` address (the Wi-Fi download below); otherwise it keeps Android's default and reaches staging and production over HTTPS only: `--dart-define=API_BASE=https://dcces-inst.zchpc.ac.zw/api`. Both are set in `android/app/build.gradle.kts` (`usesCleartextTraffic`).
- With several phones connected: `.\mobile\run.ps1 -Device <id>`, the id from `flutter devices`.

## Download onto a phone over Wi-Fi (no cable)

Tried on 3 November 2026: a release APK of 51 MB, built in 7 minutes after a change to the Gradle file. The phone downloads the app from this computer and keeps using this computer's backend, with no cable and no Developer options.

1. Once, in PowerShell as administrator, let phones on the same network reach port 80:

```
New-NetFirewallRule -DisplayName 'Climate Dashboard phone app (HTTP 80)' -Direction Inbound -Protocol TCP -LocalPort 80 -RemoteAddress LocalSubnet -Profile Private -Action Allow
```

   The Wi-Fi must be a Private network in Windows settings. Remove the rule when you are done: `Remove-NetFirewallRule -DisplayName 'Climate Dashboard phone app (HTTP 80)'`.
2. Add this computer's address to `ALLOWED_HOSTS` in `.env` (for example `ALLOWED_HOSTS=localhost,127.0.0.1,172.20.10.2`) and run `docker compose up -d`.
3. Build:

```
.\mobile\build-apk.ps1
```

   It finds this computer's address, builds a release APK whose API is `http://<address>/api` (through nginx on port 80), copies it to `downloads\climate-dashboard.apk` and checks steps 1 and 2. nginx serves that folder in development only (`docker-compose.override.yml`, `backend/deploy/nginx/downloads.dev.conf`); on the server nothing is served there.
4. On the phone, on the same Wi-Fi, open `http://<address>/downloads/climate-dashboard.apk` in the browser, open the downloaded file, allow the browser to install unknown apps when Android asks, and install. It replaces an app installed by `run.ps1`: both are signed with the debug key.

The address is built into the app. On another network, or when the computer gets another address, repeat steps 2 to 4. Anyone on the same Wi-Fi can open the dashboard while the firewall rule is on.

### Over Wi-Fi or on an emulator with flutter run

Without the USB forwarding, Django refuses host names it does not know (HTTP 400). Add the address the phone uses to `ALLOWED_HOSTS` in `.env` and run `docker compose up -d`:
- a phone on the same Wi-Fi: the computer's address, then `flutter run --dart-define=API_BASE=http://<computer address>:8000/api`;
- the Android emulator: `10.0.2.2`, which the app uses by default on Android.

## Design

The app uses the colour tokens and status tones of the two web apps (`lib/theme.dart`, copied from `frontend/*/src/index.css`), in a light and a dark theme, so the three apps read as one product (CD-3.05 section 5). The product mark (`lib/widgets/product_mark.dart`) is the same drawing as the web apps' `ProductMark` and favicon; the launcher icon is made from it.

- A status is shown by a word and an icon as well as a colour (CD-3.05 section 6).
- Percent tiles take the tone of the web dashboard: 95 % or more good, 80 % or more needs attention, below that critical. The figures themselves are the server's.
- Numbers use tabular figures, so columns of digits line up.
- The layout test checks every screen on a 320 by 640 phone.

Launcher icon: the source images are in `assets/icon/` (rendered from the mark at 1024 by 1024: the full icon, a square one for iOS, and the adaptive icon's foreground and background for Android 8 and later). After changing them, run `dart run flutter_launcher_icons`; the settings are in `flutter_launcher_icons.yaml`.

## Security choices
- Tokens are held in memory only. Closing the app signs the user out, and nothing about the session is written to the phone.
- The app never reads or shows station coordinates (ADR-003).
- A station account never names a station in a request after sign-in: the server limits every list to the account's station (ADR-002), and ignores a `?station=` it is sent. A national account names the station it opened, as the national web app does.
- Access levels come from the server. The app hides "Add reading" from level 4, and the server refuses it anyway.

## Layout
```
mobile/
  lib/
    api/          api_client.dart (HTTP, tokens, errors), climate_api.dart (one method per endpoint), models.dart.
                  Plain Dart: no Flutter import, so tool/simulate.dart can use the same code.
    screens/      sign in, home (a station's tabs), national home (Overview, Stations, Alerts), stations,
                  overview, readings, add reading, sensors, alerts, password screens
    widgets/      phone_frame.dart (the phone outline in a wide browser), common.dart (loader, badges, dates),
                  product_mark.dart (the Climate Dashboard mark), account_sheet.dart
    theme.dart    the colour tokens and status tones of the web apps, light and dark
    config.dart   where the API is: API_BASE, or the page's own address, or 10.0.2.2 on Android
    main.dart
  test/           API client, sign-in page and layout tests
  tool/           simulate.dart
  run.ps1       starts the app in Chrome or on a USB phone, frees a stale port, shows and saves the app's log
  build-apk.ps1 builds the APK for a phone on this computer's Wi-Fi and puts it in downloads/ for nginx
  log.dart      (in lib/) the app's log lines, debug builds only
  logs/         saved logs of run.ps1 (not in git)
  web_dev_config.yaml   dev server settings: forwards /api/ to the backend; no fixed port (run.ps1 uses 8083)
  assets/icon/  launcher icon sources; flutter_launcher_icons.yaml makes the icons from them
  android/ ios/ web/    platform projects generated by flutter create
```

## What a real mobile release would still need
- A change request and a decision on scope (CD-3.11), including which personas use the phone: station staff, national administrators, or both, as this simulation now does.
- Keeping the user signed in would need the platform keystore (for example `flutter_secure_storage`) and a security review (CD-3.06).
- Readings entered without a network, kept on the phone and sent later, if stations need that.
- Notifications for new extreme weather alerts.
- App signing, store listings, and tests on real devices.
- If the web build is ever hosted on its own address, a CORS decision for the API.
