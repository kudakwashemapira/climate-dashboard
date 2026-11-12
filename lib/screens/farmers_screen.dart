import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/climate_api.dart';
import '../api/models.dart';
import '../log.dart';
import '../widgets/common.dart';

/// The rural pilot on the phone, in three views with the endpoints of the web Farm climate, Farmers,
/// SMS to farmers and Texts from farmers screens:
///   GET   /api/analysis/farm-climate/           this week's rain and temperature, alerts, the bulletin
///   GET   /api/farmers/farmers/                 the station's farmers
///   PATCH /api/farmers/farmers/{id}/            stop a farmer's SMS, or start them again (levels 1 to 3)
///   POST  /api/farmers/farmers/send_bulletin/   send this week's bulletin now: a count, then confirm
///   GET   /api/farmers/messages/                every SMS to the farmers, Delivered once reported
///   GET   /api/farmers/incoming/                every text farmers sent (STOP, START, RAIN, HELP)
/// Every figure, the bulletin text and its translations come from the server; nothing is computed here.
class FarmersScreen extends StatefulWidget {
  const FarmersScreen({super.key, required this.api, required this.changed, required this.user, this.station});

  final ClimateApi api;
  final Listenable changed;
  final User user;

  /// The station a national account opened; null for a station account.
  final int? station;

  @override
  State<FarmersScreen> createState() => _FarmersScreenState();
}

class _FarmersScreenState extends State<FarmersScreen> {
  /// Bumped after the bulletin is sent or a farmer is stopped or started, so the views load again.
  final _sent = ValueNotifier(0);
  late final Listenable _reload = Listenable.merge([widget.changed, _sent]);
  String _language = 'en';
  bool _sending = false;

  @override
  void dispose() {
    _sent.dispose();
    super.dispose();
  }

  Future<(FarmClimate, ResultPage<Farmer>)> _load() =>
      (widget.api.farmClimate(station: widget.station), widget.api.farmers(station: widget.station)).wait;

  Future<void> _sendBulletin() async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _sending = true);
    try {
      final asked = await widget.api.sendBulletin(station: widget.station);
      if (!mounted) return;
      if (asked.farmers == 0) {
        messenger.showSnackBar(const SnackBar(content: Text('No farmer of this station receives SMS yet. Register farmers first.')));
        return;
      }
      final go = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('Send the bulletin to ${asked.farmers} farmers?'),
          content: const Text(
            'Each farmer gets the rain and temperature of last week, Monday to Sunday, in their own language. '
            'It covers the same week whichever day it is sent, so a farmer who already has it does not get it again.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Send the bulletin')),
          ],
        ),
      );
      if (go != true) return;
      final done = await widget.api.sendBulletin(confirm: true, station: widget.station);
      appLog('farmers', 'bulletin: ${done.queued} queued, ${done.alreadySent} had it already${done.skipped == null ? '' : ', skipped'}');
      messenger.showSnackBar(SnackBar(content: Text(done.skipped ?? done.detail)));
      _sent.value++;
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// Stop a farmer's SMS when they ask, or start them again: the same as Receives SMS on the web.
  Future<void> _toggle(Farmer farmer) async {
    final messenger = ScaffoldMessenger.of(context);
    final stop = farmer.receivesSms;
    final go = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(stop ? 'Stop SMS to ${farmer.name}?' : 'Start SMS to ${farmer.name} again?'),
        content: Text(
          stop
              ? 'Do this when the farmer asks to stop. They stay on the list and get nothing more until their SMS are started again.'
              : 'Only when the farmer asks for them again: they then get the weekly bulletin and alerts under the consent they gave.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text(stop ? 'Stop SMS' : 'Start SMS')),
        ],
      ),
    );
    if (go != true) return;
    try {
      final saved = await widget.api.setReceivesSms(farmer.id, receives: !stop);
      appLog('farmers', 'farmer #${saved.id} ${saved.receivesSms ? 'receives SMS again' : 'stopped'}');
      messenger.showSnackBar(SnackBar(content: Text(saved.receivesSms ? '${saved.name} receives SMS again.' : '${saved.name} gets no more SMS.')));
      _sent.value++;
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Column(
        children: [
          const TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [Tab(text: 'Farm climate'), Tab(text: 'SMS to farmers'), Tab(text: 'Texts from farmers')],
          ),
          Expanded(
            child: TabBarView(
              children: [
                _farmersView(),
                _SmsList(api: widget.api, reload: _reload, station: widget.station),
                _TextsList(api: widget.api, reload: _reload, station: widget.station),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _farmersView() {
    return Loader<(FarmClimate, ResultPage<Farmer>)>(
      load: _load,
      reload: _reload,
      builder: (context, loaded) {
        final (farm, farmers) = loaded;
        final text = Theme.of(context).textTheme;
        final bulletin = farm.bulletins.where((b) => b.language == _language).firstOrNull ?? farm.bulletins.firstOrNull;
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            _Section(
              title: 'Last week at the station',
              subtitle: '${formatDay(farm.from)} to ${formatDay(farm.to)}',
              children: [
                _Figure(label: 'Rain, last week', value: _rain(farm.rainMm, farm.rainReadings), note: _versus(farm.rainVersus, farm.rainNormalMm)),
                _Figure(label: 'Rain days (1 mm or more)', value: farm.rainReadings == 0 ? 'No readings' : '${farm.rainDays}'),
                _Figure(
                  label: 'Season rain since ${formatDay(farm.seasonFrom)}',
                  value: _rain(farm.seasonMm, farm.seasonReadings),
                  note: _versus(farm.seasonVersus, farm.seasonNormalMm),
                ),
                _Figure(
                  label: 'Temperature, lowest to highest',
                  value: farm.temperatureReadings == 0 || farm.minC == null || farm.maxC == null
                      ? 'No readings'
                      : '${farm.minC!.toStringAsFixed(0)} to ${farm.maxC!.toStringAsFixed(0)} °C',
                ),
                if (farm.weatherModel != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      'Development data: a weather model\'s values for the area, not the station\'s measurements. ${farm.weatherModel}.',
                      style: text.bodySmall,
                    ),
                  ),
                if (farm.alerts.isEmpty)
                  Padding(padding: const EdgeInsets.only(top: 8), child: Text('No weather alert is in force.', style: text.bodySmall))
                else
                  for (final a in farm.alerts)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Row(
                        children: [
                          Expanded(child: Text('${a.type} since ${formatTime(a.startedAt)}', style: text.bodyMedium)),
                          StatusBadge(a.severity),
                        ],
                      ),
                    ),
              ],
            ),
            _Section(
              title: 'This week\'s SMS bulletin',
              subtitle:
                  '${farm.farmersActive} farmers receive SMS${farm.farmersStopped == 0 ? '' : ', ${farm.farmersStopped} stopped'}, '
                  '${farm.farmersReached} reached. '
                  '${farm.lastBulletinAt == null ? 'None sent yet.' : 'Last sent ${formatTime(farm.lastBulletinAt!)}.'}',
              children: [
                if (farm.nextBulletinAtRisk) ...[
                  const StatusBadge('No reading yet'),
                  const SizedBox(height: 4),
                  Text(
                    'Without a rain or temperature reading by Sunday, the farmers get no bulletin on ${formatDay(farm.nextBulletinSendsOn)}.',
                    style: text.bodySmall,
                  ),
                  const SizedBox(height: 10),
                ],
                Text(
                  farm.replyNumber == null
                      ? 'No number for farmers\' texts yet: to stop, a farmer tells the station staff.'
                      : 'Farmers text RAIN to ${farm.replyNumber} for these figures, STOP to end.',
                  style: text.bodySmall,
                ),
                const SizedBox(height: 10),
                SegmentedButton<String>(
                  showSelectedIcon: false,
                  segments: [for (final b in farm.bulletins) ButtonSegment(value: b.language, label: Text(b.name))],
                  selected: {bulletin?.language ?? _language},
                  onSelectionChanged: (chosen) => setState(() => _language = chosen.first),
                ),
                if (bulletin != null) ...[
                  const SizedBox(height: 10),
                  if (!bulletin.reviewed)
                    const Padding(padding: EdgeInsets.only(bottom: 6), child: StatusBadge('Draft translation')),
                  Text(bulletin.text, style: text.bodyMedium),
                  const SizedBox(height: 4),
                  Text('${bulletin.text.length} characters', style: text.bodySmall),
                  if (bulletin.heldBack)
                    Text(
                      'Not sent yet: farmers who chose ${bulletin.name} get the English text until this translation is reviewed.',
                      style: text.bodySmall,
                    ),
                ],
                if (widget.user.canSendBulletin) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _sending ? null : _sendBulletin,
                    icon: _sending
                        ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.send_outlined),
                    label: const Text('Send this week\'s bulletin'),
                  ),
                ],
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text('Farmers (${farmers.count})', style: text.titleMedium),
            ),
            if (farmers.results.isEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  widget.user.canRegisterFarmers
                      ? 'No farmer is registered at this station yet. Register one with their consent: they then get SMS from the station.'
                      : 'No farmer is registered at this station yet.',
                ),
              ),
            for (final f in farmers.results)
              ListTile(
                title: Text(f.name, overflow: TextOverflow.ellipsis),
                subtitle: Text([f.phone, f.languageName, ?f.village].join(' · '), overflow: TextOverflow.ellipsis),
                trailing: StatusBadge(f.receivesSms ? 'Receives SMS' : 'Stopped'),
                onTap: widget.user.canRegisterFarmers ? () => _toggle(f) : null,
              ),
            if (farmers.hasMore)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text('Showing ${farmers.results.length} of ${farmers.count}. The web app lists them all.', textAlign: TextAlign.center),
              ),
            const SizedBox(height: 72), // room above the Register farmer button
          ],
        );
      },
    );
  }

  static String _mm(double value) => value >= 10 || value == 0 ? value.toStringAsFixed(0) : value.toStringAsFixed(1);

  static String _rain(double? mm, int readings) => readings == 0 || mm == null ? 'No readings' : '${_mm(mm)} mm';

  static String? _versus(String? versus, double? normal) {
    if (versus == null || normal == null) return null;
    final word = switch (versus) {
      'above' => 'Above normal',
      'below' => 'Below normal',
      _ => 'Near normal',
    };
    return '$word: normal ${_mm(normal)} mm';
  }
}

/// Every SMS to the station's farmers, newest first, as the web SMS to farmers screen.
class _SmsList extends StatelessWidget {
  const _SmsList({required this.api, required this.reload, this.station});

  final ClimateApi api;
  final Listenable reload;
  final int? station;

  @override
  Widget build(BuildContext context) {
    return Loader<ResultPage<SmsMessage>>(
      load: () => api.smsMessages(station: station),
      reload: reload,
      builder: (context, page) {
        final small = Theme.of(context).textTheme.bodySmall;
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            const _Hint('Newest first. Sent: the SMS company has the message. Delivered: it reported the message on the farmer\'s phone.'),
            if (page.results.isEmpty) const _Hint('No SMS has gone to this station\'s farmers yet.'),
            for (final m in page.results)
              ListTile(
                title: Text('${m.kind} to ${m.farmerName ?? 'no farmer on record'}', overflow: TextOverflow.ellipsis),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(m.body, maxLines: 3, overflow: TextOverflow.ellipsis),
                    Text(
                      [?_time(m.createdAt), m.languageName, if (m.deliveredAt != null) 'delivered ${formatTime(m.deliveredAt!)}'].join(' · '),
                      style: small,
                    ),
                    if (m.error.isNotEmpty) Text(m.error, style: small),
                  ],
                ),
                trailing: StatusBadge(m.status),
              ),
            if (page.hasMore) _Hint('Showing ${page.results.length} of ${page.count}. The web app lists them all.'),
            const SizedBox(height: 72), // room above the Register farmer button
          ],
        );
      },
    );
  }
}

/// Every text the station's farmers sent and what the system did, as the web Texts from farmers screen.
class _TextsList extends StatelessWidget {
  const _TextsList({required this.api, required this.reload, this.station});

  final ClimateApi api;
  final Listenable reload;
  final int? station;

  @override
  Widget build(BuildContext context) {
    return Loader<ResultPage<IncomingText>>(
      load: () => api.incomingTexts(station: station),
      reload: reload,
      builder: (context, page) {
        final small = Theme.of(context).textTheme.bodySmall;
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            const _Hint(
              'What farmers sent to the system\'s number, newest first. STOP and START change their SMS, RAIN is answered with '
              'last week\'s figures. Other texts are the farmers\' own questions: answer them at your next meeting.',
            ),
            if (page.results.isEmpty)
              const _Hint('No farmer has texted yet. Once the server has a number for farmers\' texts, their STOP, START, RAIN and HELP appear here.'),
            for (final t in page.results)
              ListTile(
                title: Text(
                  t.farmerName ?? (t.fromRegisteredNumber ? 'A removed farmer' : 'Number not registered'),
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.body.isEmpty ? '(an empty text)' : '"${t.body}"', maxLines: 3, overflow: TextOverflow.ellipsis),
                    Text(t.outcome, style: small),
                    Text([?_time(t.receivedAt), if (t.replyStatus != null) 'answer ${t.replyStatus}'].join(' · '), style: small),
                  ],
                ),
                trailing: StatusBadge(t.asked),
              ),
            if (page.hasMore) _Hint('Showing ${page.results.length} of ${page.count}. The web app lists them all.'),
            const SizedBox(height: 72),
          ],
        );
      },
    );
  }
}

String? _time(DateTime? time) => time == null ? null : formatTime(time);

class _Hint extends StatelessWidget {
  const _Hint(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Text(text, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.subtitle, required this.children});

  final String title;
  final String subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: text.titleMedium),
            const SizedBox(height: 2),
            Text(subtitle, style: text.bodySmall),
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value, this.note});

  final String label;
  final String value;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: text.bodyMedium),
                if (note != null) Text(note!, style: text.bodySmall),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(value, style: text.titleSmall),
        ],
      ),
    );
  }
}
