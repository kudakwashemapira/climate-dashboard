/// HTTP access to the Climate Dashboard API: the same endpoints the national and station apps use.
///
/// Plain Dart (no Flutter import), so the app, the tests and `tool/simulate.dart` share it.
/// Tokens are kept in memory only: closing the app signs the user out, and nothing about the
/// session is written to the device.
library;

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

/// A refusal or failure from the API, in words a person can act on.
class ApiException implements Exception {
  ApiException(this.status, this.message, {this.fields = const {}});

  /// The HTTP status, or 0 when the server could not be reached.
  final int status;
  final String message;

  /// Field name to messages, from a 400 reply (for example `value`, `observed_at`).
  final Map<String, List<String>> fields;

  @override
  String toString() => message;
}

/// The two tokens of one sign-in (SimpleJWT). The access token is short-lived and is renewed
/// with the refresh token when the API answers 401.
class Tokens {
  Tokens(this.access, this.refresh);

  String access;
  String refresh;
}

class ApiClient {
  ApiClient(String base, {http.Client? client, this.timeout = const Duration(seconds: 30)})
    : base = base.endsWith('/') ? base.substring(0, base.length - 1) : base,
      _http = client ?? http.Client();

  /// The API root, for example `http://localhost:8000/api`.
  final String base;
  final Duration timeout;
  final http.Client _http;

  Tokens? tokens;

  /// Called when the refresh token is refused too: the user has to sign in again.
  void Function()? onSessionExpired;

  /// Receives one line per call: method, address, status and time taken, and the server's message
  /// on a refusal. Never a header, a body or a token. The app sets it in debug builds only.
  void Function(String line)? log;

  Future<bool>? _refreshing;

  bool get signedIn => tokens != null;

  Future<dynamic> get(String path, {Map<String, String>? query}) => _send('GET', path, query: query);

  Future<dynamic> post(String path, Object body, {bool auth = true}) => _send('POST', path, body: body, auth: auth);

  Future<dynamic> patch(String path, Object body) => _send('PATCH', path, body: body);

  Future<dynamic> delete(String path) => _send('DELETE', path);

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
    bool auth = true,
    bool retried = false,
  }) async {
    var uri = Uri.parse('$base$path');
    if (query != null && query.isNotEmpty) uri = uri.replace(queryParameters: query);
    final request = http.Request(method, uri)
      ..headers['Accept'] = 'application/json'
      ..followRedirects = false;
    if (auth && tokens != null) request.headers['Authorization'] = 'Bearer ${tokens!.access}';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    final address = '${uri.path}${uri.hasQuery ? '?${uri.query}' : ''}';
    final clock = Stopwatch()..start();
    final http.Response reply;
    try {
      reply = await http.Response.fromStream(await _http.send(request).timeout(timeout));
    } on Exception catch (error) {
      log?.call('$method $address failed after ${clock.elapsedMilliseconds} ms: ${error.runtimeType}');
      throw ApiException(0, 'The server could not be reached. Check the connection and try again.');
    }
    final took = '${reply.statusCode} (${clock.elapsedMilliseconds} ms)';

    if (reply.statusCode == 401 && auth && tokens != null && !retried) {
      log?.call('$method $address $took: access token expired, renewing it');
      if (await _refresh()) return _send(method, path, query: query, body: body, auth: auth, retried: true);
      tokens = null;
      log?.call('the refresh token was refused too: session ended');
      onSessionExpired?.call();
      throw ApiException(401, 'Your session has ended. Sign in again.');
    }
    final data = _decode(reply);
    if (reply.statusCode >= 200 && reply.statusCode < 300) {
      if (data == null && reply.bodyBytes.isNotEmpty) {
        // For example a web page: the address leads somewhere, but not to the API
        log?.call('$method $address $took: the reply is not JSON, so this address is not the API');
        throw ApiException(reply.statusCode, 'The server at $base did not answer as the Climate Dashboard API. Check the address.');
      }
      log?.call('$method $address $took');
      return data;
    }
    final refused = refusal(reply.statusCode, data);
    log?.call('$method $address $took: ${refused.message}');
    throw refused;
  }

  /// One refresh at a time: calls that fail together wait for the same new token.
  Future<bool> _refresh() => _refreshing ??= _renew().whenComplete(() => _refreshing = null);

  Future<bool> _renew() async {
    final current = tokens;
    if (current == null) return false;
    try {
      final reply = await post('/users/token/refresh/', {'refresh': current.refresh}, auth: false) as Map<String, dynamic>;
      current.access = reply['access'] as String;
      if (reply['refresh'] is String) current.refresh = reply['refresh'] as String; // when the server rotates it
      return true;
    } on ApiException {
      return false;
    }
  }

  static dynamic _decode(http.Response reply) {
    if (reply.bodyBytes.isEmpty) return null;
    try {
      return jsonDecode(utf8.decode(reply.bodyBytes));
    } on FormatException {
      return null; // a proxy error page, for example
    }
  }

  /// The API's error bodies have one shape (CD-3.04): `{"detail": "..."}`, or field to messages on a 400.
  static ApiException refusal(int status, dynamic data) {
    if (data is Map && data['detail'] is String) return ApiException(status, data['detail'] as String);
    if (status == 400 && data is Map) {
      final fields = <String, List<String>>{
        for (final entry in data.entries)
          '${entry.key}': entry.value is List ? [for (final m in entry.value as List) '$m'] : ['${entry.value}'],
      };
      final general = fields['non_field_errors'] ?? fields['detail'];
      final first = general ?? (fields.values.isEmpty ? null : fields.values.first);
      return ApiException(status, first?.first ?? 'The server did not accept this.', fields: fields);
    }
    return ApiException(status, switch (status) {
      403 => 'Your access level does not allow this.',
      404 => 'Not found. It may have been removed.',
      429 => 'Too many attempts. Wait a minute and try again.',
      >= 500 => 'The server had a problem. Try again later.',
      _ => 'The server answered HTTP $status.',
    });
  }
}
