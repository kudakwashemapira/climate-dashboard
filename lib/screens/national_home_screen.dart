import 'package:flutter/material.dart';

import '../api/climate_api.dart';
import '../api/models.dart';
import '../log.dart';
import '../widgets/account_sheet.dart';
import 'events_screen.dart';
import 'home_screen.dart';
import 'overview_screen.dart';
import 'rural_adoption_screen.dart';
import 'stations_screen.dart';

/// The signed-in app of a national account (a DCCES superadmin): the figures of every station, each
/// station and how it reports, the alerts of all stations, and the rural pilot's adoption. A station
/// opens in the tabs a station account has, with that station named in each request.
class NationalHomeScreen extends StatefulWidget {
  const NationalHomeScreen({super.key, required this.api, required this.user, required this.onSignOut});

  final ClimateApi api;
  final User user;
  final VoidCallback onSignOut;

  @override
  State<NationalHomeScreen> createState() => _NationalHomeScreenState();
}

class _NationalHomeScreenState extends State<NationalHomeScreen> {
  /// Bumped when the person comes back from a station, so the national figures load again.
  final _changed = ValueNotifier(0);
  int _tab = 0;
  static const _tabNames = ['Overview', 'Stations', 'Alerts', 'Rural adoption'];

  @override
  void dispose() {
    _changed.dispose();
    super.dispose();
  }

  Future<void> _open(StationRef station) async {
    appLog('nav', 'open station ${station.code}');
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => HomeScreen(api: widget.api, user: widget.user, onSignOut: widget.onSignOut, opened: station),
      ),
    );
    if (!mounted) return;
    appLog('nav', 'back from ${station.code}: national figures again');
    _changed.value++; // a reading added there counts in the national figures
  }

  @override
  Widget build(BuildContext context) {
    final tabs = [
      OverviewScreen(api: widget.api, changed: _changed),
      StationsScreen(api: widget.api, changed: _changed, onOpen: _open),
      EventsScreen(api: widget.api, changed: _changed, onOpenStation: _open),
      RuralAdoptionScreen(api: widget.api, changed: _changed, onOpen: _open),
    ];
    // Android Back on another tab returns to Overview; on Overview it leaves the app
    return PopScope(
      canPop: _tab == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        appLog('nav', 'back: tab Overview');
        setState(() => _tab = 0);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('National'),
              Text('Every station', style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12)),
            ],
          ),
          actions: [
            IconButton(
              tooltip: 'Account',
              icon: const Icon(Icons.account_circle_outlined),
              onPressed: () => showAccountSheet(context, api: widget.api, user: widget.user, onSignOut: widget.onSignOut),
            ),
          ],
        ),
        body: IndexedStack(index: _tab, children: tabs),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) {
            appLog('nav', 'tab ${_tabNames[i]}');
            setState(() => _tab = i);
          },
          destinations: const [
            NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Overview'),
            NavigationDestination(icon: Icon(Icons.location_city_outlined), selectedIcon: Icon(Icons.location_city), label: 'Stations'),
            NavigationDestination(icon: Icon(Icons.warning_amber_outlined), selectedIcon: Icon(Icons.warning_amber), label: 'Alerts'),
            NavigationDestination(icon: Icon(Icons.agriculture_outlined), selectedIcon: Icon(Icons.agriculture), label: 'Rural'),
          ],
        ),
      ),
    );
  }
}
