/**
 * Export the list in view (FR-017, FR-023): GET <list endpoint>export/?output=csv|xlsx|pdf with the
 * same filters the list uses, so the file holds exactly the rows on screen across all its pages.
 * The server keeps the file among the generated reports and records the export in the audit trail.
 */
import { useState } from "react";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { describeError, download, type Params } from "../services/http";
import { useToast } from "./Toast";
import { Button } from "./ui";

const FORMATS = [
  { output: "csv", label: "CSV", icon: FileDown },
  { output: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { output: "pdf", label: "PDF", icon: FileText },
] as const;

export function ExportButtons({ path, params, name }: { path: string; params?: Params; name: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (output: (typeof FORMATS)[number]["output"]) => {
    setBusy(output);
    try {
      await download(`${path}export/`, { ...params, output }, `${name}.${output}`);
      toast.success("The export was downloaded. It is listed under Reports and recorded in the audit trail.");
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5" role="group" aria-label="Export this list">
      <span className="text-xs font-medium text-muted">Export</span>
      {FORMATS.map(({ output, label, icon: Icon }) => (
        <Button key={output} size="sm" icon={<Icon className="h-3.5 w-3.5" aria-hidden />} loading={busy === output} disabled={busy !== null}
          title={`Download this list as ${label}, with the filters now in use`} onClick={() => save(output)}>
          {label}
        </Button>
      ))}
    </span>
  );
}
