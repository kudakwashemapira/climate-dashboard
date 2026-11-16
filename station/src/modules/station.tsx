/**
 * What belongs to one station besides its readings:
 *   GET /api/stations/stations/<id>/   the station record (coordinates included for those allowed)
 *   /api/stations/operators/           the people who run the station
 *   /api/weather/baselines/            monthly climatology, the reference for rainfall anomalies
 *
 * Operators and baselines can only be created by a user of the station: both serializers take the
 * station from the signed-in account and ignore one sent by a superadmin. A superadmin can still
 * correct or delete existing rows, so the national screens offer edit and delete but not add.
 */
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { checkRange } from "../components/FormDialog";
import { ResourcePage, type ResourceConfig } from "../components/ResourcePage";
import { Badge, Card, ErrorState, Spinner } from "../components/ui";
import { useMetrics } from "../hooks/useLookups";
import { useAll, useFetch } from "../hooks/useResource";
import { fmtDate, fmtMonth, fmtNumber } from "../lib/format";
import { STATION_TONE } from "../lib/tones";
import type { Baseline, Station, StationOperator } from "../services/types";
import { useStationScope, type ModuleProps } from "./common";

const none = <span className="text-muted">not recorded</span>;
const NATIONAL_NOTE = "New entries are added by the station's own users in the station app.";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

/** The station record as a read-only card. Coordinates are the one field stored encrypted. */
export function StationProfileCard({ station, actions }: { station: number; actions?: ReactNode }) {
  const query = useFetch<Station>(`/stations/stations/${station}/`);
  const data = query.data;
  return (
    <Card title="Station profile" description="As registered by the national administrators." actions={actions}>
      {query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} />
        : !data ? <Spinner />
        : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 xl:grid-cols-5">
            <Fact label="Station code"><span className="font-semibold">{data.station_code}</span></Fact>
            <Fact label="Name">{data.name}</Fact>
            <Fact label="Type">{data.station_type}</Fact>
            <Fact label="Status"><Badge tone={STATION_TONE[data.status]}>{data.status}</Badge></Fact>
            <Fact label="Commissioned">{data.commissioned_on ? fmtDate(data.commissioned_on) : none}</Fact>
            <Fact label="Province">{data.province}</Fact>
            <Fact label="District">{data.district ?? none}</Fact>
            <Fact label="Elevation">{data.elevation_m === null ? none : `${fmtNumber(data.elevation_m, 0)} m`}</Fact>
            <Fact label="Coordinates (latitude, longitude)">
              <span className="inline-flex items-center gap-1.5">
                {data.station_coordinates}
                <Lock className="h-3.5 w-3.5 text-muted" aria-label="Stored encrypted" />
              </span>
            </Fact>
            <Fact label="Record last changed">{fmtDate(data.updated_at)}</Fact>
          </dl>
        )}
    </Card>
  );
}

// ---- operators ------------------------------------------------------------------------------------
export function OperatorsScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  // Every operator of the station in view, to check the one-primary rule before a save is sent.
  const all = useAll<StationOperator>("/stations/operators/", s.baseParams ?? {});
  const config: ResourceConfig<StationOperator> = {
    path: "/stations/operators/",
    title: "Station operators",
    description: "The people who run the station and whom to contact about its data. One of them is the primary contact.",
    noun: "operator",
    setup: true,
    baseParams: s.baseParams,
    canCreate: !s.scope.national,
    createNote: NATIONAL_NOTE,
    describe: (row) => row.full_name,
    columns: [
      { key: "name", header: "Name", cell: (row) => <span className="font-semibold">{row.full_name}</span> },
      ...s.columns<StationOperator>(),
      { key: "title", header: "Role", cell: (row) => row.role_title ?? none },
      { key: "email", header: "Email", cell: (row) => (row.email ? <a className="text-accent hover:underline" href={`mailto:${row.email}`}>{row.email}</a> : none) },
      { key: "phone", header: "Phone", cell: (row) => <span className="whitespace-nowrap">{row.phone ?? none}</span> },
      { key: "primary", header: "Primary contact", cell: (row) => (row.is_primary ? <Badge tone="info">Primary</Badge> : "") },
    ],
    filters: s.filters(),
    fields: [
      { name: "full_name", label: "Full name", required: true, maxLength: 120 },
      { name: "role_title", label: "Role", maxLength: 80, placeholder: "Station officer" },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Phone", maxLength: 30, placeholder: "+263 77 000 0000" },
      { name: "is_primary", label: "Primary contact for this station", type: "checkbox", wide: true, hint: "A station has one primary contact at a time." },
    ],
    validate: (form, _mode, row) => {
      if (!form.is_primary) return {};
      const home = row ? row.station : s.stationId;
      const other = (all.data ?? []).find((o) => o.is_primary && o.id !== row?.id && o.station === home);
      return other ? { is_primary: `${other.full_name} is the primary contact. Edit that operator first and clear this box there.` } : {};
    },
  };
  return <ResourcePage config={config} embedded={embedded} />;
}

// ---- baselines ------------------------------------------------------------------------------------
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: fmtMonth(i + 1) }));

export function BaselinesScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const { metrics } = useMetrics();
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const config: ResourceConfig<Baseline> = {
    path: "/weather/baselines/",
    title: "Historical baselines",
    description: "The long-term monthly mean of each metric at a station. Rainfall anomalies compare each month's total with the precipitation baseline of that month.",
    noun: "baseline",
    setup: true,
    baseParams: s.baseParams,
    canCreate: !s.scope.national,
    createNote: NATIONAL_NOTE,
    describe: (row) => `the ${byId.get(row.metric_type)?.name ?? "metric"} baseline for ${fmtMonth(row.month)}`,
    columns: [
      ...s.columns<Baseline>(),
      { key: "metric", header: "Metric", cell: (row) => byId.get(row.metric_type)?.name ?? `#${row.metric_type}` },
      { key: "month", header: "Month", cell: (row) => fmtMonth(row.month) },
      { key: "mean", header: "Baseline mean", align: "right", cell: (row) => <span className="whitespace-nowrap font-semibold">{fmtNumber(row.baseline_mean, 1)} {byId.get(row.metric_type)?.unit ?? ""}</span> },
      { key: "sd", header: "Standard deviation", align: "right", cell: (row) => (row.baseline_stddev === null ? none : fmtNumber(row.baseline_stddev, 1)) },
      { key: "period", header: "Reference period", cell: (row) => `${row.period_start_year} to ${row.period_end_year}` },
    ],
    filters: s.filters(),
    fields: [
      { name: "metric_type", label: "Metric", type: "select", required: true, options: metrics.map((m) => ({ value: String(m.id), label: `${m.name} (${m.unit})` })) },
      { name: "month", label: "Month", type: "select", required: true, options: MONTHS },
      { name: "baseline_mean", label: "Baseline mean", type: "number", required: true, step: "0.01", hint: "For precipitation: the mean monthly total, in mm." },
      { name: "baseline_stddev", label: "Standard deviation", type: "number", step: "0.01", hint: "Needed to show an anomaly in standard deviations." },
      { name: "period_start_year", label: "Reference period from (year)", type: "number", required: true, step: "1", placeholder: "1991" },
      { name: "period_end_year", label: "Reference period to (year)", type: "number", required: true, step: "1", placeholder: "2020" },
    ],
    validate: (form) => ({
      ...checkRange(form, "period_start_year", 1800, 2200, "Enter a four-digit year."),
      ...checkRange(form, "period_end_year", 1800, 2200, "Enter a four-digit year."),
      ...(Number(form.period_end_year) < Number(form.period_start_year) ? { period_end_year: "The period must not end before it starts." } : {}),
    }),
    serverErrorHint: "The server could not save this baseline. A baseline for the same metric, month and reference period may already exist for this station.",
  };
  return <ResourcePage config={config} embedded={embedded} />;
}
