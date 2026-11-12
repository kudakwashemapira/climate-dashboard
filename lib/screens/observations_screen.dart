import 'package:flutter/material.dart';

import '../api/climate_api.dart';
import '../api/models.dart';
import '../widgets/common.dart';

/// The station's readings, newest first, 25 at a time: GET /api/weather/observations/.
class ObservationsScreen extends StatefulWidget {
  const ObservationsScreen({super.key, required this.api, required this.changed, this.station});

  final ClimateApi api;
  final Listenable changed;

  /// The station a national account opened; null for a station account.
  final int? station;

  @override
  State<ObservationsScreen> createState() => _ObservationsScreenState();
}

class _ObservationsScreenState extends State<ObservationsScreen> {
  final _scroll = ScrollController();
  final List<Observation> _rows = [];
  List<Metric> _metrics = const [];
  String? _metric;
  int _page = 0;
  int _count = 0;
  bool _more = true;
  bool _loading = false;
  int _generation = 0; // a reload or a new filter makes older replies stale
  String? _error;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 400) _next();
    });
    widget.changed.addListener(_reload);
    widget.api.metrics().then((m) => mounted ? setState(() => _metrics = m) : null, onError: (_) {});
    Future.microtask(_reload); // not setState inside initState
  }

  @override
  void dispose() {
    widget.changed.removeListener(_reload);
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    _generation++;
    setState(() {
      _rows.clear();
      _page = 0;
      _more = true;
      _error = null;
    });
    await _next(force: true);
  }

  Future<void> _next({bool force = false}) async {
    if ((_loading && !force) || !_more) return;
    setState(() => _loading = true);
    final generation = _generation;
    try {
      final page = await widget.api.observations(page: _page + 1, metric: _metric, station: widget.station);
      if (!mounted || generation != _generation) return;
      setState(() {
        _rows.addAll(page.results);
        _page++;
        _count = page.count;
        _more = page.hasMore;
      });
    } on Exception catch (error) {
      if (mounted && generation == _generation) setState(() => _error = messageOf(error));
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  void _filter(String? metric) {
    if (metric == _metric) return;
    _metric = metric;
    _reload();
  }

  String _nameOf(String code) {
    for (final m in _metrics) {
      if (m.code == code) return m.name;
    }
    return code;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          height: 56,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            children: [
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(label: const Text('All'), selected: _metric == null, onSelected: (_) => _filter(null)),
              ),
              for (final m in _metrics)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(label: Text(m.name), selected: _metric == m.code, onSelected: (_) => _filter(m.code)),
                ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _reload,
            child: _rows.isEmpty
                ? (_error != null
                      ? MessagePanel(icon: Icons.cloud_off, message: _error!, onRetry: _reload)
                      : _loading
                      ? const Center(child: CircularProgressIndicator())
                      : const MessagePanel(icon: Icons.inbox_outlined, message: 'No readings for this selection.'))
                : ListView.separated(
                    controller: _scroll,
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.only(bottom: 88),
                    itemCount: _rows.length + 1,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      if (i == _rows.length) {
                        return Padding(
                          padding: const EdgeInsets.all(16),
                          child: Center(
                            child: _loading
                                ? const CircularProgressIndicator()
                                : Text(_error ?? (_more ? '' : '$_count readings'), style: Theme.of(context).textTheme.bodySmall),
                          ),
                        );
                      }
                      final o = _rows[i];
                      return ListTile(
                        title: Text('${_nameOf(o.metric)}: ${o.value} ${o.unit}'),
                        subtitle: Text(
                          [
                            formatTime(o.observedAt),
                            if (o.sensorLabel != null) o.sensorLabel!,
                            o.sourceName,
                            if (o.notes != null && o.notes!.isNotEmpty) o.notes!,
                          ].join(' · '),
                        ),
                        trailing: StatusBadge(o.qualityFlag),
                      );
                    },
                  ),
          ),
        ),
      ],
    );
  }
}
