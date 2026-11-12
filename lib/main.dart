import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'api/climate_api.dart';
import 'api/models.dart';
import 'config.dart';
import 'log.dart';
import 'screens/home_screen.dart';
import 'screens/national_home_screen.dart';
import 'screens/sign_in_screen.dart';
import 'theme.dart';
import 'widgets/phone_frame.dart';

void main() {
  final client = ApiClient(apiBase())..log = (line) => appLog('api', line);
  appLog('app', 'Climate Dashboard started; API at ${client.base}');
  runApp(ClimateApp(api: ClimateApi(client)));
}

class ClimateApp extends StatefulWidget {
  const ClimateApp({super.key, required this.api});

  final ClimateApi api;

  @override
  State<ClimateApp> createState() => _ClimateAppState();
}

class _ClimateAppState extends State<ClimateApp> {
  final _messenger = GlobalKey<ScaffoldMessengerState>();
  final _navigator = GlobalKey<NavigatorState>();
  User? _user;

  /// Back to the first page, under which the sign-in page appears: a station a national account
  /// opened is a page of its own and would otherwise stay above it.
  void _closePages() => _navigator.currentState?.popUntil((route) => route.isFirst);

  @override
  void initState() {
    super.initState();
    widget.api.client.onSessionExpired = () {
      if (_user == null) return;
      appLog('auth', 'session ended: sign in again');
      _closePages();
      setState(() => _user = null);
      _messenger.currentState?.showSnackBar(const SnackBar(content: Text('Your session has ended. Sign in again.')));
    };
  }

  void _signedIn(User user) {
    appLog(
      'auth',
      user.isSuperuser
          ? 'signed in nationally, every station, ${user.role} (access level ${user.level})'
          : 'signed in at station ${user.station?.code ?? '-'}, ${user.role} (access level ${user.level})',
    );
    setState(() => _user = user);
  }

  void _signOut() {
    widget.api.signOut();
    appLog('auth', 'signed out');
    _closePages();
    setState(() => _user = null);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Climate Dashboard',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: _messenger,
      navigatorKey: _navigator,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      builder: (context, child) => PhoneFrame(child: child ?? const SizedBox()),
      home: switch (_user) {
        null => SignInScreen(api: widget.api, onSignedIn: _signedIn),
        final user when user.isSuperuser => NationalHomeScreen(api: widget.api, user: user, onSignOut: _signOut),
        final user => HomeScreen(api: widget.api, user: user, onSignOut: _signOut),
      },
    );
  }
}
