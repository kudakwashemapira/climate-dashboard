import 'package:flutter/material.dart';

import '../api/climate_api.dart';
import '../api/models.dart';
import '../widgets/common.dart';

/// The station's sensors and their calibration status: GET /api/sensors/hardware/.
class SensorsScreen extends StatelessWidget {
  const SensorsScreen({super.key, required this.api, required this.changed, this.station});

  final ClimateApi api;
  final Listenable changed;

  /// The station a national account opened; null for a station account.
  final int? station;

  @override
  Widget build(BuildContext context) {
    return Loader<List<Sensor>>(
      load: () => api.sensors(station: station),
      reload: changed,
      builder: (context, sensors) {
        if (sensors.isEmpty) return const MessagePanel(icon: Icons.sensors_off, message: 'No sensors are registered for this station.');
        final attention = sensors.where((s) => s.inService && (s.calibrationStatus == 'Due' || s.calibrationStatus == 'Overdue')).length;
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text(
                attention == 0
                    ? '${sensors.length} sensors. No calibration is due.'
                    : '${sensors.length} sensors. $attention need a calibration soon or are overdue.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
            for (final s in sensors) ...[
              ListTile(
                leading: Icon(s.inService ? Icons.sensors : Icons.sensors_off),
                title: Text('${s.code} · ${s.type}'),
                subtitle: Text([s.status, if (s.manufacturer != null) s.manufacturer!, if (s.model != null) s.model!].join(' · ')),
                trailing: StatusBadge(s.inService ? s.calibrationStatus : 'Retired'),
              ),
              const Divider(height: 1),
            ],
          ],
        );
      },
    );
  }
}
