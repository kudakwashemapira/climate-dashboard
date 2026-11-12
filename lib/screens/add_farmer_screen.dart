import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/climate_api.dart';
import '../api/models.dart';

/// Register one farmer: POST /api/farmers/farmers/, the endpoint of the web Farmers screen. The server
/// checks the number (a Zimbabwe mobile number, registered once) and the consent date; its messages
/// are shown under the fields.
class AddFarmerScreen extends StatefulWidget {
  const AddFarmerScreen({super.key, required this.api, this.station});

  final ClimateApi api;

  /// The station a national account opened: the farmer is registered there. Null for a station
  /// account, whose farmers always belong to its own station.
  final StationRef? station;

  @override
  State<AddFarmerScreen> createState() => _AddFarmerScreenState();
}

class _AddFarmerScreenState extends State<AddFarmerScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _village = TextEditingController();
  final _crops = TextEditingController();
  String _language = 'en';
  DateTime _consent = DateTime.now();
  bool _receivesSms = true;
  bool _busy = false;
  String? _error;
  Map<String, List<String>> _fields = const {};

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _village.dispose();
    _crops.dispose();
    super.dispose();
  }

  String? _serverSays(String field) => _fields[field]?.join(' ');

  Future<void> _pickConsent() async {
    final day = await showDatePicker(context: context, initialDate: _consent, firstDate: DateTime(2020), lastDate: DateTime.now());
    if (day != null) setState(() => _consent = day);
  }

  Future<void> _save() async {
    setState(() {
      _fields = const {};
      _error = null;
    });
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final saved = await widget.api.addFarmer(
        name: _name.text,
        phone: _phone.text,
        language: _language,
        consentGivenOn: _consent,
        village: _village.text,
        crops: _crops.text,
        receivesSms: _receivesSms,
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
    final day = '${_consent.day} ${const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][_consent.month - 1]} ${_consent.year}';
    return Scaffold(
      appBar: AppBar(title: const Text('Register farmer')),
      body: Form(
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
            TextFormField(
              controller: _name,
              maxLength: 120,
              decoration: const InputDecoration(labelText: 'Full name'),
              textCapitalization: TextCapitalization.words,
              validator: (v) => (v ?? '').trim().isEmpty ? 'Enter the farmer\'s name.' : _serverSays('full_name'),
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _phone,
              decoration: const InputDecoration(labelText: 'Mobile number', hintText: '0771 234 567', helperText: 'A Zimbabwe mobile number, registered once.'),
              keyboardType: TextInputType.phone,
              validator: (v) => (v ?? '').trim().isEmpty ? 'Enter the farmer\'s mobile number.' : _serverSays('phone'),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _language,
              decoration: const InputDecoration(
                labelText: 'SMS language',
                helperText: 'Used once its translation is reviewed; English until then.',
              ),
              items: [for (final entry in smsLanguages.entries) DropdownMenuItem(value: entry.key, child: Text(entry.value))],
              onChanged: (code) => setState(() => _language = code ?? 'en'),
              validator: (_) => _serverSays('language'),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _village,
              maxLength: 120,
              decoration: const InputDecoration(labelText: 'Village or ward (optional)'),
              validator: (_) => _serverSays('village'),
            ),
            TextFormField(
              controller: _crops,
              maxLength: 120,
              decoration: const InputDecoration(labelText: 'Main crops (optional)', hintText: 'Maize, groundnuts'),
              validator: (_) => _serverSays('main_crops'),
            ),
            FormField<DateTime>(
              validator: (_) => _serverSays('consent_given_on'),
              builder: (state) => InkWell(
                onTap: _pickConsent,
                child: InputDecorator(
                  decoration: InputDecoration(
                    labelText: 'Consent to SMS given on',
                    helperText: 'The day the farmer agreed to receive the messages.',
                    errorText: state.errorText,
                    suffixIcon: const Icon(Icons.event_outlined),
                  ),
                  child: Text(day),
                ),
              ),
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Receives SMS'),
              subtitle: const Text('A welcome SMS is sent at once, then the weekly bulletin and alerts.'),
              value: _receivesSms,
              onChanged: (on) => setState(() => _receivesSms = on),
            ),
            if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _busy ? null : _save,
              icon: _busy
                  ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.person_add_alt_outlined),
              label: const Text('Save farmer'),
            ),
          ],
        ),
      ),
    );
  }
}
