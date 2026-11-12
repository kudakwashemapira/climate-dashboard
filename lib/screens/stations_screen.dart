import 'package:flutter/material.dart';

import '../api/climate_api.dart';
import '../api/models.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// Every station and how it has reported, for a national account: GET /api/analysis/data-quality/,
/// the figures of the national Data Quality screen (SCR-020), lowest completeness first. Tapping a
/// station opens its own tabs.
class StationsScreen extends StatefulWidget {
  const StationsScreen({super.key, required this.api, required this.changed, required this.onOpen});

  final ClimateApi api;
  final Listenable changed;
  final ValueChanged<StationRef> onOpen;

  @override
  State<StationsScreen> createState() => _StationsScreenState();
}

class _StationsScreenState extends State<StationsScreen> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  bool _matches(StationHealth row) {
    if (_query.isEmpty) return true;
    final s = row.station;
    return '${s.code} ${s.name} ${s.province}'.toLowerCase().contains(_query);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Loader<StationHealthReport>(
      load: widget.api.stationHealth,
      reload: widget.changed,
      builder: (context, report) {
        final rows = report.rows.where(_matches).toList();
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
          children: [
            TextField(
              controller: _search,
              decoration: const InputDecoration(
                hintText: 'Find a station by code, name or province',
                prefixIcon: Icon(Icons.search),
                isDense: true,
              ),
              onChanged: (text) => setState(() => _query = text.trim().toLowerCase()),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 12, 4, 4),
              child: Text(
                '${report.rows.length} stations, last 30 complete days (${formatDay(report.from)} to ${formatDay(report.to)}). '
                'Lowest completeness first: those are the stations to contact.',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ),
            if (rows.isEmpty)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text('No station matches "${_search.text.trim()}".', textAlign: TextAlign.center),
              ),
            for (final row in rows) _StationRow(row, onTap: () => widget.onOpen(row.station)),
          ],
        );
      },
    );
  }
}

/// A station's code and name, its completeness as a figure and a bar, and what needs attention.
class _StationRow extends StatelessWidget {
  const _StationRow(this.row, {required this.onTap});

  final StationHealth row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tones = Tones.of(context);
    final tone = tones.ofPercent(row.completenessPct);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final notes = [
      row.lastObservationAt == null ? 'No readings yet' : 'Last reading ${formatTime(row.lastObservationAt!)}',
      if (row.overdueCalibrations > 0) '${row.overdueCalibrations} overdue calibration${row.overdueCalibrations == 1 ? '' : 's'}',
      if (row.dueCalibrations > 0) '${row.dueCalibrations} calibration${row.dueCalibrations == 1 ? '' : 's'} due',
      if (row.suspectRows > 0) '${row.suspectRows} suspect',
      if (row.rejectedRows > 0) '${row.rejectedRows} rejected',
    ];
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 5),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${row.station.code} · ${row.station.name}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                          ),
                        ),
                        const SizedBox(width: 8),
                        if (row.active)
                          Text(
                            percent(row.completenessPct),
                            style: theme.textTheme.titleSmall?.copyWith(
                              color: tone.color,
                              fontWeight: FontWeight.w700,
                              fontFeatures: tabularFigures,
                            ),
                          )
                        else
                          StatusBadge(row.status),
                      ],
                    ),
                    Text(row.station.province, style: muted),
                    if (row.active) ...[
                      const SizedBox(height: 8),
                      Semantics(
                        label: 'Data completeness ${percent(row.completenessPct)}, ${row.received} of ${row.expected} readings',
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(99),
                          child: LinearProgressIndicator(
                            value: ((row.completenessPct ?? 0).clamp(0, 100) / 100).toDouble(),
                            minHeight: 6,
                            color: tone.color,
                            backgroundColor: tone.tint,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Text(notes.join(' · '), style: muted),
                  ],
                ),
              ),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right, color: theme.colorScheme.outline),
            ],
          ),
        ),
      ),
    );
  }
}
