/**
 * Regional comparison (FR-005, FR-014; screen SCR-017):
 *   GET /api/analysis/regional/?metric=PRECIP_MM&year=[&include_suspect=true]
 * The ten provinces side by side for one metric and year. For each station the server takes the
 * year's total (rainfall) or mean (every other metric), then gives the mean of those station
 * figures per province. A province where no station reported has no value: it is listed as
 * "no data" and never drawn as zero.
 *
 * Regions are named by province only; station coordinates are never used here (CD-3.05 section 5).
 */
import { useState } from "react";
import { BarList, ChartCard, useChartColors } from "../components/charts";
import { PlainTable } from "../components/DataTable";
import { FilterBar, PageHeader, SelectFilter, YearInput } from "../components/ui";
import { useMetrics } from "../hooks/useLookups";
import { useFetch } from "../hooks/useResource";
import { fmtInt, fmtReading } from "../lib/format";
import type { Regional } from "../services/analysis";
import { ToggleFilter, thisYear } from "./shared";

const DEFAULT_METRIC = "PRECIP_MM";

export default function RegionalComparison() {
  const c = useChartColors();
  const { options: metricOptions } = useMetrics();
  const [metric, setMetric] = useState(DEFAULT_METRIC);
  const [year, setYear] = useState(thisYear());
  const [includeSuspect, setIncludeSuspect] = useState(false);

  const query = useFetch<Regional>("/analysis/regional/", { metric, year, include_suspect: includeSuspect ? "true" : undefined });
  const data = query.data;
  const filtered = metric !== DEFAULT_METRIC || year !== thisYear() || includeSuspect;
  const value = (amount: number | null): string => fmtReading(amount, data?.unit, data?.metric);

  // Highest first, so the order can be read as a ranking; provinces without a value go last.
  const ranked = [...(data?.results ?? [])].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.province.localeCompare(b.province));
  const reporting = (row: Regional["results"][number]): string => `${fmtInt(row.stations_reporting)} of ${fmtInt(row.stations)} stations reporting`;

  return (
    <div className="space-y-4">
      <PageHeader title="Regional comparison"
        description="The provinces side by side for one metric and one year. Rainfall is compared as the yearly total, every other metric as the yearly mean." />
      <FilterBar onReset={filtered ? () => { setMetric(DEFAULT_METRIC); setYear(thisYear()); setIncludeSuspect(false); } : undefined}>
        <SelectFilter id="regional-metric" label="Metric" value={metric} onChange={setMetric} options={metricOptions} allLabel={null} className="min-w-[16rem]" />
        <YearInput id="regional-year" label="Year" value={year} onChange={setYear} />
        <ToggleFilter id="regional-suspect" label="Include Suspect readings" checked={includeSuspect} onChange={setIncludeSuspect} />
      </FilterBar>

      <ChartCard
        title={data ? `${data.metric_name} by province, ${data.year}` : "By province"}
        description={data ? `${data.aggregation} in each province, in ${data.unit}. Highest first.` : undefined}
        query={query}
        empty={!data || data.results.length === 0}
        emptyTitle="No stations are registered yet"
        chart={(
          <BarList label={data ? `${data.metric_name} by province` : "By province"} color={c.series[0]} labelWidth="12rem"
            rows={ranked.map((row) => ({ key: row.province, label: row.province, value: row.value, display: value(row.value), detail: `${reporting(row)}, ${fmtInt(row.readings)} readings` }))} />
        )}
        footer="A province where no station reported in the year is listed as no data. Rejected readings are always left out."
        table={(
          <PlainTable caption="Regional comparison by province" rows={ranked} rowKey={(row) => row.province} scroll={false}
            columns={[
              { key: "province", header: "Province", cell: (row) => <span className="font-semibold">{row.province}</span> },
              { key: "value", header: data ? `${data.metric_name} (${data.unit})` : "Value", align: "right", cell: (row) => value(row.value) },
              { key: "reporting", header: "Stations reporting", align: "right", cell: (row) => `${fmtInt(row.stations_reporting)} of ${fmtInt(row.stations)}` },
              { key: "readings", header: "Readings used", align: "right", cell: (row) => fmtInt(row.readings) },
            ]} />
        )}
      />
    </div>
  );
}
