/**
 * Headline figures for the stations in scope: GET /api/analysis/overview/ and
 * GET /api/analysis/data-quality/. Used by the national dashboard (all stations, with filters),
 * by a station's detail screen (?station=<id>) and by the station home (own station).
 * Every number comes from AnalysisService; nothing is recalculated here.
 */
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BellRing, DatabaseZap, Gauge, Radio, RadioTower, Wrench } from "lucide-react";
import { CHART_MARGIN, ChartCard, TooltipBox, axisStyle, axisUnit, useChartColors, type QueryState, type TipProps } from "../components/charts";
import { PlainTable } from "../components/DataTable";
import { Badge, Card, EmptyState, ErrorState, KpiCard, KpiGrid, Meter, Spinner } from "../components/ui";
import { useFetch } from "../hooks/useResource";
import { fmtCompact, fmtDate, fmtDateTime, fmtDay, fmtInt, fmtPct } from "../lib/format";
import { BATCH_TONE, CALIBRATION_MEANING, CALIBRATION_TONE, pctTone } from "../lib/tones";
import type { DataQuality, Overview } from "../services/analysis";
import type { Params } from "../services/http";
import { CALIBRATION_STATUSES } from "../services/types";

/** Readings received on each of the last 30 complete days. A day with none is a true zero here. */
function ObservationsByDay({ data, query }: { data: Overview["observations_by_day"]; query: QueryState }) {
  const c = useChartColors();
  const tip = ({ active, payload }: TipProps) => {
    const point = payload?.[0]?.payload as { date: string; count: number } | undefined;
    if (!active || !point) return null;
    return <TooltipBox title={fmtDate(point.date)} rows={[{ key: "count", label: "readings received", value: fmtInt(point.count), color: c.series[0] }]} />;
  };
  return (
    <ChartCard
      title="Readings received per day"
      description="Number of observations dated on each of the last 30 complete days."
      query={query}
      empty={data.length === 0}
      chart={(
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={28} {...axisStyle(c)} />
            <YAxis allowDecimals={false} tickFormatter={fmtCompact} width={56} label={axisUnit(c, "readings")} {...axisStyle(c)} axisLine={false} />
            <Tooltip content={tip} cursor={{ stroke: c.axis, strokeWidth: 1 }} isAnimationActive={false} />
            <Area type="linear" dataKey="count" name="Readings" stroke={c.series[0]} strokeWidth={2} fill={c.series[0]} fillOpacity={0.1}
              dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
      table={(
        <PlainTable caption="Readings received per day" rows={data} rowKey={(row) => row.date}
          columns={[
            { key: "date", header: "Day", cell: (row) => fmtDate(row.date) },
            { key: "count", header: "Readings received", align: "right", cell: (row) => fmtInt(row.count) },
          ]} />
      )}
    />
  );
}

/** Sensors in service by calibration status: a bar split in four, and the same counts as words. */
function CalibrationStatusCard({ counts, inService }: { counts: Overview["calibration_status"]; inService: number }) {
  const c = useChartColors();
  const fill = { Current: c.status.good, Due: c.status.warn, Overdue: c.status.crit, Unknown: c.status.neutral } as const;
  const present = CALIBRATION_STATUSES.filter((status) => counts[status] > 0);
  return (
    <Card title="Sensor calibration status" description={`${fmtInt(inService)} sensors in service (retired sensors are not counted).`}>
      {inService === 0 ? <EmptyState title="No sensors in service" icon={Wrench} /> : (
        <>
          <div className="flex h-2.5 gap-0.5" role="img" aria-label={CALIBRATION_STATUSES.map((s) => `${s} ${counts[s]}`).join(", ")}>
            {present.map((status, i) => (
              <span key={status} className={i === 0 ? "rounded-l" : i === present.length - 1 ? "rounded-r" : undefined}
                style={{ flexGrow: counts[status], flexBasis: 0, minWidth: 3, background: fill[status] }} />
            ))}
          </div>
          <ul className="mt-4 space-y-2.5">
            {CALIBRATION_STATUSES.map((status) => (
              <li key={status} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge tone={CALIBRATION_TONE[status]}>{status}</Badge>
                  <p className="mt-0.5 text-xs text-muted">{CALIBRATION_MEANING[status]}</p>
                </div>
                <span className="text-lg font-semibold leading-tight text-ink">{fmtInt(counts[status])}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function LastUploadCard({ upload, showStation }: { upload: Overview["last_upload"]; showStation: boolean }) {
  return (
    <Card title="Latest upload" description="The most recent observation file received." actions={<Link to="/upload" className="text-xs font-semibold text-accent hover:underline">Upload history</Link>}>
      {upload === null ? <EmptyState title="No file has been uploaded yet" /> : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="col-span-2">
            <dt className="text-xs text-muted">File</dt>
            <dd className="mt-0.5 break-all font-semibold text-ink">{upload.filename}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Received</dt>
            <dd className="mt-0.5 text-ink">{fmtDateTime(upload.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Result</dt>
            <dd className="mt-0.5"><Badge tone={BATCH_TONE[upload.status]}>{upload.status}</Badge></dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Rows saved</dt>
            <dd className="mt-0.5 text-ink">{fmtInt(upload.success_count)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Rows with problems</dt>
            <dd className="mt-0.5 text-ink">{fmtInt(upload.error_count)}</dd>
          </div>
          {showStation && (
            <div className="col-span-2">
              <dt className="text-xs text-muted">Station</dt>
              <dd className="mt-0.5 text-ink">{upload.station_code ?? `#${upload.station}`}</dd>
            </div>
          )}
        </dl>
      )}
    </Card>
  );
}

/**
 * KPI cards, the readings-per-day chart, calibration status and the latest upload.
 * `params` are passed to the API unchanged: province, station_type or station.
 */
export function OverviewPanel({ params = {} }: { params?: Params }) {
  const query = useFetch<Overview>("/analysis/overview/", params);
  const data = query.data;
  if (query.error) return <div className="card"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>;
  if (!data) return <div className="card"><Spinner /></div>;

  const many = data.stations.total !== 1;
  const period = `${fmtDate(data.period.from)} to ${fmtDate(data.period.to)}`;
  return (
    <div className="space-y-4">
      <KpiGrid count={many ? 6 : 5}>
        {many && <KpiCard label="Active stations" value={fmtInt(data.stations.active)} detail={`of ${fmtInt(data.stations.total)} registered`} icon={RadioTower} />}
        <KpiCard label="Sensors in service" value={fmtInt(data.sensors.in_service)} detail={`${fmtInt(data.sensors.total)} registered, retired included`} icon={Radio} />
        <KpiCard label="Observations" value={fmtInt(data.observations.total)} detail={`${fmtInt(data.observations.in_period)} in the last ${data.period.days} days`} icon={DatabaseZap} />
        <KpiCard label="Active alerts" value={fmtInt(data.active_alerts)} detail="Extreme weather events not yet ended" icon={BellRing} tone={data.active_alerts > 0 ? "crit" : "good"} />
        <KpiCard label="Data completeness" value={fmtPct(data.data_completeness_pct)} detail={`Readings received of those expected, ${period}`} icon={Activity} tone={pctTone(data.data_completeness_pct)} />
        <KpiCard label="Calibration compliance" value={fmtPct(data.calibration_compliance_pct)} detail="Sensors in service whose calibration is current" icon={Gauge} tone={pctTone(data.calibration_compliance_pct)} />
      </KpiGrid>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2"><ObservationsByDay data={data.observations_by_day} query={query} /></div>
        <CalibrationStatusCard counts={data.calibration_status} inService={data.sensors.in_service} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <LastUploadCard upload={data.last_upload} showStation={many} />
        <div className="xl:col-span-2"><DataGapsCard params={params} limit={many ? 5 : undefined} /></div>
      </div>
    </div>
  );
}

/**
 * Completeness and data problems per station for the last 30 complete days, worst first, exactly
 * as /api/analysis/data-quality/ orders them. With `limit` only the first rows are shown.
 */
export function DataGapsCard({ params = {}, limit }: { params?: Params; limit?: number }) {
  const query = useFetch<DataQuality>("/analysis/data-quality/", { ...params, days: 30 });
  const data = query.data;
  const rows = data ? (limit ? data.results.slice(0, limit) : data.results) : [];
  const single = data?.count === 1;
  return (
    <Card
      title={single ? "Data gaps" : "Stations to follow up"}
      description={data
        ? `${fmtDate(data.period.from)} to ${fmtDate(data.period.to)}. One reading per active metric per day is expected.${limit && data.count > limit ? ` The ${limit} stations with the lowest completeness are shown.` : ""}`
        : "Completeness of the last 30 complete days."}
      actions={!single ? <Link to="/data-quality" className="text-xs font-semibold text-accent hover:underline">All stations</Link> : undefined}
      padded={false}>
      {query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} />
        : !data ? <Spinner />
        : rows.length === 0 ? <EmptyState title="No stations in scope" />
        : (
          <div className="p-4">
            <PlainTable caption="Data completeness by station" rows={rows} rowKey={(row) => row.station} scroll={false}
              columns={[
                ...(single ? [] : [{ key: "station", header: "Station", cell: (row: DataQuality["results"][number]) => (
                  <span className="block whitespace-nowrap">
                    <span className="font-semibold">{row.station_code}</span>
                    <span className="block text-xs text-ink-2">{row.station_name}</span>
                  </span>
                ) }]),
                { key: "completeness", header: "Completeness", cell: (row) => (row.completeness_pct === null
                  ? <span className="text-muted">not measured ({row.status.toLowerCase()} station)</span>
                  : <Meter value={row.completeness_pct} label="Completeness" />) },
                { key: "received", header: "Received / expected", align: "right", cell: (row) => `${fmtInt(row.received)} / ${row.expected === null ? "no data" : fmtInt(row.expected)}` },
                { key: "rejected", header: "Rejected rows", align: "right", cell: (row) => fmtInt(row.rejected_rows) },
                { key: "suspect", header: "Suspect rows", align: "right", cell: (row) => fmtInt(row.suspect_rows) },
                { key: "overdue", header: "Overdue calibrations", align: "right", cell: (row) => fmtInt(row.overdue_calibrations) },
                { key: "last", header: "Last observation", cell: (row) => fmtDateTime(row.last_observation_at) },
              ]} />
          </div>
        )}
    </Card>
  );
}
