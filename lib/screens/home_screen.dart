import 'package:flutter/material.dart';

import '../api/climate_api.dart';
import '../api/models.dart';
import '../log.dart';
import '../widgets/account_sheet.dart';
import 'add_farmer_screen.dart';
import 'add_observation_screen.dart';
import 'events_screen.dart';
import 'farmers_screen.dart';
import 'observations_screen.dart';
import 'overview_screen.dart';
import 'sensors_screen.dart';

/// Five tabs over one station's records, the fifth the rural pilot's farmers and their SMS. For a
/// station account it is the signed-in app: the server
/// limits every list to the account's station, so the app never names a station in a request. A
/// national account opens it for a station from its Stations list ([opened]); then the station is
/// named in each request, as the national web app does with ?station=.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api, required this.user, required this.onSignOut, this.opened});

  final ClimateApi api;
  final User user;
  final VoidCallback onSignOut;

  /// The station a national account opened; null for a station account.
  final StationRef? opened;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  /// Bumped after a reading is added, so the lists and figures load again.
  final _changed = ValueNotifier(0);
  int _tab = 0;
  static const _tabNames = ['Overview', 'Readings', 'Sensors', 'Alerts', 'Farmers'];
  static const _farmersTab = 4;

  @override
  void dispose() {
    _changed.dispose();
    super.dispose();
  }

  Future<void> _addReading() async {
    final saved = await Navigator.of(context).push<Observation>(
      MaterialPageRoute(
        builder: (_) => AddObservationScreen(api: widget.api, station: widget.opened),
        fullscreenDialog: true,
      ),
    );
    if (saved == null || !mounted) return;
    appLog('readings', 'reading #${saved.id} saved: ${saved.metric} ${saved.value}, ${saved.qualityFlag}');
    _changed.value++;
    final note = saved.qualityFlag == 'Valid' ? '' : ' as ${saved.qualityFlag}${saved.notes == null ? '' : ': ${saved.notes}'}';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Reading saved$note.')));
  }

  Future<void> _registerFarmer() async {
    final saved = await Navigator.of(context).push<Farmer>(
      MaterialPageRoute(
        builder: (_) => AddFarmerScreen(api: widget.api, station: widget.opened),
        fullscreenDialog: true,
      ),
    );
    if (saved == null || !mounted) return;
    appLog('farmers', 'farmer #${saved.id} registered, ${saved.languageName}');
    _changed.value++;
    final welcome = saved.receivesSms ? ' A welcome SMS is on its way.' : '';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${saved.name} is registered.$welcome')));
  }

  @override
  Widget build(BuildContext context) {
    final opened = widget.opened;
    final station = opened ?? widget.user.station;
    final ask = opened?.id; // named only for a national account
    final tabs = [
      OverviewScreen(api: widget.api, changed: _changed, station: station, stationId: ask),
      ObservationsScreen(api: widget.api, changed: _changed, station: ask),
      SensorsScreen(api: widget.api, changed: _changed, station: ask),
      EventsScreen(api: widget.api, changed: _changed, station: ask),
      FarmersScreen(api: widget.api, changed: _changed, user: widget.user, station: ask),
    ];
    // Android Back on another tab returns to Overview; on Overview it leaves the app, or the station
    // a national account opened
    return PopScope(
      canPop: _tab == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        appLog('nav', 'back: tab Overview');
        setState(() => _tab = 0);
      },
      child: Scaffold(
        appBar: AppBar(
          // The arrow goes straight back to every station; Android Back first returns to Overview
          leading: opened == null ? null : BackButton(onPressed: () => Navigator.of(context).pop()),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(station?.code ?? 'Climate Dashboard'),
              if (station != null)
                Text(
                  station.name,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12),
                ),
            ],
          ),
          actions: [
            if (opened == null)
              IconButton(
                tooltip: 'Account',
                icon: const Icon(Icons.account_circle_outlined),
                onPressed: () => showAccountSheet(context, api: widget.api, user: widget.user, onSignOut: widget.onSignOut),
              ),
          ],
        ),
        body: IndexedStack(index: _tab, children: tabs),
        floatingActionButton: _tab == 1 && widget.user.canAddReadings
            ? FloatingActionButton.extended(onPressed: _addReading, icon: const Icon(Icons.add), label: const Text('Add reading'))
            : _tab == _farmersTab && widget.user.canRegisterFarmers
            ? FloatingActionButton.extended(
                onPressed: _registerFarmer,
                icon: const Icon(Icons.person_add_alt_outlined),
                label: const Text('Register farmer'),
              )
            : null,
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) {
            appLog('nav', 'tab ${_tabNames[i]}${opened == null ? '' : ' of ${opened.code}'}');
            setState(() => _tab = i);
          },
          destinations: const [
            NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Overview'),
            NavigationDestination(icon: Icon(Icons.list_alt_outlined), selectedIcon: Icon(Icons.list_alt), label: 'Readings'),
            NavigationDestination(icon: Icon(Icons.sensors_outlined), selectedIcon: Icon(Icons.sensors), label: 'Sensors'),
            NavigationDestination(icon: Icon(Icons.warning_amber_outlined), selectedIcon: Icon(Icons.warning_amber), label: 'Alerts'),
            NavigationDestination(icon: Icon(Icons.agriculture_outlined), selectedIcon: Icon(Icons.agriculture), label: 'Farmers'),
          ],
        ),
      ),
    );
  }
}
