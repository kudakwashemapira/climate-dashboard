/**
 * Sensor calibration (UC-003, UC-004; screens SCR-007, SCR-036, SCR-037):
 *   GET  /api/sensors/calibrations/                       history across sensors (read-only)
 *   GET  /api/sensors/hardware/<id>/calibrations/         history of one sensor
 *   POST /api/sensors/hardware/<id>/calibrations/         log a calibration
 *   POST /api/sensors/hardware/<id>/revert_calibration/   revert the current calibration ({confirm: true})
 *   GET  /api/sensors/hardware/bulk_calibration_template/ the upload template
 *   POST /api/sensors/hardware/bulk_calibration/          load calibration history from a file
 *   GET  /api/sensors/calibrations/export/                the history as CSV, Excel or PDF
 *
 * Logging a calibration is data entry (levels 1 to 3); reverting one is for a station administrator.
 *
 * A calibration is never written to /api/sensors/calibrations/: it is logged through the sensor, so
 * the server keeps the sensor's calibration status in step with its history (ADR-001).
 */
import { useState } from "react";
import { AlertTriangle, CalendarClock, ClipboardCheck, FileDown, HelpCircle, Undo2, Upload } from "lucide-react";
import { ConfirmDialog, Dialog } from "../components/Dialog";
import { PlainTable } from "../components/DataTable";
import { FormDialog, rowToForm, type FieldDef } from "../components/FormDialog";
import { ResourcePage, type ResourceConfig } from "../components/ResourcePage";
import { useToast } from "../components/Toast";
import { Badge, Button, Card, Choice, EmptyState, ErrorState, IconButton, KpiCard, Notice, Spinner } from "../components/ui";
import { useSensors } from "../hooks/useLookups";
import { useAction, useList } from "../hooks/useResource";
import { fmtDate, fmtDateTime, fmtInt, fmtNumber, todayIso } from "../lib/format";
import { CALIBRATION_TONE, RESULT_TONE, SENSOR_TONE } from "../lib/tones";
import { describeError, download, send } from "../services/http";
import { useScope } from "../services/session";
import { CALIBRATION_RESULTS, options, type Calibration, type CalibrationStatus, type Sensor } from "../services/types";
import { useStationScope, type ModuleProps } from "./common";
import { BulkUploader } from "./upload";

const CALIBRATION_FIELDS: FieldDef[] = [
  { name: "calibrated_on", label: "Calibrated on", type: "date", required: true },
  { name: "performed_by", label: "Performed by", required: true, maxLength: 120, placeholder: "Person or laboratory" },
  { name: "result", label: "Result", type: "select", required: true, options: options(CALIBRATION_RESULTS) },
  { name: "drift_value", label: "Drift found", type: "number", step: "0.001", hint: "Difference from the reference, in the sensor's unit." },
  { name: "reference_standard", label: "Reference standard", maxLength: 120 },
  { name: "next_due_on", label: "Next calibration due", type: "date",
    hint: "Sets the sensor's calibration status: Current, Due within 30 days of this date, Overdue after it." },
  { name: "notes", label: "Notes", type: "textarea" },
];

/** What a calibration record is now: the one in force, a reverted one, or an earlier one. */
function CalibrationState({ row }: { row: Calibration }) {
  if (row.reverted_at) return <Badge tone="neutral">Reverted {fmtDate(row.reverted_at)}</Badge>;
  if (row.is_current) return <Badge tone="good">In force</Badge>;
  return <Badge tone="neutral" icon={false}>Superseded</Badge>;
}

/** Log one calibration. With `sensor` the sensor is fixed; without it the user picks one. */
export function LogCalibrationDialog({ open, sensor, station, onClose }: { open: boolean; sensor?: Sensor | null; station?: number | null; onClose: () => void }) {
  const toast = useToast();
  const { sensors } = useSensors(station);
  const save = useAction<Calibration, { id: string; data: unknown }>(({ id, data }) => send("POST", `/sensors/hardware/${id}/calibrations/`, data));
  const pickSensor: FieldDef[] = sensor ? [] : [{
    name: "sensor", label: "Sensor", type: "select", required: true, wide: true,
    options: sensors.filter((x) => x.status !== "Retired").map((x) => ({ value: String(x.id), label: `${x.sensor_code} – ${x.sensor_type}` })),
  }];
  const fields = [...pickSensor, ...CALIBRATION_FIELDS];
  return (
    <FormDialog open={open} mode="create" title={sensor ? `Log a calibration for ${sensor.sensor_code}` : "Log a calibration"}
      description="Fields marked * are required. The new record replaces the one in force; earlier records are kept."
      fields={fields} initial={rowToForm(fields, null, { calibrated_on: todayIso(), result: "Pass" })} submitLabel="Log calibration"
      validate={(form) => (!sensor && !form.sensor ? { sensor: "Choose the sensor that was calibrated." } : {})}
      onSubmit={async (payload, form) => {
        const { sensor: _picked, ...data } = payload;
        await save.mutateAsync({ id: sensor ? String(sensor.id) : String(form.sensor), data });
        toast.success("The calibration was logged and the sensor's status was updated.");
      }}
      onClose={onClose} />
  );
}

/** Ask before reverting, then POST revert_calibration for the sensor. */
function useRevert() {
  const toast = useToast();
  const [target, setTarget] = useState<{ id: number; code: string } | null>(null);
  const revert = useAction<{ current_calibration: number | null; calibration_status: CalibrationStatus }, number>((id) => send("POST", `/sensors/hardware/${id}/revert_calibration/`, { confirm: true }));
  const confirm = async () => {
    if (!target) return;
    try {
      const done = await revert.mutateAsync(target.id);
      toast.success(done.current_calibration === null
        ? `The calibration was reverted. ${target.code} has no calibration in force: its status is ${done.calibration_status}.`
        : `The calibration was reverted. The previous record is in force again: status ${done.calibration_status}.`);
      setTarget(null);
    } catch (error) {
      toast.error(describeError(error));
    }
  };
  const dialog = (
    <ConfirmDialog open={target !== null} title="Revert the calibration in force?" confirmLabel="Revert" busy={revert.isPending} onConfirm={confirm} onClose={() => setTarget(null)}>
      <p>The calibration now in force for <span className="font-semibold text-ink">{target?.code}</span> is marked as reverted and the record before it comes back into force.</p>
      <p>Nothing is deleted: the reverted record stays in the history. The action is recorded in the audit trail.</p>
    </ConfirmDialog>
  );
  return { ask: setTarget, dialog };
}

/** The calibration history of one sensor, with the option to revert the record in force. */
export function CalibrationHistoryDialog({ sensor, onClose }: { sensor: Sensor | null; onClose: () => void }) {
  const scope = useScope();
  const list = useList<Calibration>(`/sensors/hardware/${sensor?.id ?? 0}/calibrations/`, { page_size: 100 }, sensor !== null);
  const revert = useRevert();
  const rows = list.data?.results ?? [];
  const inForce = rows.some((row) => row.is_current && !row.reverted_at);
  return (
    <>
      <Dialog open={sensor !== null} size="lg" title={`Calibration history of ${sensor?.sensor_code ?? ""}`}
        description="Newest first. Records are never deleted: a revert is kept in the history." onClose={onClose}
        footer={<>
          {scope.admin && inForce && sensor && (
            <Button variant="danger" icon={<Undo2 className="h-4 w-4" aria-hidden />} onClick={() => revert.ask({ id: sensor.id, code: sensor.sensor_code })}>
              Revert the calibration in force
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </>}>
        {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} />
          : list.isLoading || !list.data ? <Spinner />
          : rows.length === 0 ? <EmptyState title="No calibration has been logged for this sensor" icon={ClipboardCheck} />
          : (
            <>
              <PlainTable caption="Calibration history" rows={rows} rowKey={(row) => row.id}
                columns={[
                  { key: "on", header: "Calibrated on", cell: (row) => <span className="whitespace-nowrap">{fmtDate(row.calibrated_on)}</span> },
                  { key: "by", header: "Performed by", cell: (row) => row.performed_by },
                  { key: "result", header: "Result", cell: (row) => <Badge tone={RESULT_TONE[row.result]}>{row.result}</Badge> },
                  { key: "drift", header: "Drift", align: "right", cell: (row) => fmtNumber(row.drift_value, 3) },
                  { key: "due", header: "Next due", cell: (row) => <span className="whitespace-nowrap">{fmtDate(row.next_due_on)}</span> },
                  { key: "state", header: "State", cell: (row) => <CalibrationState row={row} /> },
                ]} />
              {list.data.count > rows.length && <p className="mt-2 text-xs text-muted">The newest {fmtInt(rows.length)} of {fmtInt(list.data.count)} records are shown.</p>}
            </>
          )}
      </Dialog>
      {revert.dialog}
    </>
  );
}

/** Load many calibration records from a file: same check-then-upload steps as observations. */
function BulkCalibrationDialog({ open, station, pick, stationOptions, onClose }: {
  open: boolean; station: number | null; pick: boolean; stationOptions: Array<{ value: string; label: string }>; onClose: () => void;
}) {
  const [target, setTarget] = useState("");
  const toast = useToast();
  const chosen = pick ? target : station === null ? "" : String(station);
  // The template comes from the server, so its columns are always the ones the upload reads (FR-007).
  const template = async (output: "csv" | "xlsx") => {
    try {
      await download("/sensors/hardware/bulk_calibration_template/", { output }, `calibrations_template.${output}`);
    } catch (error) {
      toast.error(describeError(error));
    }
  };
  return (
    <Dialog open={open} size="lg" title="Upload calibration records"
      description="For calibration history kept in a spreadsheet. Each row is logged exactly as a single calibration would be." onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<FileDown className="h-4 w-4" aria-hidden />} onClick={() => template("xlsx")}>Excel template</Button>
          <Button icon={<FileDown className="h-4 w-4" aria-hidden />} onClick={() => template("csv")}>CSV template</Button>
          <p className="min-w-0 flex-1 text-xs text-muted">
            Columns: Sensor Code *, Calibrated On * (YYYY-MM-DD, not in the future), Performed By *, Result ({CALIBRATION_RESULTS.join(", ")}; empty means Pass),
            Next Due On, Reference Standard, Drift Value, Notes. Rows are logged in file order, so put the oldest calibration of a sensor first.
            A sensor code that is not registered at the station is reported as a problem row: a calibration never creates a sensor.
          </p>
        </div>
        {pick && (
          <div className="max-w-md">
            <label htmlFor="calibration-upload-station" className="label">Station the file belongs to <span className="text-crit" aria-hidden>*</span></label>
            <Choice id="calibration-upload-station" value={target} onChange={setTarget} options={stationOptions} />
            <p className="mt-1 text-xs text-muted">Sensor codes are looked up among the sensors of this station.</p>
          </div>
        )}
        {open && (
          <BulkUploader key={chosen} path="/sensors/hardware/bulk_calibration/" params={chosen ? { station: chosen } : undefined}
            blocked={pick && !chosen ? "Choose the station the file belongs to." : undefined} rowNoun="calibrations" />
        )}
      </div>
    </Dialog>
  );
}

/**
 * Sensors whose calibration is overdue or due within 30 days, with the action that clears it.
 * Two filtered reads of /api/sensors/hardware/ (calibration_status=Overdue, then Due).
 */
export function CalibrationAttentionCard({ station }: { station?: number }) {
  const scope = useScope();
  const overdue = useList<Sensor>("/sensors/hardware/", { calibration_status: "Overdue", station, page_size: 50 });
  const due = useList<Sensor>("/sensors/hardware/", { calibration_status: "Due", station, page_size: 50 });
  const [logFor, setLogFor] = useState<Sensor | null>(null);
  const error = overdue.error ?? due.error;
  const ready = overdue.data && due.data;
  // Retired sensors keep their last status but need no calibration.
  const rows = ready ? [...overdue.data.results, ...due.data.results].filter((sensor) => sensor.status !== "Retired") : [];
  return (
    <Card title="Calibrations that need attention" description="Sensors whose calibration is overdue or falls due within 30 days." padded={false}>
      {error ? <ErrorState error={error} onRetry={() => { overdue.refetch(); due.refetch(); }} />
        : !ready ? <Spinner />
        : rows.length === 0 ? <EmptyState title="No calibration is overdue or due soon" hint="Every sensor in service has a calibration that is current, or none has been logged yet." icon={ClipboardCheck} />
        : (
          <div className="p-4">
            <PlainTable caption="Sensors that need a calibration" rows={rows} rowKey={(row) => row.id} scroll={false}
              columns={[
                { key: "code", header: "Sensor", cell: (row) => <span className="font-semibold">{row.sensor_code}</span> },
                { key: "type", header: "Type", cell: (row) => row.sensor_type },
                { key: "calibration", header: "Calibration", cell: (row) => <Badge tone={CALIBRATION_TONE[row.calibration_status]}>{row.calibration_status}</Badge> },
                { key: "service", header: "Service status", cell: (row) => <Badge tone={SENSOR_TONE[row.status]}>{row.status}</Badge> },
                ...(scope.writable ? [{ key: "action", header: "", align: "right" as const, cell: (row: Sensor) => (
                  <Button size="sm" icon={<ClipboardCheck className="h-3.5 w-3.5" aria-hidden />} onClick={() => setLogFor(row)}>Log calibration</Button>
                ) }] : []),
              ]} />
          </div>
        )}
      <LogCalibrationDialog open={logFor !== null} sensor={logFor} onClose={() => setLogFor(null)} />
    </Card>
  );
}

/** Number of sensors in one calibration status: the `count` of the filtered sensor list. */
function StatusCount({ status, label, detail, tone, icon, station }: {
  status: CalibrationStatus; label: string; detail: string; tone: "crit" | "warn" | "neutral"; icon: typeof AlertTriangle; station?: number;
}) {
  const list = useList<Sensor>("/sensors/hardware/", { calibration_status: status, station, page_size: 1 });
  return <KpiCard label={label} value={list.data ? fmtInt(list.data.count) : "…"} detail={detail} icon={icon} tone={list.data && list.data.count === 0 ? "good" : tone} />;
}

export function CalibrationsScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const { sensors, isLoading: sensorsLoading } = useSensors(s.pick ? undefined : s.stationId);
  const [logging, setLogging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const revert = useRevert();

  const config: ResourceConfig<Calibration> = {
    path: "/sensors/calibrations/",
    sortable: ["on", "sensor", "by", "result", "drift", "due", "state", "logged", "station"],
    title: "Calibration records",
    description: s.pick
      ? "Every calibration logged for every sensor, newest first. The record in force decides a sensor's calibration status."
      : "Every calibration logged for this station's sensors, newest first. The record in force decides a sensor's calibration status.",
    noun: "calibration",
    exportName: "calibrations",
    canCreate: false,
    canEdit: false,
    canDelete: false,
    baseParams: s.baseParams,
    describe: (row) => `the calibration of ${row.sensor_code} on ${fmtDate(row.calibrated_on)}`,
    columns: [
      { key: "on", header: "Calibrated on", cell: (row) => <span className="whitespace-nowrap">{fmtDate(row.calibrated_on)}</span> },
      { key: "sensor", header: "Sensor", cell: (row) => <span className="font-semibold">{row.sensor_code}</span> },
      ...s.columns<Calibration>(),
      { key: "by", header: "Performed by", cell: (row) => row.performed_by },
      { key: "result", header: "Result", cell: (row) => <Badge tone={RESULT_TONE[row.result]}>{row.result}</Badge> },
      { key: "drift", header: "Drift", align: "right", cell: (row) => fmtNumber(row.drift_value, 3) },
      { key: "due", header: "Next due", cell: (row) => <span className="whitespace-nowrap">{fmtDate(row.next_due_on)}</span> },
      { key: "state", header: "State", cell: (row) => <CalibrationState row={row} /> },
      { key: "logged", header: "Logged (CAT)", cell: (row) => <span className="whitespace-nowrap text-ink-2">{fmtDateTime(row.created_at)}</span> },
    ],
    filters: [
      ...s.filters(),
      { name: "sensor", label: "Sensor", type: "select", options: sensors.map((x) => ({ value: String(x.id), label: x.sensor_code })) },
      { name: "result", label: "Result", type: "select", options: options(CALIBRATION_RESULTS) },
      { name: "calibrated_from", label: "Calibrated from", type: "date" },
      { name: "calibrated_to", label: "Calibrated to", type: "date" },
    ],
    fields: [],
    rowActions: s.scope.admin
      ? (row) => (row.is_current && !row.reverted_at
        ? <IconButton label={`Revert the calibration of ${row.sensor_code}`} onClick={() => revert.ask({ id: row.sensor, code: row.sensor_code })}><Undo2 className="h-4 w-4" aria-hidden /></IconButton>
        : null)
      : undefined,
    headerActions: s.scope.writable ? (
      <>
        <Button icon={<Upload className="h-4 w-4" aria-hidden />} onClick={() => setUploading(true)}>Upload records</Button>
        <Button variant="primary" icon={<ClipboardCheck className="h-4 w-4" aria-hidden />} onClick={() => setLogging(true)}>Log a calibration</Button>
      </>
    ) : undefined,
    above: embedded ? undefined : (
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatusCount status="Overdue" label="Overdue sensors" detail="Due date passed, or the last calibration failed" tone="crit" icon={AlertTriangle} station={station} />
        <StatusCount status="Due" label="Due within 30 days" detail="Plan these calibrations now" tone="warn" icon={CalendarClock} station={station} />
        <StatusCount status="Unknown" label="Never calibrated" detail="No calibration has been logged" tone="neutral" icon={HelpCircle} station={station} />
      </div>
    ),
    emptyHint: "Log the first calibration, or upload calibration history from a file.",
  };

  return (
    <>
      {s.scope.writable && !embedded && !sensorsLoading && sensors.length === 0 && (
        <div className="mb-4"><Notice tone="info">Register a sensor first: a calibration is always logged for a sensor.</Notice></div>
      )}
      <ResourcePage config={config} embedded={embedded} />
      <LogCalibrationDialog open={logging} station={s.pick ? undefined : s.stationId} onClose={() => setLogging(false)} />
      <BulkCalibrationDialog open={uploading} station={s.stationId} pick={s.pick} stationOptions={s.stationOptions} onClose={() => setUploading(false)} />
      {revert.dialog}
    </>
  );
}
