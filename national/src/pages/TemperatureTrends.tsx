/**
 * Temperature trends (FR-014; screen SCR-014):
 *   GET /api/analysis/temperature-trends/?from_year=&to_year=[&province=&station=&include_suspect=true]
 * Per station: the mean air temperature of each year and, when there are enough years, the
 * least-squares trend in degrees Celsius per decade. Both are computed by AnalysisService.
 *
 * With many stations a line each in its own colour cannot be read, so one station is the subject
 * (drawn in colour, with its latest value written out) and the others are context in grey. The
 * station is chosen in the table under the chart. A year without readings is a gap in the line.
 */
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { CHART_MARGIN, ChartCard, ChartLegend, TooltipBox, axisStyle, axisUnit, useChartColors, type TipProps, type TipRow } from "../components/charts";
import { PlainTable } from "../components/DataTable";
import { Card, EmptyState, ErrorState, FilterBar, Notice, PageHeader, SelectFilter, Spinner, YearInput, cx } from "../components/ui";
import { useStations } from "../hooks/useLookups";
import { useFetch } from "../hooks/useResource";
import { fmtInt, fmtNumber, fmtSigned } from "../lib/format";
import type { TemperatureSeries, TemperatureTrends as Result } from "../services/analysis";
import { PROVINCE_OPTIONS, StationLink, ToggleFilter, thisYear } from "./shared";

const MAX_TIP_ROWS = 12;
const degrees = (value: number | null | undefined): string => (value === null || value === undefined ? "no data" : `${fmtNumber(value, 1)} °C`);

function Trend({ slope, minYears }: { slope: number | null; minYears: number }) {
  if (slope === null) return <span className="text-muted">needs {minYears} years of data</span>;
  const Icon = slope > 0 ? TrendingUp : slope < 0 ? TrendingDown : Minus;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold">
      <Icon className="h-4 w-4 text-ink-2" aria-hidden />
      {fmtSigned(slope, 2)} °C per decade
      <span className="font-normal text-ink-2">{slope > 0 ? "warming" : slope < 0 ? "cooling" : "no change"}</span>
    </span>
  );
}

export default function TemperatureTrends() {
  const c = useChartColors();
  const { options: stationOptions } = useStations();
  // The current year is incomplete, so the default range ends with the last full year (as the API does).
  const lastFull = thisYear() - 1;
  const [fromYear, setFromYear] = useState(lastFull - 14);
  const [toYear, setToYear] = useState(lastFull);
  const [province, setProvince] = useState("");
  const [station, setStation] = useState("");
  const [includeSuspect, setIncludeSuspect] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);

  const ordered = fromYear <= toYear;
  const query = useFetch<Result>("/analysis/temperature-trends/",
    { from_year: fromYear, to_year: toYear, province, station, include_suspect: includeSuspect ? "true" : undefined }, ordered);
  const data = query.data;
  const results = useMemo(() => data?.results ?? [], [data]);
  const focus = results.find((r) => r.station === chosen) ?? results[0];

  // One row per year of the range, one value per station: a year without readings stays empty.
  const { rows, lastYear } = useMemo(() => {
    if (!data) return { rows: [] as Array<Record<string, number>>, lastYear: null as number | null };
    const byYear = new Map<number, Record<string, number>>();
    for (let year = data.from_year; year <= data.to_year; year += 1) byYear.set(year, { year });
    for (const result of results) for (const point of result.series) {
      const row = byYear.get(point.year);
      if (row) row[result.station_code] = point.mean_c;
    }
    const last = focus ? focus.series[focus.series.length - 1]?.year ?? null : null;
    return { rows: [...byYear.values()], lastYear: last };
  }, [data, results, focus]);

  // The value axis runs over whole degrees at even steps, wide enough to hold every line in scope.
  // It need not start at zero: a line shows change, and zero degrees is not a baseline here.
  const axis = useMemo(() => {
    const values = results.flatMap((r) => r.series.map((point) => point.mean_c));
    if (values.length === 0) return { domain: [0, 1] as [number, number], ticks: [0, 1] };
    const low = Math.floor(Math.min(...values));
    const high = Math.ceil(Math.max(...values));
    const step = high - low <= 8 ? 1 : high - low <= 16 ? 2 : 5;
    const from = Math.floor(low / step) * step;
    const to = Math.max(from + step, Math.ceil(high / step) * step);
    const ticks: number[] = [];
    for (let tick = from; tick <= to; tick += step) ticks.push(tick);
    return { domain: [from, to] as [number, number], ticks };
  }, [results]);

  const filtered = Boolean(province || station || includeSuspect || fromYear !== lastFull - 14 || toYear !== lastFull);
  const reset = () => { setFromYear(lastFull - 14); setToYear(lastFull); setProvince(""); setStation(""); setIncludeSuspect(false); };

  const tip = ({ active, label, payload }: TipProps) => {
    const point = payload?.[0]?.payload as Record<string, number> | undefined;
    if (!active || !point || !focus) return null;
    const others = results.filter((r) => r.station !== focus.station && point[r.station_code] !== undefined)
      .sort((a, b) => point[b.station_code] - point[a.station_code]);
    const lines: TipRow[] = [
      { key: focus.station_code, value: degrees(point[focus.station_code]), label: `${focus.station_code} ${focus.station_name}`, color: c.series[0] },
      ...others.slice(0, MAX_TIP_ROWS).map((r) => ({ key: r.station_code, value: degrees(point[r.station_code]), label: r.station_code, color: c.deemphasis })),
    ];
    const more = others.length - MAX_TIP_ROWS;
    return <TooltipBox title={`Annual mean, ${label}`} rows={lines} note={more > 0 ? `and ${more} more stations: see the table view` : undefined} />;
  };

  // The subject line ends in a dot and its value; the other points carry no marker.
  const endDot = (props: { cx?: number; cy?: number; index?: number; payload?: Record<string, number> }) => {
    const { cx: x, cy: y, index, payload } = props;
    if (!focus || x == null || y == null || payload?.year !== lastYear) return <g key={`dot-${index}`} />;
    return (
      <g key={`dot-${index}`}>
        <circle cx={x} cy={y} r={5} fill={c.series[0]} stroke={c.surface} strokeWidth={2} />
        <text x={x - 8} y={y - 10} textAnchor="end" fontSize={11} fontWeight={600} fill={c.ink}>{degrees(payload[focus.station_code])}</text>
      </g>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Temperature trends"
        description="The mean air temperature of each year at each station, and the trend over the years chosen. Rejected readings are always left out." />
      <FilterBar onReset={filtered ? reset : undefined}>
        <YearInput id="temp-from" label="From year" value={fromYear} onChange={setFromYear} />
        <YearInput id="temp-to" label="To year" value={toYear} onChange={setToYear} />
        <SelectFilter id="temp-province" label="Province" value={province} onChange={setProvince} options={PROVINCE_OPTIONS} allLabel="All provinces" className="min-w-[14rem]" />
        <SelectFilter id="temp-station" label="Station" value={station} onChange={setStation} options={stationOptions} allLabel="All stations" className="min-w-[16rem]" />
        <ToggleFilter id="temp-suspect" label="Include Suspect readings" checked={includeSuspect} onChange={setIncludeSuspect} />
      </FilterBar>

      {!ordered ? <Notice tone="warn" title="The years are the wrong way round">The first year must not be after the last year.</Notice> : (
        <>
          <ChartCard
            title={focus ? `Annual mean temperature: ${focus.station_code} ${focus.station_name}` : "Annual mean temperature"}
            description={data ? `Mean of the readings of each year, ${data.from_year} to ${data.to_year}, in °C.` : "Mean of the readings of each year, in °C."}
            query={query}
            empty={results.length === 0}
            emptyTitle="No temperature readings in these years"
            emptyHint="Change the years or the filters."
            legend={focus && (
              <ChartLegend items={[
                { key: "focus", label: `${focus.station_code} ${focus.station_name}`, color: c.series[0], shape: "line" },
                ...(results.length > 1 ? [{ key: "others", label: `Other stations in scope (${fmtInt(results.length - 1)})`, color: c.deemphasis, shape: "line" as const }] : []),
              ]} />
            )}
            chart={(
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={rows} margin={{ ...CHART_MARGIN, top: 24 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="year" {...axisStyle(c)} />
                  <YAxis width={56} domain={axis.domain} ticks={axis.ticks} interval={0}
                    tickFormatter={(value: number) => fmtNumber(value, 0)} label={axisUnit(c, "°C")} {...axisStyle(c)} axisLine={false} />
                  <Tooltip content={tip} cursor={{ stroke: c.axis, strokeWidth: 1 }} isAnimationActive={false} />
                  {results.filter((r) => r.station !== focus?.station).map((r) => (
                    <Line key={r.station} type="linear" dataKey={r.station_code} name={r.station_code} stroke={c.deemphasis} strokeWidth={1.25}
                      dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
                  ))}
                  {focus && (
                    <Line key={`focus-${focus.station}`} type="linear" dataKey={focus.station_code} name={focus.station_code} stroke={c.series[0]} strokeWidth={2}
                      strokeLinejoin="round" strokeLinecap="round" dot={endDot} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
            footer={data && `A trend is given for a station with at least ${data.min_years_for_trend} years of readings in the range.`}
            table={(
              <PlainTable caption="Annual mean temperature by station and year"
                rows={results.flatMap((r) => r.series.map((point) => ({ ...point, station: r.station, station_code: r.station_code, station_name: r.station_name })))}
                rowKey={(row) => `${row.station}-${row.year}`}
                columns={[
                  { key: "station", header: "Station", cell: (row) => <StationLink id={row.station} code={row.station_code} name={row.station_name} /> },
                  { key: "year", header: "Year", cell: (row) => row.year },
                  { key: "mean", header: "Annual mean (°C)", align: "right", cell: (row) => fmtNumber(row.mean_c, 1) },
                  { key: "readings", header: "Readings", align: "right", cell: (row) => fmtInt(row.readings) },
                ]} />
            )}
          />

          <Card title="Trend by station" description="Choose a station to make it the subject of the chart above." padded={false}>
            {query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} />
              : !data ? <Spinner />
              : results.length === 0 ? <EmptyState title="No stations with temperature readings in these years" />
              : (
                <div className="p-4">
                  <PlainTable<TemperatureSeries> caption="Temperature trend by station" rows={results} rowKey={(row) => row.station} scroll={false}
                    columns={[
                      { key: "station", header: "Station", cell: (row) => (
                        <button type="button" aria-pressed={row.station === focus?.station} onClick={() => setChosen(row.station)} title="Show this station in the chart"
                          className={cx("rounded px-2 py-1 text-left hover:bg-subtle", row.station === focus?.station && "bg-subtle ring-1 ring-inset ring-line-strong")}>
                          <span className="font-semibold text-ink">{row.station_code}</span> <span className="text-ink-2">{row.station_name}</span>
                        </button>
                      ) },
                      { key: "province", header: "Province", cell: (row) => row.province },
                      { key: "years", header: "Years with readings", align: "right", cell: (row) => fmtInt(row.years) },
                      { key: "first", header: "First year", align: "right", cell: (row) => (row.series[0] ? `${row.series[0].year}: ${degrees(row.series[0].mean_c)}` : "no data") },
                      { key: "last", header: "Latest year", align: "right", cell: (row) => {
                        const last = row.series[row.series.length - 1];
                        return last ? `${last.year}: ${degrees(last.mean_c)}` : "no data";
                      } },
                      { key: "trend", header: "Trend", cell: (row) => <Trend slope={row.slope_c_per_decade} minYears={data.min_years_for_trend} /> },
                    ]} />
                </div>
              )}
          </Card>
        </>
      )}
    </div>
  );
}
