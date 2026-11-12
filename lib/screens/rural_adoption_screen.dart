import 'package:flutter/material.dart';

import '../api/climate_api.dart';
import '../api/models.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// Who uses the system in rural areas, for a national account: GET /api/analysis/adoption/, the
/// figures of the national web Rural adoption screen, over the last 30 days and for the rural pilot
/// stations only. A farmer is reached once the SMS company reports a message delivered to their phone;
/// the target counts reached farmers. The stations with the fewest farmers come first: those are the
/// ones to follow up. Tapping a station opens its own tabs. Above it, the SMS setup of the web app
/// (GET /api/farmers/setup/): where farmers' SMS go, and what is still needed for real ones.
class RuralAdoptionScreen extends StatelessWidget {
  const RuralAdoptionScreen({super.key, required this.api, required this.changed, required this.onOpen});

  final ClimateApi api;
  final Listenable changed;
  final ValueChanged<StationRef> onOpen;

  @override
  Widget build(BuildContext context) {
    return Loader<(Adoption, SmsSetup)>(
      load: () => (api.adoption(), api.smsSetup()).wait,
      reload: changed,
      builder: (context, loaded) {
        final (a, setup) = loaded;
        final theme = Theme.of(context);
        final tones = Tones.of(context);
        final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
        final reached = a.total('farmers_reached');
        final atRisk = a.total('stations_bulletin_at_risk');
        final problems = a.total('sms_undelivered') + a.total('sms_failed');
        final noReports = a.total('sms_awaiting') > 0 && a.total('sms_delivered') == 0 && a.total('sms_undelivered') == 0;
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            _SetupCard(setup),
            const SizedBox(height: 12),
            GridView(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                mainAxisExtent: 136,
              ),
              children: [
                KpiTile(
                  'Farmers reached',
                  '$reached',
                  a.targetFarmers == null ? 'No target set yet' : '${percent(a.targetPct)} of the target of ${a.targetFarmers}',
                  Icons.groups_outlined,
                  a.targetFarmers == null ? tones.info : tones.ofPercent(a.targetPct),
                ),
                KpiTile(
                  'Days to the deadline',
                  '${a.daysLeft}',
                  'Deadline ${formatDay(a.deadline)}',
                  Icons.event_outlined,
                  a.daysLeft <= 7 ? tones.warn : tones.info,
                ),
                KpiTile(
                  'SMS delivered',
                  '${a.total('sms_delivered')}',
                  '${a.total('sms_awaiting')} awaiting a report, $problems not delivered or failed',
                  Icons.sms_outlined,
                  problems > 0 ? tones.warn : (a.total('sms_delivered') > 0 ? tones.good : tones.neutral),
                ),
                KpiTile(
                  'Farmers who texted',
                  '${a.total('farmers_texted')}',
                  'Sent RAIN, STOP, START or a question',
                  Icons.mark_chat_read_outlined,
                  tones.info,
                ),
                KpiTile(
                  'Bulletins at risk',
                  '$atRisk',
                  'No reading this week: no bulletin on ${formatDay(a.sendsOn)}',
                  Icons.event_busy_outlined,
                  atRisk > 0 ? tones.warn : tones.good,
                ),
                KpiTile(
                  'Stations in use',
                  '${a.total('stations_in_use')} of ${a.total('stations')}',
                  'Staff signed in, readings entered, SMS delivered or a farmer texted',
                  Icons.cell_tower,
                  a.total('stations') > 0 && a.total('stations_in_use') == a.total('stations') ? tones.good : tones.warn,
                ),
              ],
            ),
            if (noReports) ...[
              const SizedBox(height: 12),
              Card(
                color: tones.warn.tint,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    'No delivery report has come back: ${a.total('sms_awaiting')} SMS were accepted by the SMS company, but none was '
                    'reported delivered, so no farmer counts as reached yet. The server administrator checks the delivery report '
                    'address (manage.py sms_addresses).',
                    style: theme.textTheme.bodySmall?.copyWith(color: tones.warn.color),
                  ),
                ),
              ),
            ],
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 16, 4, 4),
              child: Text(
                '${a.rows.length} rural pilot stations, last ${a.days} days. Fewest farmers first: those are the stations to follow up.',
                style: muted,
              ),
            ),
            if (a.rows.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Text('No station is marked as a rural pilot station yet. Mark one in the national web app, under Stations.',
                    textAlign: TextAlign.center),
              ),
            for (final row in a.rows) _AdoptionRow(row, onTap: () => onOpen(row.station)),
          ],
        );
      },
    );
  }
}

/// Where farmers' SMS go, and every item of the SMS setup that is not done yet, with who does it.
class _SetupCard extends StatelessWidget {
  const _SetupCard(this.setup);

  final SmsSetup setup;

  static const _where = {
    'none': 'nowhere: no SMS company is set',
    'console': 'to the worker log only',
    'simulator': 'to the development SMS simulator',
    'company': 'to an SMS company',
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final open = [for (final item in setup.items) if (item.state == 'todo' || item.state == 'check') item];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('SMS setup', style: theme.textTheme.titleMedium),
            const SizedBox(height: 2),
            Text(
              '${setup.realSms ? 'Farmers\' SMS go' : 'No real phone receives these SMS yet: they go'} ${_where[setup.mode] ?? setup.mode}. '
              '${setup.open} to do.',
              style: muted,
            ),
            for (final item in open)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [StatusBadge(item.stateName), Text(item.label, style: theme.textTheme.titleSmall)],
                    ),
                    const SizedBox(height: 2),
                    Text(item.detail, style: theme.textTheme.bodySmall),
                    if (item.owner.isNotEmpty) Text('Who: ${item.owner}', style: muted),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A rural station: whether it is in use, its farmers reached, its SMS, staff and readings this week.
class _AdoptionRow extends StatelessWidget {
  const _AdoptionRow(this.row, {required this.onTap});

  final AdoptionRow row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final c = row.count;
    final lines = [
      '${c('farmers_reached')} of ${c('farmers_active')} farmers reached · ${c('farmers_texted')} texted · ${c('farmers_opted_out')} stopped',
      'SMS: ${c('sms_delivered')} delivered, ${c('sms_awaiting')} awaiting a report'
          '${c('sms_undelivered') > 0 ? ', ${c('sms_undelivered')} not delivered' : ''}${c('sms_failed') > 0 ? ', ${c('sms_failed')} failed' : ''}',
      'Staff: ${c('accounts_signed_in')} of ${c('accounts')} accounts signed in · ${c('readings_entered')} readings entered',
      'This week: ${c('readings_this_week')} readings',
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
                    Text(
                      '${row.station.code} · ${row.station.name}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    Text(row.station.province, style: muted),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        StatusBadge(row.inUse ? 'In use' : 'Not in use'),
                        if (row.bulletinAtRisk) const StatusBadge('No bulletin yet'),
                      ],
                    ),
                    const SizedBox(height: 6),
                    for (final line in lines) Text(line, style: muted),
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
