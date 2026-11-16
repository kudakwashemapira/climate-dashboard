/**
 * Weather observations: /api/weather/observations/ (list, create, update, delete) and the export
 * /api/reports/observations/. Screens SCR-005 (national) and SCR-032 (station).
 *
 * How this screen follows the API exactly:
 *  - The metric is sent as its code ("TEMP_C") together with the unit of that metric, which the form
 *    shows beside the value. The server refuses a reading without a unit or with another one (RU-01).
 *  - A Suspect or Rejected reading needs a note that says why; the server checks it as well.
 *  - Export is GET /api/weather/observations/export/ with the filters of the list; several readings
 *    are deleted at once through POST /api/weather/observations/bulk_delete/ (FR-010).
 *  - An update is a PUT of the whole reading, because the server validates the metric and the value
 *    together.
 *  - A superadmin names the station in the address (?station=), which is also what makes the server
 *    check that the chosen sensor belongs to that station.
 *  - Day filters are sent as Central Africa Time bounds: observed_from 00:00, observed_to 23:59:59.
 */
import { useNavigate } from "react-router-dom";
import { Upload } from "lucide-react";
import { ResourcePage, type ResourceConfig } from "../components/ResourcePage";
import { Badge, Button } from "../components/ui";
import { useMetrics, useSensors } from "../hooks/useLookups";
import { useTerms } from "../hooks/useTerms";
import { dayEndParam, dayStartParam, fmtDateTime, fmtNumber, fmtReading } from "../lib/format";
import { QUALITY_TONE } from "../lib/tones";
import { QUALITY_FLAGS, SOURCES, SOURCE_LABEL, options, type Observation } from "../services/types";
import { useStationScope, type ModuleProps } from "./common";

const NOTE_NEEDED = ["Suspect", "Rejected"];

export function ObservationsScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const { byCode, options: metricOptions } = useMetrics();
  const { sensors } = useSensors(s.pick ? undefined : s.stationId);
  const navigate = useNavigate();
  const terms = useTerms(); // named for the type of the station (FR-003)

  const config: ResourceConfig<Observation> = {
    path: "/weather/observations/",
    sortable: ["observed_at", "metric", "value", "sensor", "quality", "source", "station"],
    title: terms.observations,
    description: s.pick
      ? "Readings from every station, newest first. Filter by station, metric, quality, source and day."
      : "Readings of this station, newest first. Add a single reading here, or load many at once from a file.",
    noun: terms.observation,
    updateMethod: "PUT",
    exportName: "observations",
    bulkDelete: true,
    baseParams: s.baseParams,
    describe: (row) => `the ${byCode.get(row.metric)?.name ?? row.metric} reading of ${fmtDateTime(row.observed_at)}`,
    columns: [
      { key: "observed_at", header: "Observed (CAT)", cell: (row) => <span className="whitespace-nowrap">{fmtDateTime(row.observed_at)}</span> },
      ...s.columns<Observation>(),
      { key: "metric", header: "Metric", cell: (row) => byCode.get(row.metric)?.name ?? row.metric },
      { key: "value", header: "Value", align: "right", cell: (row) => <span className="whitespace-nowrap font-semibold">{fmtReading(row.value, row.unit, row.metric)}</span> },
      { key: "sensor", header: "Sensor", cell: (row) => row.sensor_label ?? <span className="text-muted">Manual reading</span> },
      { key: "quality", header: "Quality", cell: (row) => <span title={row.notes ?? undefined}><Badge tone={QUALITY_TONE[row.quality_flag]}>{row.quality_flag}</Badge></span> },
      // A weather model's value names its origin and credit in its notes (Open-Meteo, demo data only)
      { key: "source", header: "Source", cell: (row) => <span title={row.source === "Model" ? row.notes ?? undefined : undefined}>{SOURCE_LABEL[row.source]}</span> },
    ],
    filters: [
      ...s.filters(),
      { name: "metric", label: "Metric", type: "select", options: metricOptions },
      { name: "quality_flag", label: "Quality", type: "select", options: options(QUALITY_FLAGS) },
      { name: "source", label: "Source", type: "select", options: SOURCES.map((value) => ({ value, label: SOURCE_LABEL[value] })) },
      { name: "observed_from", label: "From day", type: "date", toParam: dayStartParam },
      { name: "observed_to", label: "To day", type: "date", toParam: dayEndParam },
    ],
    fields: [
      ...s.fields(["sensor"]),
      { name: "metric", label: "Metric", type: "select", required: true, options: metricOptions },
      { name: "observed_at", label: "Observed at", type: "datetime", required: true, hint: "In this computer's time zone. Stored in UTC, shown in Central Africa Time." },
      {
        name: "value", label: "Value", type: "number", required: true, step: "0.01",
        hint: (form) => {
          const metric = byCode.get(String(form.metric));
          return metric
            ? `Unit: ${metric.unit}. Valid range: ${fmtNumber(metric.min_valid, 1)} to ${fmtNumber(metric.max_valid, 1)} ${metric.unit}. A value outside it is refused.`
            : "Choose a metric to see its unit and valid range.";
        },
      },
      {
        name: "sensor", label: "Sensor", type: "select",
        options: (form) => sensors
          .filter((sensor) => !s.pick || String(sensor.station) === String(form.station))
          .map((sensor) => ({ value: String(sensor.id), label: `${sensor.sensor_code} – ${sensor.sensor_type}${sensor.status === "Retired" ? " (retired)" : ""}` })),
        hint: s.pick ? "Sensors of the chosen station. Leave empty for a manual observer reading." : "Leave empty for a manual observer reading.",
      },
      { name: "quality_flag", label: "Quality flag", type: "select", required: true, options: options(QUALITY_FLAGS),
        hint: "A reading from a sensor whose calibration is overdue is saved as Suspect." },
      { name: "notes", label: "Notes", type: "textarea", maxLength: 255, hint: "Required for a Suspect or Rejected reading: say why." },
    ],
    defaults: { quality_flag: "Valid" },
    saveParams: (form) => s.stationParam(form),
    // The unit is the unit of the chosen metric: it is shown beside the value and sent with it.
    toPayload: (payload, form) => ({ ...payload, unit: byCode.get(String(form.metric))?.unit ?? "" }),
    validate: (form) => (NOTE_NEEDED.includes(String(form.quality_flag)) && !String(form.notes ?? "").trim()
      ? { notes: `A note is required for a ${form.quality_flag} reading: say why.` }
      : {}),
    headerActions: s.scope.writable && !embedded
      ? <Button icon={<Upload className="h-4 w-4" aria-hidden />} onClick={() => navigate("/upload")}>Upload a file</Button>
      : undefined,
    emptyHint: "Add a reading, or load many at once on the upload screen.",
  };

  return <ResourcePage config={config} embedded={embedded} />;
}
