import 'package:flutter/foundation.dart';

/// The API address given at build time, for example
/// `flutter run --dart-define=API_BASE=https://dcces-inst.zchpc.ac.zw/api`.
const _apiBaseFromBuild = String.fromEnvironment('API_BASE');

/// Where the app finds the API. The endpoints are the ones the station web app uses.
///
/// Without `API_BASE`:
/// - in a browser (the simulation) the page's own address is used. The Flutter dev server forwards
///   `/api/` to the backend on localhost:8000 (`web_dev_config.yaml`), so the browser never makes a
///   cross-origin request and the backend needs no change;
/// - on the Android emulator the host machine is 10.0.2.2;
/// - anywhere else localhost:8000.
String apiBase() {
  if (_apiBaseFromBuild.isNotEmpty) return _apiBaseFromBuild;
  if (kIsWeb) return '${Uri.base.origin}/api';
  if (defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:8000/api';
  return 'http://localhost:8000/api';
}
