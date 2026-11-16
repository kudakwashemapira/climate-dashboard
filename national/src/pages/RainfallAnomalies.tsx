/**
 * Rainfall anomalies (FR-014; screen SCR-013):
 *   GET /api/analysis/rainfall-anomalies/?year=<required>[&province=&station=&include_suspect=true]
 * One row per station and month: the precipitation total, the baseline mean of that month, and the
 * difference between them in mm, in percent and in standard deviations. Every figure is computed by
 * AnalysisService; this screen only sorts the rows into a grid and picks a colour step for each.
 *
 * Wetter and drier are never told apart by colour alone (CD-3.05 section 5): each cell carries its
 * signed figure, the readout and the tables say "wetter" or "drier" in words.
 * A month without readings is a gap marked with a dash; it is never drawn as zero.
 */
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  CHART_MARGIN, ChartCard, ChartLegend, TooltipBox, axisStyle, axisUnit, useChartColors, useHoverTip, type TipProps, type TipRow,
} from "../components/charts";
import { PlainTable, type Column } from "../components/DataTable";
import { FilterBar, PageHeader, SelectFilter, YearInput, cx } from "../components/ui";
import { useStations } from "../hooks/useLookups";
import { useFetch } from "../hooks/useResource";
import type { ChartColors } from "../lib/chartTheme";
import { fmtInt, fmtMonth, fmtNumber, fmtSigned } from "../lib/format";
import type { RainfallAnomalies as Result, RainfallRow, StationRef } from "../services/analysis";
import { PROVINCE_OPTIONS, StationLink, ToggleFilter, thisYear, tint } from "./shared";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Colour steps by the size of the anomaly, in mm. Below the first one a month counts as at its baseline. */
const STEPS = [5, 25, 50];
const STEP_OPACITY = [0, 0.22, 0.4, 0.58];
const STEP_LABEL = [`less than ${STEPS[0]} mm`, `${STEPS[0]} to ${STEPS[1]} mm`, `${STEPS[1]} to ${STEPS[2]} mm`, `${STEPS[2]} mm or more`];

const stepOf = (mm: number): number => STEPS.filter((limit) => Math.abs(mm) >= limit).length;
const direction = (mm: number | null): string => (mm === null ? "no baseline" : mm > 0 ? "Wetter" : mm < 0 ? "Drier" : "At the baseline");
const fill = (c: ChartColors, mm: number): string | undefined => {
  const step = stepOf(mm);
  return step === 0 ? undefined : tint(mm > 0 ? c.wet : c.dry, STEP_OPACITY[step]);
};

/** Everything the API returned for one station and month, as readout rows. */
function readout(row: RainfallRow, c: ChartColors): TipRow[] {
  const rows: TipRow[] = [];
  if (row.anomaly_mm !== null) {
    rows.push({ key: "anomaly", value: `${fmtSigned(row.anomaly_mm)} mm`, color: row.anomaly_mm > 0 ? c.wet : row.anomaly_mm < 0 ? c.dry : undefined,
      label: row.anomaly_mm > 0 ? "wetter than the baseline" : row.anomaly_mm < 0 ? "drier than the baseline" : "at the baseline" });
  }
  rows.push({ key: "total", value: `${fmtNumber(row.total_mm, 1)} mm`, label: "total for the month" });
  rows.push(row.baseline_mean_mm === null
    ? { key: "baseline", value: "no baseline", label: "for this month" }
    : { key: "baseline", value: `${fmtNumber(row.baseline_mean_mm, 1)} mm`, label: `baseline mean${row.baseline_period ? `, ${row.baseline_period}` : ""}` });
  if (row.anomaly_pct !== null) rows.push({ key: "pct", value: `${fmtSigned(row.anomaly_pct)}%`, label: "of the baseline" });
  if (row.anomaly_sd !== null) rows.push({ key: "sd", value: fmtSigned(row.anomaly_sd, 2), label: "standard deviations" });
  rows.push({ key: "readings", value: fmtInt(row.readings), label: "readings" });
  return rows;
}

const FIGURE_COLUMNS: Column<RainfallRow>[] = [
  { key: "month", header: "Month", cell: (row) => fmtMonth(row.month) },
  { key: "total", header: "Total (mm)", align: "right", cell: (row) => fmtNumber(row.total_mm, 1) },
  { key: "baseline", header: "Baseline mean (mm)", align: "right", cell: (row) => (row.baseline_mean_mm === null ? "no baseline" : fmtNumber(row.baseline_mean_mm, 1)) },
  { key: "period", header: "Baseline period", cell: (row) => row.baseline_period ?? "" },
  { key: "anomaly", header: "Anomaly (mm)", align: "right", cell: (row) => (row.anomaly_mm === null ? "" : <span className="font-semibold">{fmtSigned(row.anomaly_mm)}</span>) },
  { key: "direction", header: "Against the baseline", cell: (row) => direction(row.anomaly_mm) },
  { key: "pct", header: "Anomaly (%)", align: "right", cell: (row) => (row.anomaly_pct === null ? "" : `${fmtSigned(row.anomaly_pct)}%`) },
  { key: "sd", header: "Anomaly (SD)", align: "right", cell: (row) => (row.anomaly_sd === null ? "" : fmtSigned(row.anomaly_sd, 2)) },
  { key: "readings", header: "Readings", align: "right", cell: (row) => fmtInt(row.readings) },
];

interface StationMonths { ref: StationRef; months: Map<number, RainfallRow> }

/** Stations down, months across. The station name is a button: it chooses the station of the chart below. */
function AnomalyGrid({ stations, year, focus, onFocus }: { stations: StationMonths[]; year: number; focus: number | null; onFocus: (station: number) => void }) {
  const c = useChartColors();
  const { bind, node } = useHoverTip();
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-separate text-xs" style={{ borderSpacing: 2 }}>
          <caption className="sr-only">Rainfall anomaly in mm by station and month, {year}</caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-1.5 text-left font-semibold text-muted">Station</th>
              {MONTHS.map((month) => <th key={month} scope="col" className="w-[6.4%] px-1 py-1.5 text-center font-semibold text-muted">{fmtMonth(month)}</th>)}
            </tr>
          </thead>
          <tbody>
            {stations.map(({ ref, months }) => (
              <tr key={ref.station}>
                <th scope="row" className="p-0 text-left font-normal">
                  <button type="button" aria-pressed={focus === ref.station} onClick={() => onFocus(ref.station)} title="Show this station in the chart below"
                    className={cx("flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left hover:bg-subtle", focus === ref.station && "bg-subtle")}>
                    <span className="font-semibold text-ink">{ref.station_code}</span>
                    <span className="truncate text-ink-2">{ref.station_name}</span>
                  </button>
                </th>
                {MONTHS.map((month) => {
                  const row = months.get(month);
                  if (!row) return <td key={month} className="rounded text-center text-muted" aria-label="no data">–</td>;
                  const tip = bind(<TooltipBox title={`${ref.station_code} · ${fmtMonth(month)} ${year}`} rows={readout(row, c)} />);
                  return (
                    <td key={month} className="p-0">
                      <div tabIndex={0} {...tip} className="rounded px-1 py-1.5 text-center outline-offset-0"
                        style={{ background: row.anomaly_mm === null ? undefined : fill(c, row.anomaly_mm) }}>
                        {row.anomaly_mm === null
                          ? <span className="italic text-muted">{fmtNumber(row.total_mm, 1)}</span>
                          : <span className="font-semibold text-ink">{fmtSigned(row.anomaly_mm)}</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {node}
    </>
  );
}

/** The colour steps, drier on the left, wetter on the right, the baseline in the middle. */
function ScaleKey() {
  const c = useChartColors();
  const swatch = (key: string, background: string | undefined, title: string) => (
    <span key={key} title={title} className={cx("h-3 w-6 rounded-sm", !background && "bg-subtle ring-1 ring-inset ring-line")} style={{ background }} />
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-2">
      <span className="flex items-center gap-1.5" role="img" aria-label={`Colour steps: ${STEP_LABEL.join(", ")}, drier or wetter than the baseline`}>
        <span>Drier</span>
        {[3, 2, 1].map((step) => swatch(`dry-${step}`, tint(c.dry, STEP_OPACITY[step]), `Drier by ${STEP_LABEL[step]}`))}
        {swatch("near", undefined, `Within ${STEPS[0]} mm of the baseline`)}
        {[1, 2, 3].map((step) => swatch(`wet-${step}`, tint(c.wet, STEP_OPACITY[step]), `Wetter by ${STEP_LABEL[step]}`))}
        <span>Wetter</span>
      </span>
      <span>Steps at {STEPS.join(", ")} mm from the baseline.</span>
      <span><span className="italic text-muted">12.3</span> total only: no baseline for the month</span>
      <span>– no readings</span>
    </div>
  );
}

export default function RainfallAnomalies() {
  const c = useChartColors();
  const { options: stationOptions } = useStations();
  const [year, setYear] = useState(thisYear());
  const [province, setProvince] = useState("");
  const [station, setStation] = useState("");
  const [includeSuspect, setIncludeSuspect] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);

  const query = useFetch<Result>("/analysis/rainfall-anomalies/", { year, province, station, include_suspect: includeSuspect ? "true" : undefined });
  const data = query.data;

  const stations = useMemo(() => {
    const grouped = new Map<number, StationMonths>();
    for (const row of data?.results ?? []) {
      const entry = grouped.get(row.station) ?? { ref: row, months: new Map<number, RainfallRow>() };
      entry.months.set(row.month, row);
      grouped.set(row.station, entry);
    }
    return [...grouped.values()];
  }, [data]);

  // The station drawn in the second chart: the one chosen in the grid, else the first in scope.
  const focus = stations.find((s) => s.ref.station === chosen) ?? stations[0];
  const series = MONTHS.map((month) => ({ month: fmtMonth(month), row: focus?.months.get(month), anomaly: focus?.months.get(month)?.anomaly_mm ?? null }));
  const focusRows = MONTHS.flatMap((month) => focus?.months.get(month) ?? []);
  const hasBaseline = focusRows.some((row) => row.anomaly_mm !== null);
  const filtered = Boolean(province || station || includeSuspect || year !== thisYear());

  const tip = ({ active, payload }: TipProps) => {
    const point = payload?.[0]?.payload as (typeof series)[number] | undefined;
    if (!active || !point?.row || !focus) return null;
    return <TooltipBox title={`${focus.ref.station_code} · ${point.month} ${data?.year ?? year}`} rows={readout(point.row, c)} />;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Rainfall anomalies"
        description="How each month's rainfall at each station compares with the long-term mean of that month, the station's precipitation baseline. Positive figures are wetter than the baseline, negative figures drier." />
      <FilterBar onReset={filtered ? () => { setYear(thisYear()); setProvince(""); setStation(""); setIncludeSuspect(false); } : undefined}>
        <YearInput id="rain-year" label="Year" value={year} onChange={setYear} />
        <SelectFilter id="rain-province" label="Province" value={province} onChange={setProvince} options={PROVINCE_OPTIONS} allLabel="All provinces" className="min-w-[14rem]" />
        <SelectFilter id="rain-station" label="Station" value={station} onChange={setStation} options={stationOptions} allLabel="All stations" className="min-w-[16rem]" />
        <ToggleFilter id="rain-suspect" label="Include Suspect readings" checked={includeSuspect} onChange={setIncludeSuspect} />
      </FilterBar>

      <ChartCard
        title={`Anomaly by station and month, ${data?.year ?? year}`}
        description="Month total minus the baseline mean of that month, in mm. Choose a station name to draw it in the chart below."
        query={query}
        empty={stations.length === 0}
        emptyTitle={`No rainfall readings for ${year}`}
        emptyHint="Change the year or the filters. Rejected readings are always left out; Suspect readings are left out unless you include them."
        chart={<AnomalyGrid stations={stations} year={data?.year ?? year} focus={focus?.ref.station ?? null} onFocus={setChosen} />}
        footer={<ScaleKey />}
        table={(
          <PlainTable caption="Rainfall anomalies by station and month" rows={data?.results ?? []} rowKey={(row) => `${row.station}-${row.month}`}
            columns={[
              { key: "station", header: "Station", cell: (row) => <StationLink id={row.station} code={row.station_code} name={row.station_name} /> },
              { key: "province", header: "Province", cell: (row) => row.province },
              ...FIGURE_COLUMNS,
            ]} />
        )}
      />

      {focus && (
        <ChartCard
          title={`${focus.ref.station_code} ${focus.ref.station_name}: monthly anomaly, ${data?.year ?? year}`}
          description="Month total minus the baseline mean, in mm. Bars above the line are wetter than the baseline, bars below it are drier."
          query={query}
          empty={!hasBaseline}
          emptyTitle="This station has no precipitation baseline"
          emptyHint="An anomaly needs the baseline mean of each month. Baselines are added by the station's own users in the station app."
          legend={<ChartLegend items={[
            { key: "wet", label: "Wetter than the baseline", color: c.wet },
            { key: "dry", label: "Drier than the baseline", color: c.dry },
          ]} />}
          chart={(
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={series} margin={CHART_MARGIN}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="month" {...axisStyle(c)} />
                <YAxis width={60} tickFormatter={(value: number) => fmtSigned(value, 0)} label={axisUnit(c, "mm")} {...axisStyle(c)} axisLine={false} />
                <Tooltip content={tip} cursor={{ fill: c.grid, fillOpacity: 0.5 }} isAnimationActive={false} />
                <ReferenceLine y={0} stroke={c.axis} />
                <Bar dataKey="anomaly" name="Anomaly" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {series.map((point) => <Cell key={point.month} fill={(point.anomaly ?? 0) >= 0 ? c.wet : c.dry} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          table={<PlainTable caption={`Monthly rainfall anomaly of ${focus.ref.station_code}`} rows={focusRows} rowKey={(row) => row.month} columns={FIGURE_COLUMNS} scroll={false} />}
        />
      )}
    </div>
  );
}
