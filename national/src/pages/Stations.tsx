/**
 * Station registry (FR-005, FR-006, UC-006; screen SCR-003): /api/stations/stations/
 *   GET          ?province=&station_type=&status=&search=   search matches the code or the name
 *   POST, PATCH  national superadmins only
 *
 * A station is the boundary of all station data. Deleting one would delete its sensors, readings,
 * baselines and logs with it, so the registry offers no delete: a station that stops reporting is
 * set to Inactive or Decommissioned and keeps its records.
 * Coordinates are stored encrypted (ADR-003): they are shown and edited, never filtered or sorted on.
 * To let a station sign in, register it here, then add its first account under Users and access.
 */
import { useNavigate } from "react-router-dom";
import { Archive, ArrowRight, PauseCircle, RadioTower, type LucideIcon } from "lucide-react";
import { checkRange, type FieldDef, type FieldErrors, type FormData } from "../components/FormDialog";
import { ResourcePage, type ResourceConfig } from "../components/ResourcePage";
import { Badge, IconButton, KpiCard, type Tone } from "../components/ui";
import { useStations } from "../hooks/useLookups";
import { useList } from "../hooks/useResource";
import { fmtDate, fmtInt } from "../lib/format";
import { STATION_TONE } from "../lib/tones";
import { PROVINCES, STATION_STATUSES, STATION_TYPES, options, type Station, type StationStatus } from "../services/types";
import { StationLink } from "./shared";

const none = <span className="text-muted">not recorded</span>;

export const STATION_FIELDS: FieldDef[] = [
  { name: "station_code", label: "Station code", required: true, maxLength: 20, placeholder: "HRE-001", hint: "Unique across the country, saved in capitals: letters, digits and hyphens, starting with a letter. It names the station on every screen and in every export." },
  { name: "name", label: "Name", required: true, maxLength: 120, placeholder: "Harare Belvedere", hint: "No two stations of a province share a name. If the station is already in the register, open it instead of adding it again." },
  { name: "station_type", label: "Type", type: "select", required: true, options: options(STATION_TYPES) },
  { name: "status", label: "Status", type: "select", required: true, options: options(STATION_STATUSES), hint: "Data completeness is measured for Active stations only." },
  { name: "province", label: "Province", type: "select", required: true, options: options(PROVINCES) },
  { name: "district", label: "District", maxLength: 60 },
  { name: "station_coordinates", label: "Coordinates (latitude, longitude)", required: true, placeholder: "-17.83,31.02", hint: "Decimal degrees, latitude first. Stored encrypted." },
  { name: "elevation_m", label: "Elevation (m)", type: "number", step: "0.1", min: "-100", max: "3000" },
  { name: "commissioned_on", label: "Commissioned on", type: "date" },
  { name: "is_rural", label: "Rural pilot station", type: "checkbox", wide: true, hint: "The station serves a rural farming area: it is counted in the rural adoption report. Any station can register farmers." },
];

export const STATION_DEFAULTS: FormData = { station_type: "Meteorological", status: "Active", is_rural: false };

// The same pattern and ranges as StationSerializer.validate_station_coordinates.
const COORDINATES = /^\s*-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?\s*$/;

/** Checks made before a station is saved, so the reason is read beside the field. */
export function checkStation(form: FormData, row: Station | null, all: Station[]): FieldErrors {
  const errors: FieldErrors = {};
  const code = String(form.station_code ?? "").trim();
  if (code && all.some((other) => other.id !== row?.id && other.station_code === code)) errors.station_code = "Another station already has this code.";
  const coordinates = String(form.station_coordinates ?? "");
  if (coordinates.trim()) {
    if (!COORDINATES.test(coordinates)) {
      errors.station_coordinates = "Write latitude, a comma, then longitude, in decimal degrees: -17.83,31.02";
    } else {
      const [latitude, longitude] = coordinates.split(",").map(Number);
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) errors.station_coordinates = "Latitude runs from -90 to 90 and longitude from -180 to 180.";
    }
  }
  return { ...errors, ...checkRange(form, "elevation_m", -100, 3000, "Enter an elevation from -100 to 3,000 m.") };
}

/** Number of stations in one status: the `count` of the filtered list. */
function StatusCount({ status, label, detail, icon, tone }: { status: StationStatus; label: string; detail: string; icon: LucideIcon; tone: Tone }) {
  const list = useList<Station>("/stations/stations/", { status, page_size: 1 });
  return <KpiCard label={label} value={list.data ? fmtInt(list.data.count) : "…"} detail={detail} icon={icon} tone={tone} />;
}

export default function Stations() {
  const navigate = useNavigate();
  const { stations } = useStations();
  const config: ResourceConfig<Station> = {
    path: "/stations/stations/",
    sortable: ["code", "type", "province", "district", "status", "commissioned", "id"],
    title: "Stations",
    description: "Every registered station. Open a station to see its profile, people, sensors and data. A station is never deleted: set its status to Inactive or Decommissioned and its records are kept.",
    noun: "station",
    exportName: "stations",
    canDelete: false,
    describe: (row) => `station ${row.station_code}`,
    columns: [
      { key: "code", header: "Station", cell: (row) => <StationLink id={row.id} code={row.station_code} name={row.name} /> },
      { key: "type", header: "Type", cell: (row) => row.station_type },
      { key: "province", header: "Province", cell: (row) => row.province },
      { key: "district", header: "District", cell: (row) => row.district ?? none },
      { key: "status", header: "Status", cell: (row) => (
        <span className="flex flex-wrap gap-1"><Badge tone={STATION_TONE[row.status]}>{row.status}</Badge>{row.is_rural && <Badge tone="info">Rural pilot</Badge>}</span>
      ) },
      { key: "commissioned", header: "Commissioned", cell: (row) => (row.commissioned_on ? <span className="whitespace-nowrap">{fmtDate(row.commissioned_on)}</span> : none) },
      { key: "id", header: "Station ID", align: "right", cell: (row) => row.id },
    ],
    filters: [
      { name: "search", label: "Code or name", type: "text", placeholder: "Search" },
      { name: "province", label: "Province", type: "select", options: options(PROVINCES) },
      { name: "station_type", label: "Type", type: "select", options: options(STATION_TYPES) },
      { name: "status", label: "Status", type: "select", options: options(STATION_STATUSES) },
      { name: "is_rural", label: "Rural pilot", type: "select", options: [{ value: "true", label: "Rural pilot stations" }, { value: "false", label: "Other stations" }] },
    ],
    fields: STATION_FIELDS,
    defaults: STATION_DEFAULTS,
    validate: (form, _mode, row) => checkStation(form, row, stations),
    rowActions: (row) => (
      <IconButton label={`Open station ${row.station_code}`} onClick={() => navigate(`/stations/${row.id}`)}><ArrowRight className="h-4 w-4" aria-hidden /></IconButton>
    ),
    above: (
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatusCount status="Active" label="Active stations" detail="Reporting, and measured for completeness" icon={RadioTower} tone="good" />
        <StatusCount status="Inactive" label="Inactive stations" detail="Not reporting for now" icon={PauseCircle} tone="warn" />
        <StatusCount status="Decommissioned" label="Decommissioned stations" detail="Closed; their records are kept" icon={Archive} tone="neutral" />
      </div>
    ),
    emptyHint: "Register the first station, then add its first account under Users and access.",
  };
  return (
    <>
      <ResourcePage config={config} />
      <p className="mt-3 text-xs text-muted">A station user types the station code on the station app sign-in page. The Station ID number is accepted there too.</p>
    </>
  );
}
