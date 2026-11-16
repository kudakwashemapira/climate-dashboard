/**
 * Data quality (BR-004, risk R-005; screen SCR-020):
 *   GET /api/analysis/data-quality/?days=30[&province=&station_type=]
 * Per station, for the complete days of the period: readings received against those expected (one
 * per active metric per day), rows flagged Rejected or Suspect, sensors whose calibration is overdue
 * or due, and the time of the last reading. The server orders the stations worst completeness
 * first, so the top of the list is who to contact. Completeness is measured for Active stations only.
 */
import { useState } from "react";
import { PlainTable } from "../components/DataTable";
import { Badge, Card, EmptyState, ErrorState, FilterBar, Meter, PageHeader, SelectFilter, Spinner, cx } from "../components/ui";
import { useFetch } from "../hooks/useResource";
import { fmtDate, fmtDateTime, fmtInt } from "../lib/format";
import { STATION_TONE } from "../lib/tones";
import type { DataQuality as Result } from "../services/analysis";
import { PROVINCE_OPTIONS, STATION_TYPE_OPTIONS, StationLink } from "./shared";

const PERIODS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 365 days" },
];
const DEFAULT_DAYS = "30";

/** Counts that need attention, each named in words. When all are zero the cell says so. */
function Flags({ items, clear, note }: { items: Array<{ count: number; label: string; tone: "warn" | "crit" }>; clear: string; note?: string }) {
  const raised = items.filter((item) => item.count > 0);
  return (
    <div>
      {raised.length === 0
        ? <span className="text-ink-2">{clear}</span>
        : <span className="flex flex-wrap gap-1.5">{raised.map((item) => <Badge key={item.label} tone={item.tone}>{fmtInt(item.count)} {item.label}</Badge>)}</span>}
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

export default function DataQuality() {
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [province, setProvince] = useState("");
  const [stationType, setStationType] = useState("");
  const query = useFetch<Result>("/analysis/data-quality/", { days, province, station_type: stationType });
  const data = query.data;
  const filtered = Boolean(province || stationType || days !== DEFAULT_DAYS);
  const refreshing = query.isFetching && !query.isLoading;

  return (
    <div>
      <PageHeader title="Data quality"
        description="Which stations are missing readings, sending readings that fail the checks, or running sensors past their calibration date. The stations with the lowest completeness are listed first." />
      <FilterBar onReset={filtered ? () => { setDays(DEFAULT_DAYS); setProvince(""); setStationType(""); } : undefined}>
        <SelectFilter id="quality-period" label="Period" value={days} onChange={setDays} options={PERIODS} allLabel={null} />
        <SelectFilter id="quality-province" label="Province" value={province} onChange={setProvince} options={PROVINCE_OPTIONS} allLabel="All provinces" className="min-w-[14rem]" />
        <SelectFilter id="quality-type" label="Station type" value={stationType} onChange={setStationType} options={STATION_TYPE_OPTIONS} allLabel="All types" className="min-w-[12rem]" />
      </FilterBar>

      <Card title="Completeness and data problems by station"
        description={data
          ? `${fmtDate(data.period.from)} to ${fmtDate(data.period.to)}, ${fmtInt(data.period.days)} complete days. One reading per active metric per day is expected.`
          : "One reading per active metric per day is expected."}
        padded={false}>
        {query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} />
          : !data ? <Spinner />
          : data.results.length === 0 ? <EmptyState title="No stations match these filters" hint="Change or clear the filters to see more." />
          : (
            <div className={cx("p-4 transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
              <PlainTable caption="Data quality by station" rows={data.results} rowKey={(row) => row.station} scroll={false}
                columns={[
                  { key: "station", header: "Station", cell: (row) => <StationLink id={row.station} code={row.station_code} name={row.station_name} stacked /> },
                  { key: "province", header: "Province", cell: (row) => <span className="whitespace-nowrap">{row.province}</span> },
                  { key: "status", header: "Status", cell: (row) => <Badge tone={STATION_TONE[row.status]}>{row.status}</Badge> },
                  { key: "completeness", header: "Completeness", cell: (row) => (
                    <div>
                      {row.completeness_pct === null ? <span className="text-muted">not measured</span> : <Meter value={row.completeness_pct} label="Completeness" />}
                      <p className="mt-1 whitespace-nowrap text-xs text-muted">
                        {row.expected === null ? `${fmtInt(row.received)} readings received` : `${fmtInt(row.received)} of ${fmtInt(row.expected)} readings received`}
                      </p>
                    </div>
                  ) },
                  { key: "flagged", header: "Readings that failed checks", cell: (row) => (
                    <Flags clear="none" items={[
                      { count: row.rejected_rows, label: "rejected", tone: "crit" },
                      { count: row.suspect_rows, label: "suspect", tone: "warn" },
                    ]} />
                  ) },
                  { key: "calibration", header: "Sensor calibration", cell: (row) => (
                    <Flags clear="none overdue or due" note={`${fmtInt(row.sensors)} sensors in service`} items={[
                      { count: row.overdue_calibrations, label: "overdue", tone: "crit" },
                      { count: row.due_calibrations, label: "due within 30 days", tone: "warn" },
                    ]} />
                  ) },
                  { key: "last", header: "Last reading (CAT)", cell: (row) => (row.last_observation_at ? <span className="whitespace-nowrap">{fmtDateTime(row.last_observation_at)}</span> : <span className="text-muted">none yet</span>) },
                ]} />
              <p className="mt-3 text-xs text-muted">
                Completeness is 95% or more when on target, and below 80% when it needs follow-up. It is not measured for Inactive or Decommissioned stations.
                Rejected readings do not count as received.
              </p>
            </div>
          )}
      </Card>
    </div>
  );
}
