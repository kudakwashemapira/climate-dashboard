/**
 * The secondary data modules (FR-015, FR-016; screens SCR-008 to SCR-012 and SCR-038):
 *   /api/carbon/emissions/      carbon emission logs
 *   /api/events/extreme/        extreme weather events
 *   /api/renewables/feeds/      renewable energy generation
 *   /api/risk/ratings/          community risk ratings
 *   /api/infrastructure/logs/   power and connectivity reliability
 *
 * Each is a list with create, update and delete, its own filters, export to CSV, Excel and PDF,
 * a file upload with a template (modules/bulk.tsx) and a bulk delete of selected rows (FR-010).
 * The checks in `validate` repeat rules the server enforces (period order, ranges), so the user
 * reads the reason beside the field before anything is sent.
 */
import { checkOrder, checkRange } from "../components/FormDialog";
import { ResourcePage, type ResourceConfig } from "../components/ResourcePage";
import { Badge, Meter } from "../components/ui";
import { useMetrics } from "../hooks/useLookups";
import { fmtDate, fmtDateTime, fmtNumber, fmtPeriod, fmtYesNo, toNumber } from "../lib/format";
import { SEVERITY_TONE } from "../lib/tones";
import {
  CARBON_CATEGORIES, CONNECTIVITY_TYPES, ENERGY_SOURCES, EVENT_TYPES, HAZARD_TYPES, POWER_SOURCES, SEVERITIES, options,
  type CarbonEmissionLog, type CommunityRiskRating, type ExtremeWeatherEvent, type InfrastructureLog, type RenewableEnergyFeed,
} from "../services/types";
import { useFileUpload, type FileUploadConfig } from "./bulk";
import { useStationScope, type ModuleProps } from "./common";

// The upload templates. The columns are the ones each viewset declares in the backend (bulk_columns).
const CARBON_UPLOAD: FileUploadConfig = {
  path: "/carbon/emissions/", title: "carbon emission logs", name: "carbon_emissions", rowNoun: "logs",
  columns: [
    { column: "Period Start *", rule: "A day, written YYYY-MM-DD." }, { column: "Period End *", rule: "A day, written YYYY-MM-DD. Not before the start." },
    { column: "Source Category *", rule: `For example ${CARBON_CATEGORIES.join(", ")}. Use the same wording each time.` },
    { column: "CO2e Tonnes *", rule: "Tonnes of CO₂ equivalent for the period; zero or more." },
    { column: "Method", rule: "The estimation method, for example IPCC Tier 1." }, { column: "Notes", rule: "Optional free text." },
  ],
};
const EVENTS_UPLOAD: FileUploadConfig = {
  path: "/events/extreme/", title: "extreme weather events", name: "extreme_events", rowNoun: "events",
  columns: [
    { column: "Event Type *", rule: `For example ${EVENT_TYPES.slice(0, 4).join(", ")}.` }, { column: "Severity *", rule: `${SEVERITIES.join(", ")}.` },
    { column: "Started At *", rule: "Date and time in Central Africa Time, for example 2026-02-10 06:00. Not in the future." },
    { column: "Ended At", rule: "Leave empty while the event is still active." },
    { column: "Peak Metric Code", rule: "The metric of the peak value, for example PRECIP_MM." }, { column: "Peak Value", rule: "In the unit of that metric." },
    { column: "Alert Issued", rule: "true or false. Empty means false." }, { column: "Description", rule: "Optional free text." },
  ],
};
const RENEWABLES_UPLOAD: FileUploadConfig = {
  path: "/renewables/feeds/", title: "renewable energy records", name: "renewable_energy", rowNoun: "records",
  columns: [
    { column: "Source Type *", rule: `Up to 10 characters, for example ${ENERGY_SOURCES.join(", ")}.` },
    { column: "Period Start *", rule: "A day, written YYYY-MM-DD." }, { column: "Period End *", rule: "A day, written YYYY-MM-DD. Not before the start." },
    { column: "Generation kWh *", rule: "Energy generated in the period; zero or more." }, { column: "Installed Capacity kW", rule: "Zero or more." },
  ],
};
const RISK_UPLOAD: FileUploadConfig = {
  path: "/risk/ratings/", title: "community risk ratings", name: "community_risk", rowNoun: "ratings",
  columns: [
    { column: "Hazard Type *", rule: `For example ${HAZARD_TYPES.join(", ")}.` }, { column: "Rating *", rule: "A whole number from 1 (lowest) to 5 (highest)." },
    { column: "Assessed On *", rule: "A day, written YYYY-MM-DD. Not in the future." }, { column: "Assessed By", rule: "The person or unit that assessed the risk." },
    { column: "Notes", rule: "Optional free text." },
  ],
};
const INFRASTRUCTURE_UPLOAD: FileUploadConfig = {
  path: "/infrastructure/logs/", title: "infrastructure logs", name: "infrastructure", rowNoun: "logs",
  columns: [
    { column: "Logged On *", rule: "A day, written YYYY-MM-DD. Not in the future." }, { column: "Power Source *", rule: `For example ${POWER_SOURCES.join(", ")}.` },
    { column: "Power Uptime %", rule: "A percentage from 0 to 100." }, { column: "Connectivity Type *", rule: `For example ${CONNECTIVITY_TYPES.join(", ")}.` },
    { column: "Connectivity Uptime %", rule: "A percentage from 0 to 100." }, { column: "Notes", rule: "Optional free text." },
  ],
};

const NOT_NEGATIVE = "Enter zero or a positive number.";
const END_AFTER_START = "The end must not be before the start.";
const none = <span className="text-muted">not recorded</span>;

// ---- carbon emissions -----------------------------------------------------------------------------
export function CarbonScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const upload = useFileUpload(CARBON_UPLOAD, station);
  const config: ResourceConfig<CarbonEmissionLog> = {
    path: "/carbon/emissions/",
    sortable: ["period", "category", "tonnes", "method", "station"],
    title: "Carbon emissions",
    description: "Emission logs by period and source category, in tonnes of CO₂ equivalent. Totals by province and quarter are on the carbon output analysis.",
    noun: "emission log",
    exportName: CARBON_UPLOAD.name,
    bulkDelete: true,
    headerActions: embedded ? undefined : upload.button,
    baseParams: s.baseParams,
    describe: (row) => `the ${row.source_category} log for ${fmtPeriod(row.period_start, row.period_end)}`,
    columns: [
      { key: "period", header: "Period", cell: (row) => <span className="whitespace-nowrap">{fmtPeriod(row.period_start, row.period_end)}</span> },
      ...s.columns<CarbonEmissionLog>(),
      { key: "category", header: "Source category", cell: (row) => row.source_category },
      { key: "tonnes", header: "Emissions (tCO₂e)", align: "right", cell: (row) => <span className="font-semibold">{fmtNumber(row.co2e_tonnes, 3)}</span> },
      { key: "method", header: "Method", cell: (row) => row.method ?? none },
    ],
    filters: [
      ...s.filters(),
      { name: "source_category", label: "Source category", type: "select", options: options(CARBON_CATEGORIES) },
      { name: "period_from", label: "Period from", type: "date" },
      { name: "period_to", label: "Period to", type: "date" },
    ],
    fields: [
      ...s.fields(),
      { name: "period_start", label: "Period start", type: "date", required: true },
      { name: "period_end", label: "Period end", type: "date", required: true },
      { name: "source_category", label: "Source category", required: true, maxLength: 30, suggestions: CARBON_CATEGORIES, hint: "Use the same wording each time so totals group correctly." },
      { name: "co2e_tonnes", label: "Emissions (tCO₂e)", type: "number", required: true, step: "0.001", min: "0", hint: "Tonnes of CO₂ equivalent for the period." },
      { name: "method", label: "Estimation method", maxLength: 60, placeholder: "IPCC Tier 1" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    toPayload: s.withStation,
    validate: (form) => ({
      ...checkOrder(form, "period_start", "period_end", END_AFTER_START),
      ...checkRange(form, "co2e_tonnes", 0, Number.MAX_SAFE_INTEGER, NOT_NEGATIVE),
    }),
  };
  return <><ResourcePage config={config} embedded={embedded} />{upload.dialog}</>;
}

// ---- extreme weather events -----------------------------------------------------------------------
export function EventsScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const upload = useFileUpload(EVENTS_UPLOAD, station);
  const { metrics } = useMetrics();
  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const config: ResourceConfig<ExtremeWeatherEvent> = {
    path: "/events/extreme/",
    sortable: ["started", "type", "severity", "ended", "peak", "alert", "station"],
    title: "Extreme weather events",
    description: "Floods, droughts, heatwaves and storms recorded by stations. An event with no end time is still active and counts as an active alert.",
    noun: "event",
    exportName: EVENTS_UPLOAD.name,
    bulkDelete: true,
    headerActions: embedded ? undefined : upload.button,
    baseParams: s.baseParams,
    describe: (row) => `the ${row.event_type} event that started ${fmtDateTime(row.started_at)}`,
    columns: [
      { key: "started", header: "Started (CAT)", cell: (row) => <span className="whitespace-nowrap">{fmtDateTime(row.started_at)}</span> },
      ...s.columns<ExtremeWeatherEvent>(),
      { key: "type", header: "Event type", cell: (row) => row.event_type },
      { key: "severity", header: "Severity", cell: (row) => <Badge tone={SEVERITY_TONE[row.severity]}>{row.severity}</Badge> },
      { key: "ended", header: "Ended (CAT)", cell: (row) => (row.ended_at ? <span className="whitespace-nowrap">{fmtDateTime(row.ended_at)}</span> : <Badge tone="crit">Active</Badge>) },
      { key: "peak", header: "Peak value", align: "right", cell: (row) => {
        if (row.peak_value === null) return none;
        const metric = row.peak_metric_type === null ? undefined : metricById.get(row.peak_metric_type);
        return <span className="whitespace-nowrap">{fmtNumber(row.peak_value, 1)}{metric ? ` ${metric.unit}` : ""}</span>;
      } },
      { key: "alert", header: "Alert issued", cell: (row) => fmtYesNo(row.alert_issued) },
    ],
    filters: [
      ...s.filters(),
      { name: "event_type", label: "Event type", type: "select", options: options(EVENT_TYPES) },
      { name: "severity", label: "Severity", type: "select", options: options(SEVERITIES) },
      { name: "active", label: "State", type: "select", options: [{ value: "true", label: "Still active" }, { value: "false", label: "Ended" }] },
      { name: "started_from", label: "Started from", type: "date" },
      { name: "started_to", label: "Started to", type: "date" },
    ],
    fields: [
      ...s.fields(),
      { name: "event_type", label: "Event type", required: true, maxLength: 30, suggestions: EVENT_TYPES },
      { name: "severity", label: "Severity", type: "select", required: true, options: options(SEVERITIES) },
      { name: "started_at", label: "Started at", type: "datetime", required: true, hint: "In this computer's time zone." },
      { name: "ended_at", label: "Ended at", type: "datetime", hint: "Leave empty while the event is still active." },
      { name: "peak_metric_type", label: "Peak measured as", type: "select", options: metrics.map((m) => ({ value: String(m.id), label: `${m.name} (${m.unit})` })) },
      { name: "peak_value", label: "Peak value", type: "number", step: "0.01", hint: "In the unit of the metric chosen beside it." },
      { name: "alert_issued", label: "An alert was issued", type: "checkbox", wide: true },
      { name: "description", label: "Description", type: "textarea" },
    ],
    defaults: { severity: "Moderate" },
    toPayload: s.withStation,
    validate: (form) => checkOrder(form, "started_at", "ended_at", END_AFTER_START),
  };
  return <><ResourcePage config={config} embedded={embedded} />{upload.dialog}</>;
}

// ---- renewable energy -----------------------------------------------------------------------------
export function RenewablesScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const upload = useFileUpload(RENEWABLES_UPLOAD, station);
  const config: ResourceConfig<RenewableEnergyFeed> = {
    path: "/renewables/feeds/",
    sortable: ["period", "source", "generation", "capacity", "station"],
    title: "Renewable energy",
    description: "Energy generated per period by source, in kilowatt-hours, with the installed capacity it came from.",
    noun: "generation record",
    exportName: RENEWABLES_UPLOAD.name,
    bulkDelete: true,
    headerActions: embedded ? undefined : upload.button,
    baseParams: s.baseParams,
    describe: (row) => `the ${row.source_type} record for ${fmtPeriod(row.period_start, row.period_end)}`,
    columns: [
      { key: "period", header: "Period", cell: (row) => <span className="whitespace-nowrap">{fmtPeriod(row.period_start, row.period_end)}</span> },
      ...s.columns<RenewableEnergyFeed>(),
      { key: "source", header: "Source", cell: (row) => row.source_type },
      { key: "generation", header: "Generation (kWh)", align: "right", cell: (row) => <span className="font-semibold">{fmtNumber(row.generation_kwh, 0)}</span> },
      { key: "capacity", header: "Installed capacity (kW)", align: "right", cell: (row) => (row.installed_capacity_kw === null ? none : fmtNumber(row.installed_capacity_kw, 0)) },
    ],
    filters: [
      ...s.filters(),
      { name: "source_type", label: "Source", type: "select", options: options(ENERGY_SOURCES) },
      { name: "period_from", label: "Period from", type: "date" },
      { name: "period_to", label: "Period to", type: "date" },
    ],
    fields: [
      ...s.fields(),
      { name: "source_type", label: "Source", required: true, maxLength: 10, suggestions: ENERGY_SOURCES, hint: "Up to 10 characters, for example Solar, Wind or Hydro." },
      { name: "generation_kwh", label: "Generation (kWh)", type: "number", required: true, step: "0.01", min: "0" },
      { name: "period_start", label: "Period start", type: "date", required: true },
      { name: "period_end", label: "Period end", type: "date", required: true },
      { name: "installed_capacity_kw", label: "Installed capacity (kW)", type: "number", step: "0.01", min: "0" },
    ],
    toPayload: s.withStation,
    validate: (form) => ({
      ...checkOrder(form, "period_start", "period_end", END_AFTER_START),
      ...checkRange(form, "generation_kwh", 0, Number.MAX_SAFE_INTEGER, NOT_NEGATIVE),
    }),
  };
  return <><ResourcePage config={config} embedded={embedded} />{upload.dialog}</>;
}

// ---- community risk -------------------------------------------------------------------------------
const RATINGS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n === 1 ? "1 (lowest)" : n === 5 ? "5 (highest)" : String(n) }));

export function RiskScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const upload = useFileUpload(RISK_UPLOAD, station);
  const config: ResourceConfig<CommunityRiskRating> = {
    path: "/risk/ratings/",
    sortable: ["assessed", "hazard", "rating", "by", "station"],
    title: "Community risk",
    description: "Disaster-risk ratings for the area a station serves, by hazard, on a scale of 1 to 5.",
    noun: "risk rating",
    exportName: RISK_UPLOAD.name,
    bulkDelete: true,
    headerActions: embedded ? undefined : upload.button,
    baseParams: s.baseParams,
    describe: (row) => `the ${row.hazard_type} rating of ${fmtDate(row.assessed_on)}`,
    columns: [
      { key: "assessed", header: "Assessed on", cell: (row) => <span className="whitespace-nowrap">{fmtDate(row.assessed_on)}</span> },
      ...s.columns<CommunityRiskRating>(),
      { key: "hazard", header: "Hazard", cell: (row) => row.hazard_type },
      { key: "rating", header: "Rating", cell: (row) => (
        <span className="inline-flex items-center gap-2" role="img" aria-label={`${row.rating} out of 5`}>
          <span className="flex gap-0.5" aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= row.rating ? "h-2.5 w-2.5 rounded-sm bg-accent" : "h-2.5 w-2.5 rounded-sm bg-subtle ring-1 ring-inset ring-line"} />)}
          </span>
          <span className="font-semibold">{row.rating} of 5</span>
        </span>
      ) },
      { key: "by", header: "Assessed by", cell: (row) => row.assessed_by ?? none },
    ],
    filters: [
      ...s.filters(),
      { name: "hazard_type", label: "Hazard", type: "select", options: options(HAZARD_TYPES) },
      { name: "rating", label: "Rating", type: "select", options: RATINGS },
      { name: "assessed_from", label: "Assessed from", type: "date" },
      { name: "assessed_to", label: "Assessed to", type: "date" },
    ],
    fields: [
      ...s.fields(),
      { name: "hazard_type", label: "Hazard", required: true, maxLength: 30, suggestions: HAZARD_TYPES },
      { name: "rating", label: "Rating", type: "select", required: true, options: RATINGS },
      { name: "assessed_on", label: "Assessed on", type: "date", required: true },
      { name: "assessed_by", label: "Assessed by", maxLength: 120 },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    toPayload: s.withStation,
  };
  return <><ResourcePage config={config} embedded={embedded} />{upload.dialog}</>;
}

// ---- infrastructure -------------------------------------------------------------------------------
const UPTIME = "Enter a percentage from 0 to 100.";

export function InfrastructureScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const upload = useFileUpload(INFRASTRUCTURE_UPLOAD, station);
  const uptime = (value: string | null) => (value === null ? none : <Meter value={toNumber(value)} label="Uptime" good={99} warn={95} />);
  const config: ResourceConfig<InfrastructureLog> = {
    path: "/infrastructure/logs/",
    sortable: ["logged", "power", "power_uptime", "link", "link_uptime", "station"],
    title: "Infrastructure",
    description: "How reliably a station had power and a data connection: the share of time each was available in the period logged.",
    noun: "infrastructure log",
    exportName: INFRASTRUCTURE_UPLOAD.name,
    bulkDelete: true,
    headerActions: embedded ? undefined : upload.button,
    baseParams: s.baseParams,
    describe: (row) => `the infrastructure log of ${fmtDate(row.logged_on)}`,
    columns: [
      { key: "logged", header: "Logged on", cell: (row) => <span className="whitespace-nowrap">{fmtDate(row.logged_on)}</span> },
      ...s.columns<InfrastructureLog>(),
      { key: "power", header: "Power source", cell: (row) => row.power_source },
      { key: "power_uptime", header: "Power uptime", cell: (row) => uptime(row.power_uptime_pct) },
      { key: "link", header: "Connection", cell: (row) => row.connectivity_type },
      { key: "link_uptime", header: "Connection uptime", cell: (row) => uptime(row.connectivity_uptime_pct) },
    ],
    filters: [
      ...s.filters(),
      { name: "power_source", label: "Power source", type: "select", options: options(POWER_SOURCES) },
      { name: "connectivity_type", label: "Connection", type: "select", options: options(CONNECTIVITY_TYPES) },
      { name: "logged_from", label: "Logged from", type: "date" },
      { name: "logged_to", label: "Logged to", type: "date" },
    ],
    fields: [
      ...s.fields(),
      { name: "logged_on", label: "Logged on", type: "date", required: true, wide: true },
      { name: "power_source", label: "Power source", required: true, maxLength: 12, suggestions: POWER_SOURCES },
      { name: "power_uptime_pct", label: "Power uptime (%)", type: "number", step: "0.01", min: "0", max: "100" },
      { name: "connectivity_type", label: "Connection type", required: true, maxLength: 12, suggestions: CONNECTIVITY_TYPES },
      { name: "connectivity_uptime_pct", label: "Connection uptime (%)", type: "number", step: "0.01", min: "0", max: "100" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    toPayload: s.withStation,
    validate: (form) => ({
      ...checkRange(form, "power_uptime_pct", 0, 100, UPTIME),
      ...checkRange(form, "connectivity_uptime_pct", 0, 100, UPTIME),
    }),
  };
  return <><ResourcePage config={config} embedded={embedded} />{upload.dialog}</>;
}
