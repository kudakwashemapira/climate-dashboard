/**
 * Chart building blocks (CD-3.05 section 5). The rules they carry:
 *  - Every chart sits in a ChartCard, which gives it a table view. A value is never readable only by
 *    colour or only by hovering.
 *  - The unit is named in the description, on the value axis and in the tooltip.
 *  - A missing value is drawn as a gap and written "no data". It is never drawn as zero.
 *  - Colours come from lib/chartTheme.ts in a fixed order. Text never takes a series colour.
 * No figure is calculated here: charts only draw what /api/analysis/ returns.
 */
import { useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { CHART_COLORS, type ChartColors } from "../lib/chartTheme";
import { NO_DATA } from "../lib/format";
import { Card, EmptyState, ErrorState, Segmented, Spinner, cx } from "./ui";

export function useChartColors(): ChartColors {
  return CHART_COLORS[useTheme()];
}

/** The parts of a TanStack Query result a chart needs. */
export interface QueryState {
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * The frame of every chart: title, a description that names the measure and its unit, a switch
 * between the chart and its table, and the loading, error and empty states. While new data loads,
 * the previous drawing stays in place, dimmed, so the layout does not jump.
 */
export function ChartCard({ title, description, query, empty, emptyTitle, emptyHint, legend, chart, table, footer, className }: {
  title: string; description?: ReactNode; query: QueryState; empty?: boolean; emptyTitle?: string; emptyHint?: ReactNode;
  legend?: ReactNode; chart: ReactNode; table: ReactNode; footer?: ReactNode; className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const refreshing = query.isFetching && !query.isLoading;
  let body: ReactNode;
  if (query.error) body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  else if (query.isLoading) body = <Spinner />;
  else if (empty) body = <EmptyState title={emptyTitle ?? "No data for these filters"} hint={emptyHint} />;
  else {
    body = (
      <div className={cx("transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
        {view === "chart" ? <>{legend && <div className="mb-3">{legend}</div>}{chart}</> : table}
        {footer && <div className="mt-3 text-xs text-muted">{footer}</div>}
      </div>
    );
  }
  return (
    <Card title={title} description={description} className={className}
      actions={(
        <Segmented label={`${title}: chart or table`} value={view} onChange={setView}
          options={[
            { value: "chart", label: "Chart", icon: <BarChart3 className="h-3.5 w-3.5" aria-hidden /> },
            { value: "table", label: "Table", icon: <Table2 className="h-3.5 w-3.5" aria-hidden /> },
          ]} />
      )}>
      {body}
    </Card>
  );
}

// ---- legend and tooltip ---------------------------------------------------------------------------
export interface LegendItem {
  key: string;
  label: string;
  color: string;
  /** A box for bars and areas, a short stroke for lines. */
  shape?: "box" | "line";
  /** A figure shown after the label, for example a count. */
  detail?: string;
}

export function ChartLegend({ items, label = "Legend" }: { items: LegendItem[]; label?: string }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span aria-hidden className={item.shape === "line" ? "h-0.5 w-4 rounded-full" : "h-2.5 w-2.5 rounded-sm"} style={{ background: item.color }} />
          <span>{item.label}</span>
          {item.detail && <span className="font-semibold text-ink">{item.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface TipRow {
  key: string;
  label: string;
  value: string;
  color?: string;
}

/** The hover readout. The value leads and the series name follows; a short stroke keys the colour. */
export function TooltipBox({ title, rows, note }: { title?: ReactNode; rows: TipRow[]; note?: ReactNode }) {
  return (
    <div className="pointer-events-none max-w-xs rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      {title && <p className="mb-1 font-semibold text-ink">{title}</p>}
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            {row.color && <span aria-hidden className="h-0.5 w-3.5 shrink-0 rounded-full" style={{ background: row.color }} />}
            <span className="whitespace-nowrap font-semibold text-ink">{row.value}</span>
            <span className="text-ink-2">{row.label}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-1 text-muted">{note}</p>}
    </div>
  );
}

/** What Recharts passes to a custom tooltip, reduced to the parts used here. */
export interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ dataKey?: unknown; name?: unknown; value?: unknown; color?: string; payload?: unknown }>;
}

// ---- shared axis and grid settings ----------------------------------------------------------------
/** Recessive axes: muted labels, a hairline, no tick marks. */
export function axisStyle(c: ChartColors) {
  return { tick: { fill: c.muted, fontSize: 11 }, tickLine: false, axisLine: { stroke: c.axis } } as const;
}

/** The unit written along the value axis. */
export function axisUnit(c: ChartColors, unit: string) {
  return { value: unit, angle: -90, position: "insideLeft", offset: 12, style: { fill: c.muted, fontSize: 11, textAnchor: "middle" } } as const;
}

export const CHART_MARGIN = { top: 8, right: 12, bottom: 0, left: 0 } as const;

// ---- a tooltip for marks drawn in HTML ------------------------------------------------------------
interface Tip { x: number; y: number; content: ReactNode }

/** One floating readout that follows the pointer, and sits beside the row on keyboard focus. */
export function useHoverTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bind = (content: ReactNode) => ({
    onPointerMove: (e: PointerEvent<HTMLElement>) => setTip({ x: e.clientX, y: e.clientY, content }),
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent<HTMLElement>) => {
      const box = e.currentTarget.getBoundingClientRect();
      setTip({ x: box.left + Math.min(box.width / 2, 220), y: box.bottom - 6, content });
    },
    onBlur: () => setTip(null),
  });
  const node = tip && (
    <div className="pointer-events-none fixed z-50" style={{ left: Math.max(8, Math.min(tip.x + 14, window.innerWidth - 300)), top: Math.min(tip.y + 14, window.innerHeight - 140) }}>
      {tip.content}
    </div>
  );
  return { bind, node };
}

// ---- bars for comparing categories ----------------------------------------------------------------
export interface BarRow {
  key: string;
  label: string;
  /** null means there is nothing to draw: the row says "no data". */
  value: number | null;
  /** The value as text, already formatted with its unit. */
  display: string;
  /** More about the row, shown on hover and on keyboard focus. */
  detail?: string;
  color?: string;
}

/**
 * Horizontal bars with the value written at each tip: provinces, source categories. Thin bars from
 * one baseline, the data end rounded. Lengths are scaled to the largest value on screen.
 */
export function BarList({ rows, color, label, labelWidth = "10rem" }: { rows: BarRow[]; color: string; label: string; labelWidth?: string }) {
  const { bind, node } = useHoverTip();
  const max = Math.max(0, ...rows.map((r) => r.value ?? 0));
  return (
    <>
      <ul aria-label={label} className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.key} tabIndex={0}
            {...bind(<TooltipBox title={row.label} rows={[{ key: "v", label: row.detail ?? "", value: row.display, color: row.value === null ? undefined : row.color ?? color }]} />)}
            className="grid items-center gap-3 rounded px-1.5 py-1.5 outline-offset-0 hover:bg-subtle"
            style={{ gridTemplateColumns: `${labelWidth} minmax(0, 1fr) auto` }}>
            <span className="truncate text-ink-2" title={row.label}>{row.label}</span>
            <span className="block border-l border-line-strong py-0.5">
              {row.value !== null && max > 0 && (
                <span className="block h-2.5 rounded-r" style={{ width: `${(row.value / max) * 100}%`, minWidth: row.value > 0 ? 2 : 0, background: row.color ?? color }} />
              )}
            </span>
            <span className={cx("w-28 text-right text-xs", row.value === null ? "text-muted" : "font-semibold text-ink")} style={{ fontVariantNumeric: "tabular-nums" }}>
              {row.value === null ? NO_DATA : row.display}
            </span>
          </li>
        ))}
      </ul>
      {node}
    </>
  );
}

export interface StackSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface StackRow {
  key: string;
  label: string;
  /** The row total as text. It comes from the API; it is not summed here. */
  display: string;
  segments: StackSegment[];
}

/**
 * Horizontal stacked bars: one row per category, one segment per class, a gap in the surface colour
 * between segments. The readout lists every class of the row, so the pointer never has to find one.
 */
export function StackedBarList({ rows, label, labelWidth = "10rem", unit = "" }: { rows: StackRow[]; label: string; labelWidth?: string; unit?: string }) {
  const { bind, node } = useHoverTip();
  // Bar lengths only: the longest row fills the track. The totals shown are the API's own.
  const size = (row: StackRow) => row.segments.reduce((sum, s) => sum + s.value, 0);
  const max = Math.max(0, ...rows.map(size));
  return (
    <>
      <ul aria-label={label} className="space-y-0.5">
        {rows.map((row) => {
          const drawn = row.segments.filter((s) => s.value > 0);
          return (
            <li key={row.key} tabIndex={0}
              {...bind(<TooltipBox title={row.label} rows={row.segments.map((s) => ({ key: s.key, label: s.label, value: `${s.value}${unit}`, color: s.color }))} />)}
              className="grid items-center gap-3 rounded px-1.5 py-1.5 outline-offset-0 hover:bg-subtle"
              style={{ gridTemplateColumns: `${labelWidth} minmax(0, 1fr) auto` }}>
              <span className="truncate text-ink-2" title={row.label}>{row.label}</span>
              <span className="block border-l border-line-strong py-0.5">
                <span className="flex h-2.5 gap-0.5" style={{ width: max > 0 ? `${(size(row) / max) * 100}%` : 0 }}>
                  {drawn.map((s, i) => (
                    <span key={s.key} className={cx("block h-full", i === drawn.length - 1 && "rounded-r")} style={{ flexGrow: s.value, flexBasis: 0, minWidth: 2, background: s.color }} />
                  ))}
                </span>
              </span>
              <span className="w-16 text-right text-xs font-semibold text-ink" style={{ fontVariantNumeric: "tabular-nums" }}>{row.display}</span>
            </li>
          );
        })}
      </ul>
      {node}
    </>
  );
}
