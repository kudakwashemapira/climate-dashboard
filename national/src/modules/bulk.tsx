/**
 * Loading records from a file, for the record sets that share the plain upload actions
 * (FR-007, FR-008; screen SCR-038): carbon, events, renewables, risk and infrastructure.
 *   GET  <list>bulk_upload_template/?output=csv|xlsx[&example=1]   the template, with or without an example row
 *   POST <list>bulk_upload/?preview=true[&station=<id>]            check the file, save nothing
 *   POST <list>bulk_upload/[?station=<id>]                         save the valid rows
 * The steps are those of the observation upload: get the template, check the file, upload it.
 * The template columns shown here are the ones the server reads; they are changed together.
 */
import { useState, type ReactNode } from "react";
import { FileDown, FileSpreadsheet, Upload } from "lucide-react";
import { PlainTable } from "../components/DataTable";
import { Dialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { Button, Choice } from "../components/ui";
import { describeError, download } from "../services/http";
import { useStationScope } from "./common";
import { BulkUploader } from "./upload";

export interface ColumnGuide {
  /** The header exactly as the template writes it; * marks a required column. */
  column: string;
  rule: string;
}

export interface FileUploadConfig {
  /** The list endpoint, for example "/carbon/emissions/". */
  path: string;
  /** "carbon emission logs": what the file holds. */
  title: string;
  /** The file name of the template, without extension. */
  name: string;
  rowNoun: string;
  columns: ColumnGuide[];
}

function FileUploadDialog({ open, onClose, config, station }: { open: boolean; onClose: () => void; config: FileUploadConfig; station?: number }) {
  const s = useStationScope(station);
  const toast = useToast();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // A station user's file goes to their own station; a superadmin names it, unless the screen fixes it.
  const chosen = s.pick ? target : s.stationId === null ? "" : String(s.stationId);

  const template = async (output: "csv" | "xlsx", example: boolean) => {
    const key = `${output}${example ? "-example" : ""}`;
    setBusy(key);
    try {
      await download(`${config.path}bulk_upload_template/`, { output, example: example ? 1 : undefined }, `${config.name}_template.${output}`);
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} size="lg" title={`Upload ${config.title}`} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}
      description="The file is checked first, so you see every problem row before anything is saved. Each row is saved exactly as a single record would be.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<FileSpreadsheet className="h-4 w-4" aria-hidden />} onClick={() => template("xlsx", false)} loading={busy === "xlsx"} disabled={busy !== null}>Excel template</Button>
          <Button icon={<FileDown className="h-4 w-4" aria-hidden />} onClick={() => template("csv", false)} loading={busy === "csv"} disabled={busy !== null}>CSV template</Button>
          <Button size="sm" onClick={() => template("csv", true)} loading={busy === "csv-example"} disabled={busy !== null}>With an example row</Button>
          <p className="text-xs text-muted">Keep the header row as it is. One record per row.</p>
        </div>
        <PlainTable caption="Template columns" scroll={false} rows={config.columns} rowKey={(row) => row.column}
          columns={[
            { key: "column", header: "Column", cell: (row) => <span className="whitespace-nowrap font-semibold">{row.column}</span> },
            { key: "rule", header: "What to enter", cell: (row) => row.rule },
          ]} />
        {s.pick && (
          <div className="max-w-md">
            <label htmlFor="file-upload-station" className="label">Station the file belongs to <span className="text-crit" aria-hidden>*</span></label>
            <Choice id="file-upload-station" value={target} onChange={setTarget} options={s.stationOptions} />
            <p className="mt-1 text-xs text-muted">Every row is saved to this station.</p>
          </div>
        )}
        {open && (
          <BulkUploader key={chosen} path={`${config.path}bulk_upload/`} params={chosen ? { station: chosen } : undefined}
            blocked={s.pick && !chosen ? "Choose the station the file belongs to." : undefined} rowNoun={config.rowNoun} />
        )}
      </div>
    </Dialog>
  );
}

/** The "Upload a file" button of a record screen and the dialog it opens. */
export function useFileUpload(config: FileUploadConfig, station?: number): { button: ReactNode; dialog: ReactNode } {
  const s = useStationScope(station);
  const [open, setOpen] = useState(false);
  return {
    button: s.scope.writable ? <Button icon={<Upload className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>Upload a file</Button> : null,
    dialog: <FileUploadDialog open={open} onClose={() => setOpen(false)} config={config} station={station} />,
  };
}
