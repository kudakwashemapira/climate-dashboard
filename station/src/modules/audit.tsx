/**
 * Audit trail (FR-022; screen SCR-022): GET /api/audit/trail/ with the filters the view reads:
 * action, entity, user, station (superadmin), date_from and date_to. Read-only: the log is
 * append-only on the server. A station user sees the entries of their own station.
 */
import { ResourcePage, type ResourceConfig } from "../components/ResourcePage";
import { Badge, type Tone } from "../components/ui";
import { useAll } from "../hooks/useResource";
import { fmtDateTime } from "../lib/format";
import { AUDIT_ACTIONS, type AuditTrail, type User } from "../services/types";
import { useStationScope } from "./common";

const ACTION_LABEL: Record<string, string> = {
  create: "Created", update: "Updated", delete: "Deleted", login: "Signed in", export: "Exported",
  bulk_upload: "Uploaded a file", bulk_delete: "Deleted several", delete_batch: "Deleted an upload", revert: "Reverted",
  sms_send: "Sent the bulletin",
};
const ACTION_TONE: Record<string, Tone> = { create: "good", update: "info", delete: "crit", bulk_delete: "crit", delete_batch: "crit", revert: "warn", login: "neutral", export: "neutral", bulk_upload: "info", sms_send: "info" };

/**
 * The record types the server writes to the trail (the model name, see core/audit.py) and the name
 * users read instead. A sign-in is recorded against the account; an export against the record type
 * that was exported. An entry is filed under the station the record belongs to.
 */
const ENTITY_LABEL: Record<string, string> = {
  Station: "Station", StationOperator: "Station operator", SensorHardware: "Sensor", CalibrationRecord: "Calibration",
  WeatherObservation: "Observation", UploadBatch: "Upload", HistoricalBaseline: "Baseline",
  CarbonEmissionLog: "Carbon emission log", ExtremeWeatherEvent: "Extreme weather event", RenewableEnergyFeed: "Renewable energy record",
  CommunityRiskRating: "Community risk rating", InfrastructureLog: "Infrastructure log", CustomUser: "User account",
  Farmer: "Farmer", SmsMessage: "SMS to farmers", IncomingSms: "Texts from farmers", PilotSettings: "Rural pilot settings",
};

/** An update is recorded as {field: [old, new]}; a secret field only as "changed" (core/audit.py). */
function detail(value: unknown): string {
  if (Array.isArray(value) && value.length === 2) return `${value[0] ?? "empty"} changed to ${value[1] ?? "empty"}`;
  if (Array.isArray(value)) return value.join(", ");
  return value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);
}

function details(changes: unknown): string {
  if (changes === null || changes === undefined) return "";
  if (typeof changes !== "object") return String(changes);
  return Object.entries(changes as Record<string, unknown>).map(([key, value]) => `${key.replace(/_/g, " ")}: ${detail(value)}`).join("; ");
}

function byWhom(changes: unknown): string | null {
  const by = changes !== null && typeof changes === "object" ? (changes as Record<string, unknown>).by : null;
  return typeof by === "string" ? by : null;
}

export function AuditScreen() {
  const s = useStationScope();
  // Accounts can only be listed by a superadmin, so the user filter is national only.
  const users = useAll<User>("/users/accounts/", {}, s.scope.national);
  const config: ResourceConfig<AuditTrail> = {
    path: "/audit/trail/",
    title: s.pick ? "Audit trail" : "Activity log",
    description: s.pick
      ? "Who did what and when, across all stations, newest first. Entries cannot be changed or removed."
      : "What was added, changed, deleted, uploaded and exported at this station, newest first. Entries cannot be changed or removed.",
    noun: "audit entry",
    canCreate: false,
    canEdit: false,
    canDelete: false,
    describe: (row) => `entry ${row.id}`,
    columns: [
      { key: "when", header: "When (CAT)", cell: (row) => <span className="whitespace-nowrap">{fmtDateTime(row.created_at)}</span> },
      // An entry with no account: one the system made for somebody else, such as a farmer's STOP by SMS ("by"), or of a removed account.
      { key: "who", header: "Account", cell: (row) => row.user_email ?? <span className="text-muted">{byWhom(row.changes) ?? "account removed"}</span> },
      ...(s.pick ? [{ key: "station", header: "Station", cell: (row: AuditTrail) => row.station_code ?? "National" }] : []),
      { key: "action", header: "Action", cell: (row) => <Badge tone={ACTION_TONE[row.action] ?? "neutral"} icon={false}>{ACTION_LABEL[row.action] ?? row.action}</Badge> },
      { key: "entity", header: "Record type", cell: (row) => ENTITY_LABEL[row.entity] ?? row.entity },
      { key: "id", header: "Record id", cell: (row) => (row.entity_id ? <span className="break-all text-ink-2">{row.entity_id}</span> : "") },
      { key: "details", header: "Details", cell: (row) => <span className="text-ink-2">{details(row.changes)}</span> },
      { key: "ip", header: "IP address", cell: (row) => <span className="whitespace-nowrap text-ink-2">{row.ip_address ?? ""}</span> },
    ],
    filters: [
      ...s.filters(),
      { name: "action", label: "Action", type: "select", options: AUDIT_ACTIONS.map((a) => ({ value: a, label: ACTION_LABEL[a] ?? a })) },
      { name: "entity", label: "Record type", type: "select", options: Object.entries(ENTITY_LABEL).map(([value, label]) => ({ value, label })) },
      ...(s.scope.national ? [{ name: "user", label: "Account", type: "select" as const, options: (users.data ?? []).map((u) => ({ value: String(u.id), label: u.email })) }] : []),
      { name: "date_from", label: "From day (UTC)", type: "date" },
      { name: "date_to", label: "To day (UTC)", type: "date" },
    ],
    fields: [],
  };
  return <ResourcePage config={config} />;
}
