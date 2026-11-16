/**
 * Sensors and hardware: /api/sensors/hardware/ (list, create, update, delete). Screens SCR-006
 * (national) and SCR-035 (station). Calibration is reached from each row (see calibration.tsx).
 *
 * The calibration status is read-only here: the server derives it from the calibration history.
 * The body of a create always carries the station, because this serializer requires the field.
 */
import { useState } from "react";
import { ClipboardCheck, History } from "lucide-react";
import { ResourcePage, type ResourceConfig } from "../components/ResourcePage";
import { Badge, IconButton } from "../components/ui";
import { useSensors } from "../hooks/useLookups";
import { fmtDate } from "../lib/format";
import { CALIBRATION_TONE, SENSOR_TONE } from "../lib/tones";
import { CALIBRATION_STATUSES, SENSOR_STATUSES, SENSOR_TYPES, options, type Sensor } from "../services/types";
import { CalibrationHistoryDialog, LogCalibrationDialog } from "./calibration";
import { useStationScope, type ModuleProps } from "./common";

export function SensorsScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const { sensors } = useSensors(s.pick ? undefined : s.stationId);
  const [logFor, setLogFor] = useState<Sensor | null>(null);
  const [historyFor, setHistoryFor] = useState<Sensor | null>(null);

  const config: ResourceConfig<Sensor> = {
    path: "/sensors/hardware/",
    sortable: ["code", "type", "make", "serial", "installed", "status", "calibration", "station"],
    title: "Sensors and hardware",
    description: s.pick
      ? "Sensors registered at every station, with their service status and calibration status."
      : "Sensors registered at this station. Log a calibration from the row of the sensor it belongs to.",
    noun: "sensor",
    exportName: "sensors",
    setup: true,
    baseParams: s.baseParams,
    describe: (row) => `sensor ${row.sensor_code}`,
    columns: [
      { key: "code", header: "Sensor code", cell: (row) => <span className="font-semibold">{row.sensor_code}</span> },
      ...s.columns<Sensor>(),
      { key: "type", header: "Type", cell: (row) => row.sensor_type },
      { key: "make", header: "Make and model", cell: (row) => [row.manufacturer, row.model].filter(Boolean).join(" ") || <span className="text-muted">not recorded</span> },
      { key: "serial", header: "Serial number", cell: (row) => row.serial_number ?? <span className="text-muted">not recorded</span> },
      { key: "installed", header: "Installed", cell: (row) => <span className="whitespace-nowrap">{fmtDate(row.installed_on)}</span> },
      { key: "status", header: "Service status", cell: (row) => <Badge tone={SENSOR_TONE[row.status]}>{row.status}</Badge> },
      { key: "calibration", header: "Calibration", cell: (row) => <Badge tone={CALIBRATION_TONE[row.calibration_status]}>{row.calibration_status}</Badge> },
    ],
    filters: [
      ...s.filters(),
      { name: "status", label: "Service status", type: "select", options: options(SENSOR_STATUSES) },
      { name: "calibration_status", label: "Calibration", type: "select", options: options(CALIBRATION_STATUSES) },
      { name: "sensor_type", label: "Type", type: "select", options: options(SENSOR_TYPES) },
    ],
    fields: [
      ...s.fields(),
      { name: "sensor_code", label: "Sensor code", required: true, maxLength: 40, placeholder: "HRE-001-T1", hint: "Unique within the station and stored in capitals. Upload files refer to the sensor by this code." },
      { name: "sensor_type", label: "Type", required: true, maxLength: 30, suggestions: SENSOR_TYPES },
      { name: "manufacturer", label: "Manufacturer", maxLength: 80 },
      { name: "model", label: "Model", maxLength: 80 },
      { name: "serial_number", label: "Serial number", maxLength: 80 },
      { name: "installed_on", label: "Installed on", type: "date" },
      { name: "status", label: "Service status", type: "select", required: true, options: options(SENSOR_STATUSES), wide: true,
        hint: "Retired sensors are left out of the calibration figures." },
    ],
    defaults: { status: "Active" },
    toPayload: s.withStation,
    validate: (form, _mode, row) => {
      const code = String(form.sensor_code).trim().toUpperCase();
      const home = row ? String(row.station) : s.pick ? String(form.station) : String(s.stationId);
      const taken = sensors.some((other) => other.id !== row?.id && String(other.station) === home && other.sensor_code.toUpperCase() === code);
      return taken ? { sensor_code: "This station already has a sensor with this code." } : {};
    },
    rowActions: (row) => (
      <>
        <IconButton label={`Calibration history of ${row.sensor_code}`} onClick={() => setHistoryFor(row)}><History className="h-4 w-4" aria-hidden /></IconButton>
        {s.scope.writable && row.status !== "Retired" && (
          <IconButton label={`Log a calibration for ${row.sensor_code}`} onClick={() => setLogFor(row)}><ClipboardCheck className="h-4 w-4" aria-hidden /></IconButton>
        )}
      </>
    ),
    emptyHint: "Register the station's sensors so readings and calibrations can be linked to them.",
  };

  return (
    <>
      <ResourcePage config={config} embedded={embedded} />
      <LogCalibrationDialog open={logFor !== null} sensor={logFor} onClose={() => setLogFor(null)} />
      <CalibrationHistoryDialog sensor={historyFor} onClose={() => setHistoryFor(null)} />
    </>
  );
}
