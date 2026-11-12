import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/climate_api.dart';
import '../api/models.dart';
import '../widgets/common.dart';

/// Add one reading: POST /api/weather/observations/. The server applies the observation rules
/// (RU-01 to RU-06) as for the web form and bulk upload; its messages are shown under the fields.
class AddObservationScreen extends StatefulWidget {
  const AddObservationScreen({super.key, required this.api, this.station});

  final ClimateApi api;

  /// The station a national account opened: the reading is for it, and the server is told so.
  /// Null for a station account, whose readings always go to its own station.
  final StationRef? station;

  @override
  State<AddObservationScreen> createState() => _AddObservationScreenState();
}

class _AddObservationScreenState extends State<AddObservationScreen> {
  final _form = GlobalKey<FormState>();
  final _value = TextEditingController();
  final _notes = TextEditingController();
  late final Future<(List<Metric>, List<Sensor>)> _choices = _loadChoices();

  Metric? _metric;
  int? _sensor;
  String _flag = 'Valid';
  DateTime _at = DateTime.now();
  bool _busy = false;
  String? _error;
  Map<String, List<String>> _fields = const {};

  Future<(List<Metric>, List<Sensor>)> _loadChoices() async {
    final (metrics, sensors) = await (widget.api.metrics(), widget.api.sensors(station: widget.station?.id)).wait;
    return (
      metrics,
      [
        for (final s in sensors)
          if (s.inService) s,
      ],
    );
  }

  @override
  void dispose() {
    _value.dispose();
    _notes.dispose();
    super.dispose();
  }

  String? _serverSays(String field) => _fields[field]?.join(' ');

  Future<void> _pickTime() async {
    final day = await showDatePicker(context: context, initialDate: _at, firstDate: DateTime(1990), lastDate: DateTime.now());
    if (day == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_at));
    if (time == null) return;
    setState(() => _at = DateTime(day.year, day.month, day.day, time.hour, time.minute));
  }

  Future<void> _save() async {
    setState(() {
      _fields = const {};
      _error = null;
    });
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final saved = await widget.api.addObservation(
        metric: _metric!,
        observedAt: _at,
        value: _value.text,
        qualityFlag: _flag,
        notes: _notes.text,
        sensorId: _sensor,
        station: widget.station?.id,
      );
      if (mounted) Navigator.of(context).pop(saved);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _fields = error.fields;
        _error = error.fields.isEmpty || error.fields.containsKey('non_field_errors') ? error.message : 'Check the fields marked below.';
      });
      _form.currentState!.validate(); // shows the server's messages under the fields
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add reading')),
      body: FutureBuilder<(List<Metric>, List<Sensor>)>(
        future: _choices,
        builder: (context, snapshot) {
          if (snapshot.hasError) return MessagePanel(icon: Icons.cloud_off, message: messageOf(snapshot.error!));
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final (metrics, sensors) = snapshot.data!;
          final metric = _metric;
          return Form(
            key: _form,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (widget.station != null) ...[
                  FormField<void>(
                    validator: (_) => _serverSays('station'),
                    builder: (state) => InputDecorator(
                      decoration: InputDecoration(
                        labelText: 'Station',
                        errorText: state.errorText,
                        prefixIcon: const Icon(Icons.location_city_outlined),
                      ),
                      child: Text('${widget.station!.code} ${widget.station!.name}', overflow: TextOverflow.ellipsis),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                DropdownButtonFormField<Metric>(
                  initialValue: _metric,
                  isExpanded: true, // long names are cut short instead of running past the screen
                  decoration: const InputDecoration(labelText: 'Metric'),
                  items: [
                    for (final m in metrics)
                      DropdownMenuItem(
                        value: m,
                        child: Text('${m.name} (${m.unit})', overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (m) => setState(() => _metric = m),
                  validator: (m) => m == null ? 'Choose what was measured.' : _serverSays('metric'),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _value,
                  decoration: InputDecoration(
                    labelText: 'Value',
                    suffixText: metric?.unit,
                    helperText: metric?.min == null || metric?.max == null
                        ? null
                        : 'Accepted range ${_plain(metric!.min!)} to ${_plain(metric.max!)} ${metric.unit}',
                  ),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                  validator: (v) => double.tryParse((v ?? '').trim()) == null ? 'Enter a number, for example 21.4.' : _serverSays('value'),
                ),
                const SizedBox(height: 16),
                FormField<DateTime>(
                  validator: (_) => _serverSays('observed_at'),
                  builder: (state) => InkWell(
                    onTap: _pickTime,
                    child: InputDecorator(
                      decoration: InputDecoration(
                        labelText: 'Time of the reading',
                        errorText: state.errorText,
                        suffixIcon: const Icon(Icons.schedule),
                      ),
                      child: Text(formatTime(_at)),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<int?>(
                  initialValue: _sensor,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Sensor (optional)'),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('No sensor')),
                    for (final s in sensors)
                      DropdownMenuItem(
                        value: s.id,
                        child: Text('${s.code} · ${s.type}', overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (id) => setState(() => _sensor = id),
                  validator: (_) => _serverSays('sensor'),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: _flag,
                  decoration: const InputDecoration(labelText: 'Quality'),
                  items: [for (final f in qualityFlags) DropdownMenuItem(value: f, child: Text(f))],
                  onChanged: (f) => setState(() => _flag = f ?? 'Valid'),
                  validator: (_) => _serverSays('quality_flag'),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _notes,
                  maxLength: 255,
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: flagsNeedingANote.contains(_flag) ? 'Note (required: say why)' : 'Note (optional)',
                  ),
                  validator: (v) => flagsNeedingANote.contains(_flag) && (v ?? '').trim().isEmpty
                      ? 'A $_flag reading needs a note that says why.'
                      : _serverSays('notes'),
                ),
                if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _busy ? null : _save,
                  icon: _busy
                      ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.save_outlined),
                  label: const Text('Save reading'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  static String _plain(double n) => n == n.roundToDouble() ? n.toStringAsFixed(0) : '$n';
}
