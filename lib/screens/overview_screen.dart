import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api/climate_api.dart';
import '../api/models.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// The dashboard: GET /api/analysis/overview/, the same figures as the home screen of the web apps,
/// in the same tones. Every number is the server's; the screen only draws them (CD-3.02 section 4.6).
///
/// With a [station] the figures are that station's; without one they are of every station, as a
/// national account sees them.
class OverviewScreen extends StatelessWidget {
  const OverviewScreen({super.key, required this.api, required this.changed, this.station, this.stationId});

  final ClimateApi api;
  final Listenable changed;

  /// The station the figures are of, for the header; null for the national figures.
  final StationRef? station;

  /// The station a national account opened, named in the request; null for a station account.
  final int? stationId;

  @override
  Widget build(BuildContext context) {
    return Loader<Overview>(
      load: () => api.overview(station: stationId),
      reload: changed,
      builder: (context, o) {
        final tones = Tones.of(context);
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            _Hero(overview: o, station: station),
            const SizedBox(height: 12),
            GridView(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              // A fixed height, not a ratio: on a narrow phone a ratio leaves too little room for two lines of label
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                mainAxisExtent: 136,
              ),
              children: [
                KpiTile(
                  'Calibration compliance',
                  percent(o.calibrationPct),
                  'Sensors in service whose calibration is current',
                  Icons.speed,
                  tones.ofPercent(o.calibrationPct),
                ),
                KpiTile(
                  'Active alerts',
                  '${o.activeAlerts}',
                  'Extreme weather events not yet ended',
                  Icons.notifications_active_outlined,
                  o.activeAlerts > 0 ? tones.crit : tones.good,
                ),
                KpiTile(
                  'Sensors in service',
                  '${o.sensorsInService}',
                  '${o.sensorsTotal} registered, retired included',
                  Icons.sensors,
                  tones.info,
                ),
                KpiTile(
                  'All readings',
                  _thousands(o.observationsTotal),
                  station == null ? 'At all ${o.stationsTotal} stations, every year' : 'At this station, every year',
                  Icons.storage,
                  tones.info,
                ),
              ],
            ),
            if (station != null) _PilotCard(api: api, changed: changed, stationId: stationId),
            const SizedBox(height: 12),
            _Section(
              title: 'Readings received per day',
              subtitle: 'Readings dated on each of the last ${o.byDay.length} complete days',
              child: _DayBars(o.byDay),
            ),
            const SizedBox(height: 12),
            _Section(
              title: 'Sensor calibration status',
              subtitle: '${o.sensorsInService} sensors in service (retired sensors are not counted)',
              child: _CalibrationStatus(o.calibrationStatus),
            ),
            if (o.lastUpload != null) ...[const SizedBox(height: 12), _LastUpload(o.lastUpload!)],
          ],
        );
      },
    );
  }
}

String _thousands(int n) => n.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');

/// The navy header card: the station (or every station), the period, the readings received and the
/// completeness.
class _Hero extends StatelessWidget {
  const _Hero({required this.overview, this.station});

  final Overview overview;
  final StationRef? station;

  @override
  Widget build(BuildContext context) {
    final o = overview;
    final soft = Colors.white.withValues(alpha: 0.85);
    final share = (o.completenessPct ?? 0).clamp(0, 100) / 100;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
      decoration: BoxDecoration(gradient: Brand.gradient, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            station?.label ?? 'All stations · ${o.stationsActive} of ${o.stationsTotal} active',
            style: TextStyle(color: soft, fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.4),
          ),
          const SizedBox(height: 2),
          Text(
            'Last 30 complete days, ${formatDay(o.from)} to ${formatDay(o.to)}',
            style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _thousands(o.observationsInPeriod),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 34,
                  fontWeight: FontWeight.w700,
                  height: 1,
                  fontFeatures: tabularFigures,
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text(
                    'readings received',
                    style: TextStyle(color: soft),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Text('Data completeness', style: TextStyle(color: soft, fontSize: 13)),
              ),
              Text(
                percent(o.completenessPct),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontFeatures: tabularFigures),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Semantics(
            label: 'Data completeness ${percent(o.completenessPct)}',
            child: ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: o.completenessPct == null ? 0 : share.toDouble(),
                minHeight: 8,
                color: Brand.sun,
                backgroundColor: Colors.white.withValues(alpha: 0.2),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            station == null ? 'Readings received of those expected from the active stations' : 'Readings received of those expected',
            style: TextStyle(color: soft, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

/// The rural pilot at this station, as on the station home of the web app (modules/pilot.tsx): farmers
/// reached, the days to the deadline and whether next Monday's bulletin can go out
/// (GET /api/analysis/adoption/). The card is extra: while it loads, or if it cannot be loaded, the
/// screen shows without it. It shows only at a rural pilot station or one with farmers.
class _PilotCard extends StatefulWidget {
  const _PilotCard({required this.api, required this.changed, this.stationId});

  final ClimateApi api;
  final Listenable changed;
  final int? stationId;

  @override
  State<_PilotCard> createState() => _PilotCardState();
}

class _PilotCardState extends State<_PilotCard> {
  Adoption? _data;

  @override
  void initState() {
    super.initState();
    _load();
    widget.changed.addListener(_load);
  }

  @override
  void dispose() {
    widget.changed.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await widget.api.adoption(ruralOnly: false, station: widget.stationId);
      if (mounted) setState(() => _data = data);
    } catch (_) {
      // Left out: the overview does not depend on it.
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    final row = data == null || data.rows.isEmpty ? null : data.rows.first;
    if (data == null || row == null || (!row.isRural && row.count('farmers_active') == 0)) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final tones = Tones.of(context);
    final days = data.daysLeft;
    final dayTone = days <= 0 ? tones.crit : (days <= 7 ? tones.warn : tones.info);
    final bulletin = row.bulletinAtRisk ? tones.warn : tones.good;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Rural pilot',
                      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: dayTone.tint, borderRadius: BorderRadius.circular(99)),
                    child: Text(
                      days <= 0 ? 'Deadline' : '$days days',
                      style: TextStyle(color: dayTone.color, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                '${row.count('farmers_reached')} ${row.count('farmers_reached') == 1 ? 'farmer' : 'farmers'} reached',
                style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600, fontFeatures: tabularFigures),
              ),
              const SizedBox(height: 2),
              Text(
                'Of ${row.count('farmers_active')} receiving SMS. '
                '${data.targetFarmers == null ? 'The pilot runs' : 'Target: ${data.targetFarmers} farmers nationally'} '
                'to ${formatDay(data.deadline)}.',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: bulletin.tint, borderRadius: BorderRadius.circular(8)),
                child: Text(
                  row.bulletinAtRisk
                      ? 'No rain or temperature reading this week. Add one by Sunday, '
                            'or the farmers get no bulletin on ${formatDay(data.sendsOn)}.'
                      : "This week's readings are in. The bulletin goes to the farmers on ${formatDay(data.sendsOn)}.",
                  style: TextStyle(color: bulletin.color, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A titled card, like the chart and table cards of the web dashboard.
class _Section extends StatelessWidget {
  const _Section({required this.title, required this.subtitle, required this.child});

  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text(subtitle, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 14),
            child,
          ],
        ),
      ),
    );
  }
}

/// A bar per day, with the highest count and 0 on the axis. The counts come from the server as they
/// are; a day without readings shows as a faint stub, so it reads as zero and not as missing.
class _DayBars extends StatelessWidget {
  const _DayBars(this.days);

  final List<DayCount> days;

  static const _height = 110.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme.primary;
    final axis = theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant, fontFeatures: tabularFigures);
    final top = math.max(1, days.fold<int>(0, (m, d) => math.max(m, d.count)));
    if (days.isEmpty) return Text('No readings in this period.', style: theme.textTheme.bodySmall);
    return Semantics(
      label: 'Readings per day from ${formatDay(days.first.date)} to ${formatDay(days.last.date)}, highest $top',
      child: Column(
        children: [
          SizedBox(
            height: _height,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 26,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('$top', style: axis),
                      Text('0', style: axis),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border(bottom: BorderSide(color: theme.dividerColor)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        for (final day in days)
                          Expanded(
                            child: Tooltip(
                              message: '${formatDay(day.date)}: ${day.count}',
                              child: Container(
                                margin: const EdgeInsets.symmetric(horizontal: 1),
                                height: math.max(3, (_height - 2) * day.count / top),
                                decoration: BoxDecoration(
                                  color: day.count == 0 ? color.withValues(alpha: 0.18) : color,
                                  borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 32),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(formatDay(days.first.date), style: axis),
                Text(formatDay(days[days.length ~/ 2].date), style: axis),
                Text(formatDay(days.last.date), style: axis),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The calibration statuses as one segmented bar and a legend, as on the web dashboard.
class _CalibrationStatus extends StatelessWidget {
  const _CalibrationStatus(this.counts);

  final Map<String, int> counts;

  static const _meaning = {
    'Current': 'Next calibration is due in more than 30 days',
    'Due': 'Next calibration is due within 30 days',
    'Overdue': 'The due date has passed, or the last calibration failed',
    'Unknown': 'No calibration has been logged',
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final order = [
      for (final key in _meaning.keys)
        if (counts.containsKey(key)) key,
      for (final key in counts.keys)
        if (!_meaning.containsKey(key)) key,
    ];
    final total = counts.values.fold<int>(0, (a, b) => a + b);
    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: SizedBox(
            height: 10,
            child: total == 0
                ? ColoredBox(color: theme.dividerColor)
                : Row(
                    children: [
                      for (final key in order)
                        if ((counts[key] ?? 0) > 0)
                          Expanded(
                            flex: counts[key]!,
                            child: ColoredBox(color: toneOf(context, key).color),
                          ),
                    ],
                  ),
          ),
        ),
        const SizedBox(height: 10),
        for (final key in order)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      StatusBadge(key),
                      if (_meaning[key] != null) ...[
                        const SizedBox(height: 3),
                        Text(_meaning[key]!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                      ],
                    ],
                  ),
                ),
                Text(
                  '${counts[key]}',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, fontFeatures: tabularFigures),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _LastUpload extends StatelessWidget {
  const _LastUpload(this.upload);

  final LastUpload upload;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tones = Tones.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: tones.info.tint, borderRadius: BorderRadius.circular(9)),
              child: Icon(Icons.upload_file, size: 20, color: tones.info.color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Latest upload', style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  const SizedBox(height: 2),
                  Text(upload.filename, style: theme.textTheme.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Text(
                    '${upload.saved} saved, ${upload.refused} refused'
                    '${upload.createdAt == null ? '' : ' · ${formatTime(upload.createdAt!)}'}',
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            StatusBadge(upload.status),
          ],
        ),
      ),
    );
  }
}
