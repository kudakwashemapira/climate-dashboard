import 'package:flutter/foundation.dart';

/// The app's log, printed in the `flutter run` console (and copied to `logs/` by `run.ps1`).
///
/// Debug builds only: a release build prints nothing. A line never carries a password, a
/// one-time code, a token, an email address or a request body (NFR-008).
void appLog(String area, String message) {
  if (!kDebugMode) return;
  final t = DateTime.now();
  String two(int n) => n.toString().padLeft(2, '0');
  debugPrint('${two(t.hour)}:${two(t.minute)}:${two(t.second)} [$area] $message');
}
