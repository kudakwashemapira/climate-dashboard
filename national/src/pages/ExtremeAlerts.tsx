/**
 * Extreme weather alerts (FR-014, FR-015; screen SCR-016):
 *   GET /api/analysis/extreme-alerts/?year=[&province=&severity=]
 * The events that started in the year: how many, how many are still active, the counts by type and
 * by severity, and the events themselves, newest first (the API lists up to 200). All counts come
 * from AnalysisService. Events are entered on the Extreme weather events screen; the peak value of
 * an event is shown there with its unit, which this endpoint does not return.
 *
 * Severity is an ordered scale, so it is drawn as steps of one hue and always named in words.
 */
import { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, BellRing, CloudLightning } from "lucide-react";
import { ChartCard, ChartLegend, StackedBarList, useChartColors } from "../components/charts";
import { PlainTable } from "../components/DataTable";
import { Badge, Card, EmptyState, ErrorState, FilterBar, KpiCard, PageHeader, SelectFilter, Spinner, YearInput } from "../components/ui";
import { useFetch } from "../hooks/useResource";
import { fmtDateTime, fmtInt, fmtYesNo } from "../lib/format";
import { SEVERITY_TONE } from "../lib/tones";
import type { ExtremeAlerts as Result } from "../services/analysis";
import { SEVERITIES, options, type Severity } from "../services/types";
import { PROVINCE_OPTIONS, StationLink, thisYear } from "./shared";

const MAX_LISTED = 200; // analysis/services.py MAX_EVENT_ROWS
const none = <span className="text-muted">not recorded</span>;

export default function ExtremeAlerts() {
  const c = useChartColors();
  const [year, setYear] = useState(thisYear());
  const [province, setProvince] = useState("");
  const [severity, setSeverity] = useState("");

  const query = useFetch<Result>("/analysis/extreme-alerts/", { year, province, severity });
  const data = query.data;
  const shown = data?.year ?? year;
  const filtered = Boolean(province || severity || year !== thisYear());

  const count = useMemo(() => {
    const cells = new Map<string, number>();
    for (const cell of data?.matrix ?? []) cells.set(`${cell.event_type}|${cell.severity}`, cell.count);
    return (type: string, level: Severity) => cells.get(`${type}|${level}`) ?? 0;
  }, [data]);
  const bySeverity = (level: Severity): number => data?.by_severity.find((row) => row.severity === level)?.count ?? 0;
  const levels: Severity[] = data?.severities ?? SEVERITIES;

  return (
    <div className="space-y-4">
      <PageHeader title="Extreme weather alerts"
        description="Floods, droughts, heatwaves and storms that started in the year chosen, counted by type and severity. An event with no end time is still active." />
      <FilterBar onReset={filtered ? () => { setYear(thisYear()); setProvince(""); setSeverity(""); } : undefined}>
        <YearInput id="alerts-year" label="Year" value={year} onChange={setYear} />
        <SelectFilter id="alerts-province" label="Province" value={province} onChange={setProvince} options={PROVINCE_OPTIONS} allLabel="All provinces" className="min-w-[14rem]" />
        <SelectFilter id="alerts-severity" label="Severity" value={severity} onChange={setSeverity} options={options(SEVERITIES)} allLabel="All severities" />
      </FilterBar>

      {query.error ? <div className="card"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>
        : !data ? <div className="card"><Spinner /></div>
        : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))" }}>
            <KpiCard label={`Events started in ${data.year}`} value={fmtInt(data.total)} detail="All types, in the scope of the filters" icon={CloudLightning} />
            <KpiCard label="Still active" value={fmtInt(data.active)} detail="Started in the year and not yet ended" icon={BellRing} tone={data.active > 0 ? "crit" : "good"} />
            <KpiCard label="Extreme severity" value={fmtInt(bySeverity("Extreme"))} detail="The highest of the four levels" icon={AlertOctagon} tone={bySeverity("Extreme") > 0 ? "crit" : "good"} />
            <KpiCard label="High severity" value={fmtInt(bySeverity("High"))} detail="The second highest level" icon={AlertTriangle} tone={bySeverity("High") > 0 ? "warn" : "good"} />
          </div>
        )}

      <ChartCard title="Events by type and severity" description={`Number of events that started in ${shown}. Each bar is one event type, split by severity; the most frequent type is first.`}
        query={query} empty={!data || data.total === 0} emptyTitle={`No events started in ${shown}`} emptyHint="Change the year or the filters."
        legend={<ChartLegend label="Severity" items={levels.map((level) => ({ key: level, label: level, color: c.severity[level], detail: fmtInt(bySeverity(level)) }))} />}
        chart={(
          <StackedBarList label="Events by type and severity" labelWidth="11rem"
            rows={(data?.by_type ?? []).map((row) => ({
              key: row.event_type, label: row.event_type, display: fmtInt(row.count),
              segments: levels.map((level) => ({ key: level, label: level, value: count(row.event_type, level), color: c.severity[level] })),
            }))} />
        )}
        table={(
          <PlainTable caption="Events by type and severity" rows={data?.matrix ?? []} rowKey={(row) => `${row.event_type}-${row.severity}`}
            columns={[
              { key: "type", header: "Event type", cell: (row) => row.event_type },
              { key: "severity", header: "Severity", cell: (row) => <Badge tone={SEVERITY_TONE[row.severity]}>{row.severity}</Badge> },
              { key: "count", header: "Events", align: "right", cell: (row) => fmtInt(row.count) },
            ]} />
        )} />

      <Card title={`Events that started in ${shown}`}
        description={data && data.total > data.count ? `Newest first. The newest ${fmtInt(MAX_LISTED)} of ${fmtInt(data.total)} events are listed.` : "Newest first. Times are in Central Africa Time."}
        padded={false}>
        {query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} />
          : !data ? <Spinner />
          : data.results.length === 0 ? <EmptyState title={`No events started in ${shown}`} hint="Change the year or the filters." icon={CloudLightning} />
          : (
            <div className="p-4">
              <PlainTable caption={`Extreme weather events that started in ${shown}`} rows={data.results} rowKey={(row) => row.id}
                columns={[
                  { key: "started", header: "Started (CAT)", cell: (row) => <span className="whitespace-nowrap">{fmtDateTime(row.started_at)}</span> },
                  { key: "station", header: "Station", cell: (row) => <StationLink id={row.station} code={row.station_code} name={row.station_name} stacked /> },
                  { key: "province", header: "Province", cell: (row) => <span className="whitespace-nowrap">{row.province}</span> },
                  { key: "type", header: "Event type", cell: (row) => <span className="whitespace-nowrap">{row.event_type}</span> },
                  { key: "severity", header: "Severity", cell: (row) => <Badge tone={SEVERITY_TONE[row.severity]}>{row.severity}</Badge> },
                  { key: "ended", header: "Ended (CAT)", cell: (row) => (row.active ? <Badge tone="crit">Active</Badge> : <span className="whitespace-nowrap">{fmtDateTime(row.ended_at)}</span>) },
                  { key: "alert", header: "Alert issued", cell: (row) => fmtYesNo(row.alert_issued) },
                  { key: "description", header: "Description", cell: (row) => (row.description ? <span className="text-ink-2">{row.description}</span> : none) },
                ]} />
            </div>
          )}
      </Card>
    </div>
  );
}
