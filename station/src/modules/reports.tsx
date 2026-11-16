/**
 * Reports and exports (FR-017, UC-007; screens SCR-018, SCR-019 and SCR-039):
 *   GET  /api/reports/types/            the record sets, their filters, the file formats and limits
 *   POST /api/reports/                  build a report: {report_type, output_format, filters, name}
 *   GET  /api/reports/                  generated reports, newest first (own station, or all for a superadmin)
 *   GET  /api/reports/<id>/download/    the stored file, until it expires
 *   POST /api/reports/monthly/          the monthly summary PDF of one month (MonthlySummary)
 *
 * The report builder asks for a record set, its filters and a format (Excel, CSV or PDF). The server
 * writes the file, keeps it for a number of days and records the export in the audit trail. The
 * list below also holds every file made with the Export buttons of the record screens, because
 * both go through the same service. A file only ever holds the rows the account may see.
 */
import { useState, type FormEvent } from "react";
import { Download, FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { DataTable, Pagination } from "../components/DataTable";
import { useToast } from "../components/Toast";
import { Badge, Button, Card, Choice, ErrorState, Field, Notice, PageHeader, Segmented, Spinner } from "../components/ui";
import { useMetrics } from "../hooks/useLookups";
import { useAction, useFetch, useList } from "../hooks/useResource";
import { fmtDateTime, fmtInt } from "../lib/format";
import { describeError, download, send } from "../services/http";
import type { GeneratedReport } from "../services/types";
import { useStationScope } from "./common";

type Output = "xlsx" | "csv" | "pdf";

interface FilterField { name: string; label: string; kind: "select" | "date" | "text"; options?: string[] }
interface ReportType { key: string; label: string; filters: FilterField[]; columns: string[] }
interface ReportCatalogue {
  types: ReportType[];
  formats: Array<{ value: Output; label: string }>;
  limits: { pdf: number; xlsx: number };
  file_days: number;
}

const FORMAT_LABEL: Record<string, string> = { xlsx: "Excel", csv: "CSV", pdf: "PDF" };
const FORMAT_ICON = { xlsx: FileSpreadsheet, csv: FileDown, pdf: FileText } as const;

/** {observed_from: "2026-01-01", metric: "TEMP_C"} -> "observed from 2026-01-01; metric TEMP_C". */
function filtersInWords(filters: unknown): string {
  if (!filters || typeof filters !== "object") return "";
  return Object.entries(filters as Record<string, unknown>).map(([key, value]) => `${key.replace(/_/g, " ")} ${String(value)}`).join("; ");
}

function GeneratedReports({ pick, catalogue }: { pick: boolean; catalogue: ReportCatalogue }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<number | null>(null);
  const list = useList<GeneratedReport>("/reports/", { page, page_size: 10 });
  const labels = new Map(catalogue.types.map((t) => [t.key, t.label]));
  labels.set("monthly_summary", "Monthly summary");

  const fetchAgain = async (report: GeneratedReport) => {
    setBusy(report.id);
    try {
      await download(`/reports/${report.id}/download/`, undefined, `${report.report_type}.${report.output_format}`);
    } catch (error) {
      toast.error(describeError(error));
      list.refetch(); // an expired file shows as such
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold text-ink">Generated reports</h2>
      <p className="mb-3 max-w-3xl text-ink-2">
        Every report and export, newest first. A file can be downloaded again for {fmtInt(catalogue.file_days)} days (a monthly summary for a year); after that it is
        removed and the same choices give a fresh one. Each generation and each download is recorded in the audit trail.
      </p>
      <DataTable
        caption="Generated reports"
        rows={list.data?.results}
        rowKey={(row) => row.id}
        loading={list.isLoading}
        refreshing={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        empty={{ title: "No report has been generated yet", hint: "Build one above, or use the Export buttons on a record screen." }}
        columns={[
          { key: "when", header: "Generated (CAT)", cell: (row) => <span className="whitespace-nowrap">{fmtDateTime(row.created_at)}</span> },
          { key: "name", header: "Report", cell: (row) => <span className="font-medium">{row.name}</span> },
          { key: "set", header: "Records", cell: (row) => labels.get(row.report_type) ?? row.report_type },
          ...(pick ? [{ key: "scope", header: "Scope", cell: (row: GeneratedReport) => row.station_code ?? "All stations" }] : []),
          { key: "filters", header: "Filters", cell: (row) => <span className="text-ink-2">{filtersInWords(row.filters) || "none"}</span> },
          { key: "rows", header: "Rows", align: "right", cell: (row) => (row.row_count === null ? "" : fmtInt(row.row_count)) },
          { key: "format", header: "Format", cell: (row) => <Badge tone="neutral" icon={false}>{FORMAT_LABEL[row.output_format] ?? row.output_format}</Badge> },
          { key: "who", header: "By", cell: (row) => row.requested_by_email
            ?? <span className="text-muted">{row.report_type === "monthly_summary" ? "Monthly schedule" : "account removed"}</span> },
        ]}
        actions={(row) => (row.available
          ? <Button size="sm" icon={<Download className="h-3.5 w-3.5" aria-hidden />} loading={busy === row.id} disabled={busy !== null} onClick={() => fetchAgain(row)}>Download</Button>
          : <span className="pr-2 text-xs text-muted">file expired</span>)}
        footer={list.data && <Pagination page={page} pageSize={10} count={list.data.count} onPage={setPage} />}
      />
    </div>
  );
}

function ReportBuilder({ catalogue }: { catalogue: ReportCatalogue }) {
  const s = useStationScope();
  const { options: metricOptions } = useMetrics();
  const toast = useToast();
  const [typeKey, setTypeKey] = useState(catalogue.types[0]?.key ?? "");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [station, setStation] = useState("");
  const [name, setName] = useState("");
  const [output, setOutput] = useState<Output>("xlsx");
  const [problem, setProblem] = useState<unknown>(null);
  const build = useAction<GeneratedReport, Record<string, unknown>>((body) => send("POST", "/reports/", body));
  const type = catalogue.types.find((t) => t.key === typeKey);
  const change = (field: string, value: string) => setFormData((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!type) return;
    setProblem(null);
    // Only the filters of the chosen record set are sent, and only those that were filled in.
    const filters: Record<string, string> = {};
    for (const f of type.filters) if (formData[f.name]) filters[f.name] = formData[f.name];
    if (s.pick && station) filters.station = station;
    try {
      const report = await build.mutateAsync({ report_type: type.key, output_format: output, filters, name: name.trim() });
      await download(`/reports/${report.id}/download/`, undefined, `${report.report_type}.${report.output_format}`);
      toast.success(`The report was generated with ${fmtInt(report.row_count ?? 0)} rows and downloaded.`);
    } catch (error) {
      setProblem(error);
    }
  };

  return (
    <Card title="Build a report" description="Choose what to report on, narrow it with filters, and pick a file format. Columns follow the record screens.">
      <form onSubmit={submit} className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Records" htmlFor="report-type" required>
          <Choice id="report-type" value={typeKey} onChange={(value) => { setTypeKey(value); setFormData({}); setProblem(null); }}
            options={catalogue.types.map((t) => ({ value: t.key, label: t.label }))} />
        </Field>
        {s.pick && (
          <Field label="Station" htmlFor="report-station" hint="Leave on All stations for a national report.">
            <Choice id="report-station" value={station} onChange={setStation} options={s.stationOptions} emptyLabel="All stations" />
          </Field>
        )}
        {(type?.filters ?? []).map((f) => {
          const id = `report-filter-${f.name}`;
          const choices = f.name === "metric" ? metricOptions : (f.options ?? []).map((o) => ({ value: o, label: o === "true" ? "Yes" : o === "false" ? "No" : o }));
          return (
            <Field key={`${typeKey}-${f.name}`} label={f.label} htmlFor={id}>
              {f.kind === "date" ? (
                <input id={id} type="date" className="input" value={formData[f.name] ?? ""} onChange={(e) => change(f.name, e.target.value)} />
              ) : f.kind === "select" || f.name === "metric" ? (
                <Choice id={id} value={formData[f.name] ?? ""} onChange={(value) => change(f.name, value)} options={choices} emptyLabel="All" />
              ) : (
                <input id={id} className="input" value={formData[f.name] ?? ""} onChange={(e) => change(f.name, e.target.value)} placeholder="Exact value; empty for all" />
              )}
            </Field>
          );
        })}
        <Field label="Report name" htmlFor="report-name" hint="Shown in the list below and in the heading of a PDF.">
          <input id="report-name" className="input" maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder={type?.label} />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-4">
          <Segmented<Output> label="File format" value={output} onChange={setOutput}
            options={catalogue.formats.map((f) => {
              const Icon = FORMAT_ICON[f.value];
              return { value: f.value, label: f.value === "xlsx" ? "Excel (.xlsx)" : f.label, icon: <Icon className="h-3.5 w-3.5" aria-hidden /> };
            })} />
          <Button variant="primary" type="submit" loading={build.isPending} disabled={!type} icon={<FileDown className="h-4 w-4" aria-hidden />}>Generate the report</Button>
          <p className="text-xs text-muted">
            {output === "pdf" ? `A PDF is a formatted report of up to ${fmtInt(catalogue.limits.pdf)} rows. Narrow the filters, or choose CSV for more.`
              : output === "xlsx" ? `An Excel file holds up to ${fmtInt(catalogue.limits.xlsx)} rows. Choose CSV for more.`
              : "A CSV file has no row limit. Times are written in Central Africa Time."}
          </p>
        </div>
      </form>
      {type && <p className="mt-4 text-xs text-muted">Columns: {type.columns.join(", ")}.</p>}
      {problem != null && <div className="mt-4"><Notice tone="crit" title="The report could not be generated">{describeError(problem)}</Notice></div>}
    </Card>
  );
}

/** "YYYY-MM" of this month and of the one before, for the month field. */
function monthOf(offset: number): string {
  const day = new Date();
  day.setDate(1);
  day.setMonth(day.getMonth() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The monthly summary PDF (CD-3.05: DCCES leadership asks for monthly PDF reports): headline figures,
 * every station of the scope, and the month's extreme weather events, from the same calculations as
 * the dashboard screens. POST /api/reports/monthly/ {year, month[, station]}.
 */
function MonthlySummary() {
  const s = useStationScope();
  const toast = useToast();
  const [month, setMonth] = useState(monthOf(-1));
  const [station, setStation] = useState("");
  const [problem, setProblem] = useState<unknown>(null);
  const make = useAction<GeneratedReport, Record<string, unknown>>((body) => send("POST", "/reports/monthly/", body));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    const [year, number] = month.split("-").map(Number);
    if (!year || !number) { setProblem(new Error("Choose a month.")); return; }
    try {
      const report = await make.mutateAsync({ year, month: number, ...(s.pick && station ? { station: Number(station) } : {}) });
      await download(`/reports/${report.id}/download/`, undefined, `monthly-summary-${month}.pdf`);
      toast.success(`${report.name} was made and downloaded. It stays in the list below for a year.`);
    } catch (error) {
      setProblem(error);
    }
  };

  return (
    <Card title="Monthly summary"
      description={s.pick
        ? "One PDF per month: the headline figures, every station, rainfall against the baseline and the month's extreme weather events. The national summary of the month before is also made automatically on the 1st of each month."
        : "One PDF per month for this station: its headline figures, rainfall against the baseline and the month's extreme weather events."}>
      <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3">
        <Field label="Month" htmlFor="monthly-month" required>
          <input id="monthly-month" type="month" className="input" max={monthOf(0)} value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        {s.pick && (
          <Field label="Station" htmlFor="monthly-station">
            <Choice id="monthly-station" value={station} onChange={setStation} options={s.stationOptions} emptyLabel="All stations" />
          </Field>
        )}
        <Button variant="primary" type="submit" loading={make.isPending} icon={<FileText className="h-4 w-4" aria-hidden />}>Make the PDF</Button>
      </form>
      {problem != null && <div className="mt-3"><Notice tone="crit">{describeError(problem)}</Notice></div>}
    </Card>
  );
}

export function ReportsScreen() {
  const s = useStationScope();
  const catalogue = useFetch<ReportCatalogue>("/reports/types/");
  return (
    <div className="space-y-5">
      <PageHeader title="Reports and exports"
        description={s.pick
          ? "Build a report from any record set, for one station or for all of them, as Excel, CSV or PDF. Every export is recorded in the audit trail."
          : "Build a report from this station's records, as Excel, CSV or PDF. Every export is recorded in the audit trail."} />
      {catalogue.error ? <div className="card"><ErrorState error={catalogue.error} onRetry={() => catalogue.refetch()} /></div>
        : !catalogue.data ? <div className="card"><Spinner /></div>
        : (
          <>
            <ReportBuilder catalogue={catalogue.data} />
            <MonthlySummary />
            <GeneratedReports pick={s.pick} catalogue={catalogue.data} />
          </>
        )}
    </div>
  );
}
