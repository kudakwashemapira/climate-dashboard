/**
 * Bulk upload of observations (UC-002; screens SCR-033 and SCR-034):
 *   GET  /api/weather/observations/bulk_upload_template/?output=csv|xlsx   the empty template
 *   POST /api/weather/observations/bulk_upload/?preview=true               check a file, save nothing
 *   POST /api/weather/observations/bulk_upload/                            save the valid rows
 *   POST /api/weather/observations/bulk_upload/?confirm_creation=true      the same, creating new sensors
 *   GET  /api/weather/upload-batches/?entity=WeatherObservation            upload history
 *   POST /api/weather/observations/bulk_delete/ {batch_id, confirm}        delete one upload's rows
 *
 * The reply to an upload is {count, success_count, error_count, errors, requires_approval,
 * new_sensor_codes, preview, batch_id} (CD-3.04 section 4.2). When at least one row is saved the
 * server answers 200; when nothing is saved it answers 400 with the same body, so that case is shown
 * as a result, not as a failure. If no reply arrives at all, the file may still have been saved: the
 * user is sent to the history instead of being told to try again.
 *
 * A file that names a sensor code the station does not have is not saved at once: the server answers
 * requires_approval and creates nothing. The user is asked, and only the second, confirmed call
 * creates the sensors and saves the rows (FR-009, UC-002).
 */
import { useRef, useState, type ReactNode } from "react";
import { CheckCircle2, FileDown, FileSpreadsheet, FileUp, ListChecks, Trash2, Upload } from "lucide-react";
import { ConfirmDialog } from "../components/Dialog";
import { DataTable, Pagination, PlainTable } from "../components/DataTable";
import { useToast } from "../components/Toast";
import { Checkbox } from "../components/shadcn/checkbox";
import { Badge, Button, Choice, FilterBar, IconButton, Notice, PageHeader, cx } from "../components/ui";
import { useMetrics } from "../hooks/useLookups";
import { useTerms } from "../hooks/useTerms";
import { useAction, useList } from "../hooks/useResource";
import { fmtDateTime, fmtInt, fmtNumber } from "../lib/format";
import { BATCH_TONE } from "../lib/tones";
import type { BulkDeleteResult, UploadResult } from "../services/analysis";
import { ApiError, NetworkError, describeError, download, send, upload, type Params } from "../services/http";
import { useScope } from "../services/session";
import { QUALITY_FLAGS, type BatchStatus, type UploadBatch } from "../services/types";
import { useStationScope, type ModuleProps } from "./common";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // nginx accepts request bodies up to 20 MB
const MAX_ERRORS_SHOWN = 200;

const COLUMN_NAMES: Record<string, string> = {
  sensor_code: "Sensor Code", metric: "Metric Code", observed_at: "Observed At", value: "Value", unit: "Unit",
  quality_flag: "Quality Flag", sensor: "Sensor Code", calibrated_on: "Calibrated On", performed_by: "Performed By",
  result: "Result", next_due_on: "Next Due On", reference_standard: "Reference Standard", drift_value: "Drift Value",
  notes: "Notes", non_field_errors: "Whole row", period_start: "Period Start", period_end: "Period End",
  source_category: "Source Category", co2e_tonnes: "CO2e Tonnes", method: "Method", event_type: "Event Type", severity: "Severity",
  started_at: "Started At", ended_at: "Ended At", peak_metric_code: "Peak Metric Code", peak_value: "Peak Value",
  alert_issued: "Alert Issued", description: "Description", source_type: "Source Type", generation_kwh: "Generation kWh",
  installed_capacity_kw: "Installed Capacity kW", hazard_type: "Hazard Type", rating: "Rating", assessed_on: "Assessed On",
  assessed_by: "Assessed By", logged_on: "Logged On", power_source: "Power Source", power_uptime_pct: "Power Uptime %",
  connectivity_type: "Connectivity Type", connectivity_uptime_pct: "Connectivity Uptime %",
};

interface ErrorLine { id: string; row: number; column: string; message: string }

/** {row, errors: {field: [messages]}} -> one line per row and column, in file order. */
function errorLines(result: UploadResult): ErrorLine[] {
  const lines: ErrorLine[] = [];
  for (const entry of result.errors) {
    for (const [field, messages] of Object.entries(entry.errors)) {
      lines.push({ id: `${entry.row}-${field}`, row: entry.row, column: COLUMN_NAMES[field] ?? field.replace(/_/g, " "),
        message: Array.isArray(messages) ? messages.join(" ") : String(messages) });
    }
  }
  return lines;
}

const isUploadResult = (body: unknown): body is UploadResult =>
  typeof body === "object" && body !== null && "success_count" in body && "errors" in body;

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-subtle/60 px-3.5 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold leading-tight text-ink">{value}</p>
    </div>
  );
}


// ---- correcting flagged rows in the page (SCR-033: an editable preview) ------------------------------
const MAX_FIX_ROWS = 100;

/** One CSV cell: quoted when it holds a comma, a quote or a line break. */
const csvCell = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const correctedName = (name: string): string => `${name.replace(/\.(csv|xlsx)$/i, "").replace(/-corrected$/, "")}-corrected.csv`;

/**
 * The rows a check flagged, with an input per column and each column's problem under it. "Check the
 * corrected file" rebuilds the whole file from every row (the good rows as they were) and checks it
 * again through the same server rules, so the upload that follows is one file and one batch.
 */
function FixRows({ result, fileName, busy, onCheck }: {
  result: UploadResult; fileName: string; busy: boolean; onCheck: (corrected: File) => void;
}) {
  const rowsData = result.rows_data ?? [];
  const problems = new Map(result.errors.map((entry) => [entry.row, entry.errors]));
  const flagged = rowsData.filter((row) => problems.has(Number(row.row)));
  const columns: string[] = [];
  for (const row of rowsData) for (const key of Object.keys(row)) if (key !== "row" && !columns.includes(key)) columns.push(key);
  for (const entry of result.errors) for (const key of Object.keys(entry.errors)) if (key !== "non_field_errors" && !columns.includes(key)) columns.push(key);

  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [left, setLeft] = useState<Set<number>>(new Set());
  const cell = (row: Record<string, string | number>, column: string): string =>
    edits[Number(row.row)]?.[column] ?? String(row[column] ?? "");
  const change = (row: number, column: string, value: string) =>
    setEdits((current) => ({ ...current, [row]: { ...current[row], [column]: value } }));
  const toggle = (row: number) => setLeft((current) => {
    const next = new Set(current);
    if (next.has(row)) next.delete(row); else next.add(row);
    return next;
  });
  const changed = Object.values(edits).reduce((n, row) => n + Object.keys(row).length, 0);
  const message = (messages: string[] | string | undefined): string =>
    messages === undefined ? "" : Array.isArray(messages) ? messages.join(" ") : String(messages);

  const rebuild = (): File => {
    const lines = [columns.map(csvCell).join(",")];
    for (const row of rowsData) {
      if (left.has(Number(row.row))) continue;
      lines.push(columns.map((column) => csvCell(cell(row, column))).join(","));
    }
    return new File([`${lines.join("\r\n")}\r\n`], correctedName(fileName), { type: "text/csv" });
  };

  const save = () => {
    const url = URL.createObjectURL(rebuild());
    const link = document.createElement("a");
    link.href = url;
    link.download = correctedName(fileName);
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-md border border-line" aria-labelledby="fix-rows-title">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-subtle/60 px-4 py-3">
        <div>
          <h3 id="fix-rows-title" className="text-sm font-semibold text-ink">Correct the flagged rows here</h3>
          <p className="text-xs text-muted">
            Change the values, or leave a row out, then check the corrected file. The other rows stay as they were. Nothing is saved by a check.
            {flagged.length > MAX_FIX_ROWS ? ` The first ${MAX_FIX_ROWS} of ${fmtInt(flagged.length)} flagged rows are shown; correct the others in the file.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<FileDown className="h-3.5 w-3.5" aria-hidden />} onClick={save} disabled={busy}>Download the corrected file</Button>
          <Button size="sm" variant="primary" icon={<ListChecks className="h-3.5 w-3.5" aria-hidden />} onClick={() => onCheck(rebuild())}
            disabled={busy || (changed === 0 && left.size === 0)}>
            Check the corrected file
          </Button>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="px-3 py-2 text-right font-medium">Row</th>
              {columns.map((column) => <th key={column} scope="col" className="whitespace-nowrap px-2 py-2 font-medium">{COLUMN_NAMES[column] ?? column.replace(/_/g, " ")}</th>)}
              <th scope="col" className="px-3 py-2 font-medium">Leave out</th>
            </tr>
          </thead>
          <tbody>
            {flagged.slice(0, MAX_FIX_ROWS).map((row) => {
              const number = Number(row.row);
              const errors = problems.get(number) ?? {};
              const out = left.has(number);
              return (
                <tr key={number} className={cx("border-b border-line align-top last:border-0", out && "opacity-50")}>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">
                    {fmtInt(number)}
                    {errors.non_field_errors && <p className="mt-1 min-w-[10rem] text-left text-xs font-normal text-crit">{message(errors.non_field_errors)}</p>}
                  </td>
                  {columns.map((column) => {
                    const problem = message(errors[column]);
                    const label = COLUMN_NAMES[column] ?? column.replace(/_/g, " ");
                    return (
                      <td key={column} className="px-2 py-2">
                        <input className={cx("input h-8 min-w-[7rem] px-2 text-xs", problem && "border-crit")} value={cell(row, column)} disabled={out}
                          aria-label={`Row ${number}, ${label}`} aria-invalid={problem ? true : undefined}
                          onChange={(event) => change(number, column, event.target.value)} />
                        {problem && <p className="mt-1 min-w-[7rem] text-xs text-crit">{problem}</p>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
                    <Checkbox checked={out} onCheckedChange={() => toggle(number)} aria-label={`Leave row ${number} out of the file`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** How far the file has been sent; then the wait for the server's checks. */
function UploadProgress({ share }: { share: number }) {
  const percent = Math.round(share * 100);
  return (
    <div className="flex flex-wrap items-center gap-3" role="progressbar" aria-label="Sending the file" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(2, percent)}%` }} />
      </div>
      <span className="text-xs text-muted">{percent < 100 ? `Sending the file: ${percent}%` : "Sent. The server is checking the rows."}</span>
    </div>
  );
}

/**
 * Choose a file, check it, then upload it. Used for observations and for calibration history.
 * `path` is the upload endpoint; `params` are sent with both the check and the upload.
 */
export function BulkUploader({ path, params, blocked, rowNoun, onSaved }: {
  path: string; params?: Params; blocked?: string; rowNoun: string; onSaved?: (result: UploadResult) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState("");
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [problem, setProblem] = useState<unknown>(null);
  const [lostReply, setLostReply] = useState(false);
  // How much of the file has been sent while a check or an upload is under way
  const [progress, setProgress] = useState<number | null>(null);
  // New sensor codes found by the server on the first submission; the user confirms before the second.
  const [approval, setApproval] = useState<string[] | null>(null);
  // The same finding for an account that may not add sensors: it is told, not asked.
  const [notAllowed, setNotAllowed] = useState<string[] | null>(null);
  const scope = useScope();
  const save = useAction<UploadResult, { file: File; confirm: boolean }>(({ file: chosen, confirm }) =>
    upload<UploadResult>(path, chosen, confirm ? { ...params, confirm_creation: true } : params, setProgress));

  const choose = (chosen: File | null) => {
    setResult(null); setProblem(null); setLostReply(false); setFileProblem(""); setApproval(null); setNotAllowed(null);
    if (chosen && !/\.(csv|xlsx)$/i.test(chosen.name)) { setFile(null); setFileProblem("Choose a .csv or .xlsx file."); return; }
    if (chosen && chosen.size > MAX_FILE_BYTES) { setFile(null); setFileProblem("This file is larger than 20 MB. Split it into smaller files."); return; }
    setFile(chosen);
  };

  const check = async (chosen: File | null = file) => {
    if (!chosen) return;
    setBusy("check"); setProblem(null); setLostReply(false);
    try {
      setResult(await upload<UploadResult>(path, chosen, { ...params, preview: true }, setProgress));
    } catch (error) {
      setResult(null);
      setProblem(error);
    } finally {
      setBusy(null); setProgress(null);
    }
  };

  /** The rows corrected in the page become the file: it is checked again, then uploaded as one batch. */
  const checkCorrected = (corrected: File) => {
    setFile(corrected);
    void check(corrected);
  };

  const submit = async (confirm = false) => {
    if (!file) return;
    setBusy("save"); setProblem(null); setLostReply(false);
    try {
      const saved = await save.mutateAsync({ file, confirm });
      if (saved.requires_approval && !confirm) {
        // Nothing was created or saved. Ask first; the confirmed call follows from the dialog.
        if (scope.admin) setApproval(saved.new_sensor_codes ?? []);
        else setNotAllowed(saved.new_sensor_codes ?? []);
        return;
      }
      setApproval(null);
      setResult(saved);
      toast.success(`${fmtInt(saved.success_count)} ${rowNoun} saved.`);
      onSaved?.(saved);
    } catch (error) {
      if (error instanceof NetworkError) setLostReply(true); // the server may have saved the file
      else if (error instanceof ApiError && isUploadResult(error.body)) setResult(error.body); // 400: nothing was saved
      else setProblem(error);
    } finally {
      setBusy(null); setProgress(null);
    }
  };

  const lines = result ? errorLines(result) : [];
  const checked = result?.preview === true;
  const saved = result !== null && !result.preview;
  return (
    <div className="space-y-4">
      {blocked && <Notice tone="info">{blocked}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept=".csv,.xlsx" className="sr-only" aria-label="File to upload"
          onChange={(e) => { choose(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        <Button icon={<FileUp className="h-4 w-4" aria-hidden />} onClick={() => input.current?.click()} disabled={busy !== null}>
          {file ? "Choose another file" : "Choose a file"}
        </Button>
        {file
          ? <p className="min-w-0 text-ink"><span className="break-all font-semibold">{file.name}</span> <span className="text-muted">({fmtNumber(file.size / 1024, 1)} KB)</span></p>
          : <p className="text-muted">A .csv or .xlsx file of up to 20 MB.</p>}
      </div>
      {fileProblem && <Notice tone="crit">{fileProblem}</Notice>}

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<ListChecks className="h-4 w-4" aria-hidden />} onClick={() => check()} loading={busy === "check"} disabled={!file || Boolean(blocked) || busy !== null}>
          Check the file
        </Button>
        <Button variant="primary" icon={<Upload className="h-4 w-4" aria-hidden />} onClick={() => submit()} loading={busy === "save"}
          disabled={!file || Boolean(blocked) || busy !== null || !checked || result.success_count === 0}>
          {checked && result.success_count > 0 ? `Upload ${fmtInt(result.success_count)} ${rowNoun}` : "Upload"}
        </Button>
        {busy === "save" && <span className="text-muted" role="status">Uploading. Keep this page open until it finishes.</span>}
      </div>
      {progress !== null && <UploadProgress share={progress} />}
      <div className="flex flex-wrap items-center gap-2">
        {!busy && file && !checked && !saved && !blocked && <span className="text-muted">Check the file first: nothing is saved by a check.</span>}
      </div>

      {lostReply && (
        <Notice tone="warn" title="No reply was received">
          The connection dropped before the server answered, so the file may or may not have been saved. Look for it in the upload history
          below before you upload it again; uploading twice would report every row as a duplicate.
        </Notice>
      )}
      {problem != null && (
        problem instanceof NetworkError
          ? <Notice tone="warn" title="Cannot reach the server">{describeError(problem)} Nothing was saved by a check.</Notice>
          : <Notice tone="crit" title="The file could not be read">{describeError(problem)}</Notice>
      )}

      <ConfirmDialog open={approval !== null} title="Create new sensors?" confirmLabel="Create the sensors and upload" danger={false}
        busy={busy === "save"} onConfirm={() => submit(true)} onClose={() => setApproval(null)}>
        <p>This file names {approval?.length === 1 ? "a sensor code" : `${fmtInt(approval?.length ?? 0)} sensor codes`} that the station does not have yet:</p>
        <p className="break-words font-semibold text-ink">{(approval ?? []).join(", ")}</p>
        <p>Nothing has been saved. If you continue, each of these is added to the sensor register as an Active sensor, then the rows are saved. Cancel to correct the codes in the file instead.</p>
      </ConfirmDialog>
      {notAllowed !== null && (
        <Notice tone="warn" title="Nothing was saved: the file names new sensors">
          {notAllowed.join(", ")}. Only a station administrator can add sensors. Ask one to upload this file, or correct the codes and check the file again.
        </Notice>
      )}

      {result && (
        <div className="space-y-3">
          {checked && result.requires_approval && (
            <Notice tone="warn" title="This file names sensors the station does not have">
              {(result.new_sensor_codes ?? []).join(", ")}. If a code is a typing mistake, correct the file. Otherwise you will be asked to confirm before
              the new sensors are created; nothing is created by a check.
            </Notice>
          )}
          {checked && result.success_count > 0 && result.error_count === 0 && <Notice tone="good" title="The file is ready">Every row passed the checks. Nothing has been saved yet: choose Upload to save it.</Notice>}
          {checked && result.success_count > 0 && result.error_count > 0 && (
            <Notice tone="warn" title="Some rows have problems">
              You can upload now and only the rows without problems are saved, or correct the flagged rows below and check the corrected file.
            </Notice>
          )}
          {checked && result.success_count === 0 && <Notice tone="crit" title="No row can be saved">{result.count === 0 ? "The file has no data rows under its header." : "Correct the rows listed below, then check the file again."}</Notice>}
          {saved && result.success_count > 0 && (
            <Notice tone={result.error_count > 0 ? "warn" : "good"} title={result.error_count > 0 ? "Saved in part" : "Upload complete"}>
              {fmtInt(result.success_count)} of {fmtInt(result.count)} rows were saved.{result.error_count > 0 ? " The rows listed below were not saved." : ""}
              {result.batch_id ? " The upload is listed in the history, where it can be deleted as a whole." : ""}
              {result.created_sensors?.length ? ` New sensors created: ${result.created_sensors.join(", ")}.` : ""}
            </Notice>
          )}
          {saved && result.success_count === 0 && <Notice tone="crit" title="Nothing was saved">No row of this file could be saved. The reasons are listed below.</Notice>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Figure label="Rows in the file" value={fmtInt(result.count)} />
            <Figure label={saved ? "Rows saved" : "Rows that can be saved"} value={fmtInt(result.success_count)} />
            <Figure label="Rows with problems" value={fmtInt(result.error_count)} />
          </div>

          {checked && result.rows_data && result.error_count > 0 && file && (
            <FixRows key={`${file.name}-${file.size}-${file.lastModified}`} result={result} fileName={file.name} busy={busy !== null} onCheck={checkCorrected} />
          )}
          {lines.length > 0 && !(checked && result.rows_data) && (
            <div>
              <p className="mb-1.5 text-xs text-muted">
                Row numbers are those of the file: row 1 is the header.
                {lines.length > MAX_ERRORS_SHOWN ? ` The first ${MAX_ERRORS_SHOWN} of ${fmtInt(lines.length)} problems are shown.` : ""}
              </p>
              <PlainTable caption="Rows with problems" rows={lines.slice(0, MAX_ERRORS_SHOWN)} rowKey={(line) => line.id}
                columns={[
                  { key: "row", header: "Row", align: "right", cell: (line) => fmtInt(line.row) },
                  { key: "column", header: "Column", cell: (line) => <span className="whitespace-nowrap font-medium">{line.column}</span> },
                  { key: "message", header: "Problem", cell: (line) => line.message },
                ]} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- the observation upload screen ---------------------------------------------------------------
function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="card">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent" aria-hidden>{number}</span>
        <h2 className="text-sm font-semibold text-ink"><span className="sr-only">Step {number}: </span>{title}</h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function TemplateStep() {
  const { metrics } = useMetrics();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const get = async (output: "csv" | "xlsx") => {
    setBusy(output);
    try {
      await download("/weather/observations/bulk_upload_template/", { output }, `observations_template.${output}`);
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusy(null);
    }
  };
  const active = metrics.filter((m) => m.is_active);
  return (
    <Step number={1} title="Get the template and fill it in">
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<FileSpreadsheet className="h-4 w-4" aria-hidden />} onClick={() => get("xlsx")} loading={busy === "xlsx"} disabled={busy !== null}>Excel template</Button>
        <Button icon={<FileDown className="h-4 w-4" aria-hidden />} onClick={() => get("csv")} loading={busy === "csv"} disabled={busy !== null}>CSV template</Button>
        <p className="text-muted">Keep the header row as it is. One reading per row.</p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <PlainTable caption="Template columns" scroll={false} rowKey={(row) => row.column}
          rows={[
            { column: "Sensor Code", rule: "A sensor code of the station. Leave empty for a manual observer reading." },
            { column: "Metric Code *", rule: `One of: ${active.map((m) => m.code).join(", ") || "the metric codes listed beside this table"}.` },
            { column: "Observed At *", rule: "Date and time in local station time (Central Africa Time), for example 2026-10-11 08:00. Not in the future." },
            { column: "Value *", rule: "A number inside the valid range of the metric. Use a decimal point, not a comma." },
            { column: "Unit *", rule: "The unit of the metric, as listed beside this table. A reading with another unit, or none, is refused." },
            { column: "Quality Flag", rule: `${QUALITY_FLAGS.join(", ")}. Leave empty for Valid.` },
            { column: "Notes", rule: "Up to 255 characters. Required when the quality flag is Suspect or Rejected: say why." },
          ]}
          columns={[
            { key: "column", header: "Column", cell: (row) => <span className="whitespace-nowrap font-semibold">{row.column}</span> },
            { key: "rule", header: "What to enter", cell: (row) => row.rule },
          ]} />
        <PlainTable caption="Metric codes, units and valid ranges" scroll={false} rows={active} rowKey={(m) => m.id}
          columns={[
            { key: "code", header: "Metric code", cell: (m) => <span className="font-semibold">{m.code}</span> },
            { key: "name", header: "Measures", cell: (m) => m.name },
            { key: "unit", header: "Unit", cell: (m) => m.unit },
            { key: "range", header: "Valid range", align: "right", cell: (m) => `${fmtNumber(m.min_valid, 1)} to ${fmtNumber(m.max_valid, 1)}` },
          ]} />
      </div>
    </Step>
  );
}

const DELETABLE: BatchStatus[] = ["Completed", "Partial"];

function UploadHistory({ station }: { station?: number }) {
  const s = useStationScope(station);
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [stationFilter, setStationFilter] = useState("");
  const [removing, setRemoving] = useState<UploadBatch | null>(null);
  const params = { ...s.baseParams, ...(s.pick && stationFilter ? { station: stationFilter } : {}), entity: "WeatherObservation", status, page, page_size: 10 };
  const list = useList<UploadBatch>("/weather/upload-batches/", params);
  const remove = useAction<BulkDeleteResult, UploadBatch>((batch) => send("POST", "/weather/observations/bulk_delete/", { batch_id: batch.id, confirm: true }));

  const confirm = async () => {
    if (!removing) return;
    try {
      const done = await remove.mutateAsync(removing);
      toast.success(`${fmtInt(done.deleted_count)} observations of ${removing.filename} were deleted.`);
      setRemoving(null);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const filtered = Boolean(status || stationFilter);
  return (
    <div>
      <h2 className="mb-1 text-base font-semibold text-ink">Upload history</h2>
      <p className="mb-3 max-w-3xl text-ink-2">
        Every upload, newest first. After a dropped connection, look here to see whether the file arrived. Deleting an upload removes the
        observations it saved and nothing else.
      </p>
      <FilterBar onReset={filtered ? () => { setStatus(""); setStationFilter(""); setPage(1); } : undefined}>
        {s.pick && (
          <div className="min-w-[14rem]">
            <label htmlFor="history-station" className="label">Station</label>
            <Choice id="history-station" value={stationFilter} onChange={(value) => { setStationFilter(value); setPage(1); }} options={s.stationOptions} emptyLabel="All" />
          </div>
        )}
        <div className="min-w-[10rem]">
          <label htmlFor="history-status" className="label">Result</label>
          <Choice id="history-status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} emptyLabel="All"
            options={(["Completed", "Partial", "Failed", "Pending", "Deleted"] satisfies BatchStatus[]).map((v) => ({ value: v, label: v }))} />
        </div>
      </FilterBar>
      <DataTable
        caption="Upload history"
        rows={list.data?.results}
        rowKey={(row) => row.id}
        loading={list.isLoading}
        refreshing={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        empty={filtered ? { title: "No uploads match these filters" } : { title: "No file has been uploaded yet", hint: "Uploads appear here as soon as the server receives them." }}
        columns={[
          { key: "created_at", header: "Received (CAT)", cell: (row) => <span className="whitespace-nowrap">{fmtDateTime(row.created_at)}</span> },
          ...(s.pick ? [{ key: "station", header: "Station", cell: (row: UploadBatch) => row.station_code }] : []),
          { key: "filename", header: "File", cell: (row) => <span className="break-all font-medium">{row.filename}</span> },
          { key: "by", header: "Uploaded by", cell: (row) => row.uploaded_by_email ?? <span className="text-muted">account removed</span> },
          { key: "total", header: "Rows", align: "right", cell: (row) => fmtInt(row.total_rows) },
          { key: "saved", header: "Saved", align: "right", cell: (row) => fmtInt(row.success_count) },
          { key: "errors", header: "Problems", align: "right", cell: (row) => fmtInt(row.error_count) },
          { key: "status", header: "Result", cell: (row) => <Badge tone={BATCH_TONE[row.status]}>{row.status}</Badge> },
        ]}
        actions={s.scope.admin ? (row) => (
          DELETABLE.includes(row.status) && row.success_count > 0
            ? <IconButton label={`Delete the observations of ${row.filename}`} onClick={() => setRemoving(row)}><Trash2 className="h-4 w-4" aria-hidden /></IconButton>
            : <span className="pr-2 text-xs text-muted">nothing to delete</span>
        ) : undefined}
        footer={list.data && <Pagination page={page} pageSize={10} count={list.data.count} onPage={setPage} />}
      />
      <ConfirmDialog open={removing !== null} title="Delete this upload?" confirmLabel="Delete the observations" requireText="DELETE"
        busy={remove.isPending} onConfirm={confirm} onClose={() => setRemoving(null)}>
        <p>
          You are about to delete the <span className="font-semibold text-ink">{removing ? fmtInt(removing.success_count) : ""} observations</span> saved
          from <span className="break-all font-semibold text-ink">{removing?.filename}</span>{removing ? `, received ${fmtDateTime(removing.created_at)}` : ""}.
        </p>
        <p>Observations entered one by one, and those of other uploads, are not touched. This cannot be undone and is recorded in the audit trail.</p>
      </ConfirmDialog>
    </div>
  );
}

export function UploadScreen({ station }: ModuleProps) {
  const s = useStationScope(station);
  const terms = useTerms();
  const [target, setTarget] = useState("");
  const params: Params | undefined = s.pick ? (target ? { station: target } : undefined) : undefined;
  const blocked = !s.scope.writable
    ? "Your account has read-only access, so files cannot be uploaded."
    : s.pick && !target ? "Choose the station the file belongs to." : undefined;
  return (
    <div className="space-y-5">
      <PageHeader title={terms.upload}
        description="Load many readings at once from an Excel or CSV file. The file is checked first, so you see every problem row before anything is saved." />
      <TemplateStep />
      <Step number={2} title="Check the file, then upload it">
        {s.pick && (
          <div className="mb-4 max-w-md">
            <label htmlFor="upload-station" className="label">Station the file belongs to <span className="text-crit" aria-hidden>*</span></label>
            <Choice id="upload-station" value={target} onChange={setTarget} options={s.stationOptions} />
            <p className="mt-1 text-xs text-muted">Every row is saved to this station. Sensor codes are looked up among its sensors.</p>
          </div>
        )}
        <BulkUploader key={target} path="/weather/observations/bulk_upload/" params={params} blocked={blocked} rowNoun="rows" />
        <p className="mt-4 flex items-start gap-1.5 text-xs text-muted">
          <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          A reading that already exists (same metric, time and sensor) is reported as a problem row and is not saved twice.
        </p>
      </Step>
      <UploadHistory station={station} />
    </div>
  );
}
