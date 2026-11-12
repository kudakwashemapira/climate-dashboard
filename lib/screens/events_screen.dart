import 'package:flutter/material.dart';

import '../api/climate_api.dart';
import '../api/models.dart';
import '../widgets/common.dart';

/// Extreme weather events at the station, ongoing ones first: GET /api/events/extreme/.
///
/// With [onOpenStation] it is the national list: the events of every station, each labelled with its
/// station, and tapping one opens that station.
class EventsScreen extends StatelessWidget {
  const EventsScreen({super.key, required this.api, required this.changed, this.station, this.onOpenStation});

  final ClimateApi api;
  final Listenable changed;

  /// The station a national account opened; null for a station account and for the national list.
  final int? station;
  final ValueChanged<StationRef>? onOpenStation;

  bool get _national => onOpenStation != null;

  /// The events, and for the national list the stations by id to label them with.
  Future<(ResultPage<ExtremeEvent>, Map<int, StationRef>)> _load() async {
    if (!_national) return (await api.events(station: station), const <int, StationRef>{});
    final (page, stations) = await (api.events(), api.stations()).wait;
    return (page, {for (final s in stations.results) s.id: s});
  }

  @override
  Widget build(BuildContext context) {
    return Loader<(ResultPage<ExtremeEvent>, Map<int, StationRef>)>(
      load: _load,
      reload: changed,
      builder: (context, loaded) {
        final (page, stations) = loaded;
        if (page.results.isEmpty) {
          return MessagePanel(
            icon: Icons.wb_sunny_outlined,
            message: _national
                ? 'No extreme weather events are recorded at any station.'
                : 'No extreme weather events are recorded for this station.',
          );
        }
        final events = [...page.results]
          ..sort((a, b) {
            if (a.ongoing != b.ongoing) return a.ongoing ? -1 : 1;
            return b.startedAt.compareTo(a.startedAt);
          });
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            for (final e in events)
              Card(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: _national && stations[e.stationId] != null ? () => onOpenStation!(stations[e.stationId]!) : null,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (_national) ...[
                          Row(
                            children: [
                              Icon(Icons.location_city_outlined, size: 15, color: Theme.of(context).colorScheme.onSurfaceVariant),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  stations[e.stationId] == null
                                      ? 'Station ${e.stationId}'
                                      : '${stations[e.stationId]!.code} ${stations[e.stationId]!.name}',
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.labelMedium,
                                ),
                              ),
                              if (stations[e.stationId] != null)
                                Icon(Icons.chevron_right, size: 18, color: Theme.of(context).colorScheme.outline),
                            ],
                          ),
                          const SizedBox(height: 6),
                        ],
                        Row(
                          children: [
                            Expanded(child: Text(e.type, style: Theme.of(context).textTheme.titleMedium)),
                            if (e.ongoing) const Padding(padding: EdgeInsets.only(right: 6), child: StatusBadge('Ongoing')),
                            StatusBadge(e.severity),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          e.ongoing ? 'Since ${formatTime(e.startedAt)}' : '${formatTime(e.startedAt)} to ${formatTime(e.endedAt!)}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        if (e.description != null && e.description!.isNotEmpty) ...[const SizedBox(height: 6), Text(e.description!)],
                        if (e.alertIssued) ...[
                          const SizedBox(height: 6),
                          Text('Alert issued', style: Theme.of(context).textTheme.labelSmall),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            if (page.hasMore)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text('Showing the latest ${page.results.length} of ${page.count}.', textAlign: TextAlign.center),
              ),
          ],
        );
      },
    );
  }
}
