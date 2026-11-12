import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../theme.dart';

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String _two(int n) => n.toString().padLeft(2, '0');

/// A time in the phone's time zone, for example "14 Oct 2026, 09:15".
String formatTime(DateTime time) {
  final t = time.toLocal();
  return '${t.day} ${_months[t.month - 1]} ${t.year}, ${_two(t.hour)}:${_two(t.minute)}';
}

/// A date from the API (yyyy-mm-dd), for example "14 Oct".
String formatDay(String isoDate) {
  final d = DateTime.tryParse(isoDate);
  return d == null ? isoDate : '${d.day} ${_months[d.month - 1]}';
}

String percent(double? value) => value == null ? 'n/a' : '${value.toStringAsFixed(1)} %';

String messageOf(Object error) => error is ApiException ? error.message : 'Something went wrong: $error';

/// The tone of a status word, as the web apps colour it (lib/tones.ts).
Tone toneOf(BuildContext context, String text) {
  final tones = Tones.of(context);
  return switch (text) {
    'Valid' || 'Current' || 'Active' || 'Low' || 'Completed' || 'Receives SMS' || 'Delivered' || 'START' || 'YES' || 'In use' || 'Done' => tones.good,
    'Suspect' || 'Due' || 'Moderate' || 'Estimated' || 'Out for calibration' || 'Partial' || 'Pending' || 'Draft translation' || 'No reading yet' ||
    'Undelivered' || 'STOP' || 'Not in use' || 'No bulletin yet' || 'Check' => tones.warn,
    'Rejected' || 'Overdue' || 'High' || 'Extreme' || 'Faulty' || 'Ongoing' || 'Failed' || 'To do' => tones.crit,
    'Sent' || 'RAIN' || 'JOIN' => tones.info,
    _ => tones.neutral,
  };
}

/// A short label for a quality flag, a calibration status or a severity. The icon and the word
/// carry the meaning as well as the colour, so it never rests on colour alone (CD-3.05 section 6).
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final tone = toneOf(context, text);
    final tones = Tones.of(context);
    final icon = tone == tones.good
        ? Icons.check_circle_outline
        : tone == tones.warn
        ? Icons.warning_amber_rounded
        : tone == tones.crit
        ? Icons.error_outline
        : tone == tones.info
        ? Icons.info_outline
        : Icons.remove_circle_outline;
    return Container(
      padding: const EdgeInsets.fromLTRB(6, 2, 8, 2),
      decoration: BoxDecoration(color: tone.tint, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: tone.color),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(color: tone.color, fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// A message in place of a list, with a way to try again.
class MessagePanel extends StatelessWidget {
  const MessagePanel({super.key, required this.icon, required this.message, this.onRetry});

  final IconData icon;
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(32),
      children: [
        const SizedBox(height: 48),
        Icon(icon, size: 40, color: Theme.of(context).colorScheme.outline),
        const SizedBox(height: 12),
        Text(message, textAlign: TextAlign.center),
        if (onRetry != null) ...[
          const SizedBox(height: 12),
          Center(
            child: OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Try again')),
          ),
        ],
      ],
    );
  }
}

/// Loads one value, shows it with [builder], and loads again on pull-down or when [reload] fires.
class Loader<T> extends StatefulWidget {
  const Loader({super.key, required this.load, required this.builder, this.reload});

  final Future<T> Function() load;

  /// Must return a scrollable, so that pull-to-refresh works.
  final Widget Function(BuildContext context, T value) builder;
  final Listenable? reload;

  @override
  State<Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<Loader<T>> {
  late Future<T> _future = widget.load();

  @override
  void initState() {
    super.initState();
    widget.reload?.addListener(_refresh);
  }

  @override
  void dispose() {
    widget.reload?.removeListener(_refresh);
    super.dispose();
  }

  Future<void> _refresh() async {
    final next = widget.load();
    setState(() {
      _future = next;
    });
    try {
      await next;
    } on Object {
      // shown by the FutureBuilder
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<T>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return MessagePanel(icon: Icons.cloud_off, message: messageOf(snapshot.error!), onRetry: _refresh);
          }
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          return widget.builder(context, snapshot.data as T);
        },
      ),
    );
  }
}

/// A figure in a card: its label, the value large, a line of detail, and an icon in the figure's tone.
class KpiTile extends StatelessWidget {
  const KpiTile(this.label, this.value, this.detail, this.icon, this.tone, {super.key});

  final String label;
  final String value;
  final String detail;
  final IconData icon;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(color: tone.tint, borderRadius: BorderRadius.circular(8)),
                  child: Icon(icon, size: 17, color: tone.color),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ),
              ],
            ),
            const Spacer(),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                value,
                style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, fontFeatures: tabularFigures),
              ),
            ),
            Text(
              detail,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
