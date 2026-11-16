/**
 * Carbon output (FR-014, FR-015; screen SCR-015):
 *   GET /api/analysis/carbon-output/?year=[&province=&source_category=]
 * Totals of the emission logs whose period starts in the year, in tonnes of CO2 equivalent: the
 * year total, and the same logs split by source category, by province and by quarter. All totals
 * come from AnalysisService. A log counts in the quarter its period starts in.
 *
 * A source category keeps one colour on this screen whatever the filters are, so the bars of the
 * first chart and the segments of the last one can be matched.
 */
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Factory, Layers, MapPin } from "lucide-react";
import { BarList, CHART_MARGIN, ChartCard, ChartLegend, TooltipBox, axisStyle, axisUnit, useChartColors, type TipProps } from "../components/charts";
import { PlainTable } from "../components/DataTable";
import { ErrorState, FilterBar, KpiCard, PageHeader, SelectFilter, Spinner, YearInput } from "../components/ui";
import { useFetch } from "../hooks/useResource";
import type { ChartColors } from "../lib/chartTheme";
import { fmtCompact, fmtNumber } from "../lib/format";
import type { CarbonOutput as Result } from "../services/analysis";
import { CARBON_CATEGORIES } from "../services/types";
import { PROVINCE_OPTIONS, thisYear } from "./shared";

const UNIT = "tCO₂e";
const tonnes = (value: number): string => `${fmtNumber(value, 1)} ${UNIT}`;

/**
 * The colour of a source category. The suggested categories take the palette slots in a fixed
 * order; a category typed in by a station takes the next free slot in alphabetical order, and
 * any beyond the palette share the grey, so no colour is ever reused for two named categories.
 */
function useCategoryColor(seen: string[]): (category: string) => string {
  const c: ChartColors = useChartColors();
  return useMemo(() => {
    const extra = [...new Set(seen)].filter((name) => !CARBON_CATEGORIES.includes(name)).sort();
    const order = [...CARBON_CATEGORIES, ...extra];
    return (category: string) => c.series[order.indexOf(category)] ?? c.deemphasis;
  }, [c, seen]);
}

export default function CarbonOutput() {
  const c = useChartColors();
  const [year, setYear] = useState(thisYear());
  const [province, setProvince] = useState("");
  const [category, setCategory] = useState("");
  // Categories met so far in this session, so the pick list keeps its choices while one is selected.
  const [known, setKnown] = useState<string[]>(CARBON_CATEGORIES);

  const query = useFetch<Result>("/analysis/carbon-output/", { year, province, source_category: category });
  const data = query.data;
  const categories = useMemo(() => data?.categories ?? [], [data]);
  const fresh = categories.filter((name) => !known.includes(name));
  if (fresh.length > 0) setKnown([...known, ...fresh]);
  const colorOf = useCategoryColor(known);

  const quarters = useMemo(() => {
    const byQuarter = new Map<string, Record<string, number | string>>();
    for (const row of data?.by_quarter ?? []) {
      const entry = byQuarter.get(row.quarter) ?? { quarter: row.quarter };
      entry[row.source_category] = row.total_tonnes;
      byQuarter.set(row.quarter, entry);
    }
    return ["Q1", "Q2", "Q3", "Q4"].map((quarter) => byQuarter.get(quarter) ?? { quarter });
  }, [data]);

  const filtered = Boolean(province || category || year !== thisYear());
  const shown = data?.year ?? year;
  const empty = !data || data.by_category.length === 0;
  const emptyProps = { emptyTitle: `No emission logs for ${shown}`, emptyHint: "Change the year or the filters. Emission logs are entered on the Carbon emissions screen." };

  const quarterTip = ({ active, label, payload }: TipProps) => {
    const point = payload?.[0]?.payload as Record<string, number | string> | undefined;
    if (!active || !point) return null;
    return (
      <TooltipBox title={`${label} ${shown}`}
        rows={categories.filter((name) => typeof point[name] === "number").map((name) => ({ key: name, value: tonnes(point[name] as number), label: name, color: colorOf(name) }))} />
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Carbon output"
        description="Emissions logged by stations, in tonnes of CO₂ equivalent, by source category, province and quarter. A log counts in the year and quarter its period starts in." />
      <FilterBar onReset={filtered ? () => { setYear(thisYear()); setProvince(""); setCategory(""); } : undefined}>
        <YearInput id="carbon-year" label="Year" value={year} onChange={setYear} />
        <SelectFilter id="carbon-province" label="Province" value={province} onChange={setProvince} options={PROVINCE_OPTIONS} allLabel="All provinces" className="min-w-[14rem]" />
        <SelectFilter id="carbon-category" label="Source category" value={category} onChange={setCategory} options={[...known].sort().map((name) => ({ value: name, label: name }))} allLabel="All categories" className="min-w-[14rem]" />
      </FilterBar>

      {query.error ? <div className="card"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>
        : !data ? <div className="card"><Spinner /></div>
        : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))" }}>
            <KpiCard label={`Total emissions, ${data.year}`} value={fmtNumber(data.total_tonnes, 1)} detail="Tonnes of CO₂ equivalent (tCO₂e)" icon={Factory} />
            <KpiCard label="Largest source category" value={data.by_category[0]?.source_category ?? "no data"}
              detail={data.by_category[0] ? tonnes(data.by_category[0].total_tonnes) : "No emission logs in scope"} icon={Layers} />
            <KpiCard label="Province with the highest emissions" value={data.by_province[0]?.province ?? "no data"}
              detail={data.by_province[0] ? tonnes(data.by_province[0].total_tonnes) : "No emission logs in scope"} icon={MapPin} />
          </div>
        )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <ChartCard title="By source category" description={`Total for ${shown}, in ${UNIT}, largest first.`} query={query} empty={empty} {...emptyProps}
            chart={(
              <BarList label="Emissions by source category" color={c.series[0]} labelWidth="11rem"
                rows={(data?.by_category ?? []).map((row) => ({ key: row.source_category, label: row.source_category, value: row.total_tonnes, display: tonnes(row.total_tonnes), detail: `in ${shown}`, color: colorOf(row.source_category) }))} />
            )}
            table={(
              <PlainTable caption="Emissions by source category" rows={data?.by_category ?? []} rowKey={(row) => row.source_category} scroll={false}
                columns={[
                  { key: "category", header: "Source category", cell: (row) => row.source_category },
                  { key: "tonnes", header: `Emissions (${UNIT})`, align: "right", cell: (row) => fmtNumber(row.total_tonnes, 1) },
                ]} />
            )} />
          <ChartCard title="By quarter and source category" description={`One column per quarter of ${shown}, in ${UNIT}.`} query={query} empty={empty} {...emptyProps}
            legend={<ChartLegend items={categories.map((name) => ({ key: name, label: name, color: colorOf(name) }))} />}
            chart={(
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={quarters} margin={CHART_MARGIN}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="quarter" {...axisStyle(c)} />
                  <YAxis width={60} tickFormatter={fmtCompact} label={axisUnit(c, UNIT)} {...axisStyle(c)} axisLine={false} />
                  <Tooltip content={quarterTip} cursor={{ fill: c.grid, fillOpacity: 0.5 }} isAnimationActive={false} />
                  {categories.map((name, index) => (
                    <Bar key={name} dataKey={name} name={name} stackId="quarter" fill={colorOf(name)} stroke={c.surface} strokeWidth={2} maxBarSize={24}
                      radius={index === categories.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
            table={(
              <PlainTable caption="Emissions by quarter and source category" rows={data?.by_quarter ?? []} rowKey={(row) => `${row.quarter}-${row.source_category}`}
                columns={[
                  { key: "quarter", header: "Quarter", cell: (row) => `${row.quarter} ${shown}` },
                  { key: "category", header: "Source category", cell: (row) => row.source_category },
                  { key: "tonnes", header: `Emissions (${UNIT})`, align: "right", cell: (row) => fmtNumber(row.total_tonnes, 1) },
                ]} />
            )} />
        </div>
        <ChartCard title="By province" description={`Total for ${shown}, in ${UNIT}, largest first.`} query={query} empty={empty} {...emptyProps}
          footer="A province with no emission logs in the year is not listed."
          chart={(
            <BarList label="Emissions by province" color={c.series[0]} labelWidth="11rem"
              rows={(data?.by_province ?? []).map((row) => ({ key: row.province, label: row.province, value: row.total_tonnes, display: tonnes(row.total_tonnes), detail: `in ${shown}` }))} />
          )}
          table={(
            <PlainTable caption="Emissions by province" rows={data?.by_province ?? []} rowKey={(row) => row.province} scroll={false}
              columns={[
                { key: "province", header: "Province", cell: (row) => row.province },
                { key: "tonnes", header: `Emissions (${UNIT})`, align: "right", cell: (row) => fmtNumber(row.total_tonnes, 1) },
              ]} />
          )} />
      </div>
    </div>
  );
}
