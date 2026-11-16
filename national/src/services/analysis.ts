/**
 * Analysis endpoints (/api/analysis/...). Every figure is computed by the backend AnalysisService
 * (CD-3.02 section 4.6); this app only displays them and never recomputes one.
 *
 * These response types are written by hand because the analysis views are not described in the
 * OpenAPI schema yet. When they are, derive them from schema.d.ts like the types in types.ts.
 */
import type { BatchStatus, CalibrationStatus, Language, Severity, StationStatus } from "./types";

/** The station fields every analysis row carries. Coordinates are never part of an analysis. */
export interface StationRef {
  station: number;
  station_code: string;
  station_name: string;
  province: string;
  status: StationStatus;
}

interface Listing<T> {
  count: number;
  next: null;
  previous: null;
  results: T[];
}

export interface Overview {
  period: { from: string; to: string; days: number };
  stations: { total: number; active: number };
  sensors: { total: number; in_service: number };
  observations: { total: number; in_period: number };
  active_alerts: number;
  data_completeness_pct: number | null;
  calibration_compliance_pct: number | null;
  calibration_status: Record<CalibrationStatus, number>;
  observations_by_day: Array<{ date: string; count: number }>;
  last_upload: null | {
    id: string; filename: string; status: BatchStatus; created_at: string;
    success_count: number; error_count: number; station: number; station_code: string | null;
  };
}

export interface DataQualityRow extends StationRef {
  expected: number | null;
  received: number;
  completeness_pct: number | null;
  rejected_rows: number;
  suspect_rows: number;
  sensors: number;
  overdue_calibrations: number;
  due_calibrations: number;
  last_observation_at: string | null;
}
export interface DataQuality extends Listing<DataQualityRow> {
  period: { from: string; to: string; days: number };
}

export interface RainfallRow extends StationRef {
  month: number;
  total_mm: number;
  readings: number;
  baseline_mean_mm: number | null;
  baseline_period: string | null;
  anomaly_mm: number | null;
  anomaly_pct: number | null;
  anomaly_sd: number | null;
}
export interface RainfallAnomalies extends Listing<RainfallRow> {
  year: number;
  unit: string;
}

export interface TemperatureSeries extends StationRef {
  series: Array<{ year: number; mean_c: number; readings: number }>;
  years: number;
  slope_c_per_decade: number | null;
}
export interface TemperatureTrends extends Listing<TemperatureSeries> {
  from_year: number;
  to_year: number;
  unit: string;
  min_years_for_trend: number;
}

export interface CarbonOutput {
  year: number;
  unit: string;
  total_tonnes: number;
  categories: string[];
  by_category: Array<{ source_category: string; total_tonnes: number }>;
  by_province: Array<{ province: string; total_tonnes: number }>;
  by_quarter: Array<{ quarter: string; source_category: string; total_tonnes: number }>;
}

export interface AlertRow extends StationRef {
  id: number;
  event_type: string;
  severity: Severity;
  started_at: string;
  ended_at: string | null;
  active: boolean;
  alert_issued: boolean;
  peak_value: number | null;
  description: string | null;
}
export interface ExtremeAlerts extends Listing<AlertRow> {
  year: number;
  total: number;
  active: number;
  severities: Severity[];
  by_type: Array<{ event_type: string; count: number }>;
  by_severity: Array<{ severity: Severity; count: number }>;
  matrix: Array<{ event_type: string; severity: Severity; count: number }>;
}

export interface RegionalRow {
  province: string;
  stations: number;
  stations_reporting: number;
  value: number | null;
  readings: number;
}
export interface Regional extends Listing<RegionalRow> {
  metric: string;
  metric_name: string;
  unit: string;
  year: number;
  aggregation: string;
}

/** above, near or below the baseline for the same days (the band is in analysis/services.py). */
export type VersusNormal = "above" | "near" | "below";

/** GET /api/analysis/farm-climate/: one station, for its farmers (rural pilot). */
export interface FarmClimate extends StationRef {
  is_rural: boolean;
  period: { from: string; to: string; days: number };
  rain: { total_mm: number | null; readings: number; rain_days: number; normal_mm: number | null; vs_normal: VersusNormal | null };
  season: { from: string; to: string; total_mm: number | null; readings: number; normal_mm: number | null; vs_normal: VersusNormal | null };
  temperature: { min_c: number | null; max_c: number | null; mean_c: number | null; readings: number };
  /** One entry per day of the last 30; null when the day has no rain reading (not a dry day). */
  daily_rain: Array<{ date: string; rain_mm: number | null }>;
  alerts: Array<{
    id: number; event_type: string; severity: Severity; started_at: string; alert_issued: boolean; description: string | null;
    /** The event and its severity in each language, as the SMS words them. */
    names: Record<Language, { event: string; severity: string }>;
  }>;
  risks: Array<{ hazard_type: string; rating: number; assessed_on: string; names: Record<Language, string> }>;
  /** `reached`: farmers receiving SMS with at least one message the provider reported delivered. */
  farmers: { active: number; opted_out: number; reached: number; by_language: Array<{ language: Language; name: string; count: number }> };
  last_bulletin_at: string | null;
  /** This week so far. Without a rain or temperature reading by Sunday, the bulletin of `sends_on` is not sent. */
  next_bulletin: { from: string; to: string; sends_on: string; readings: number; at_risk: boolean };
  /** The number farmers text STOP, START, RAIN or HELP to; null while there is none. */
  reply_number: string | null;
  /** Demo data only: the week's figures are a weather model's values for the area; this is the credit to show. */
  weather_model: string | null;
  /** This week's SMS as each language sends it. `reviewed` is false while a translation is a draft;
   *  `sent_as` is the language a farmer who chose it receives (English while a draft is held back). */
  bulletin: Array<{ language: Language; name: string; reviewed: boolean; sent_as: Language; text: string }>;
}

export interface AdoptionRow extends StationRef {
  is_rural: boolean;
  farmers_active: number;
  farmers_opted_out: number;
  farmers_new: number;
  /** Receiving SMS, with at least one message the provider reported delivered. */
  farmers_reached: number;
  /** Farmers who texted the system in the period. */
  farmers_texted: number;
  /** Handed to the provider: delivered + undelivered + awaiting a delivery report. */
  sms_sent: number;
  sms_delivered: number;
  sms_undelivered: number;
  sms_awaiting: number;
  sms_failed: number;
  sms_queued: number;
  accounts: number;
  accounts_signed_in: number;
  last_sign_in_at: string | null;
  readings_entered: number;
  /** Rain and temperature readings so far this week; none and farmers waiting means no bulletin next Monday. */
  readings_this_week: number;
  bulletin_at_risk: boolean;
  in_use: boolean;
}
/** GET /api/analysis/adoption/: who is using the system, per station, against the rural pilot target. */
export interface Adoption extends Listing<AdoptionRow> {
  period: { from: string; to: string; days: number };
  /** The target counts farmers reached (farmers_pct of `farmers`). */
  target: { deadline: string; days_left: number; farmers: number | null; farmers_pct: number | null };
  next_bulletin: { from: string; to: string; sends_on: string };
  totals: {
    stations: number; rural_stations: number; stations_in_use: number; stations_bulletin_at_risk: number;
    farmers_active: number; farmers_new: number; farmers_opted_out: number; farmers_reached: number; farmers_texted: number;
    sms_sent: number; sms_delivered: number; sms_undelivered: number; sms_awaiting: number; sms_failed: number;
    accounts_signed_in: number; readings_entered: number;
  };
}

/** done: in place; todo: missing, real SMS cannot fully work; check: works, but look at it; note: for information. */
export type SetupState = "done" | "todo" | "check" | "note";

/** GET /api/farmers/setup/ (superadmins): what is in place and still needed for real SMS (farmers/setup.py). */
export interface SmsSetup {
  environment: string;
  /** Where farmers' SMS go: nowhere, the worker log, the development simulator, or an SMS company. */
  mode: "none" | "console" | "simulator" | "company";
  real_sms: boolean;
  /** The number of items marked todo. */
  open: number;
  items: Array<{ key: string; label: string; state: SetupState; detail: string; owner: string }>;
}

/** GET, PATCH /api/farmers/pilot/ (superadmins): the pilot's target, deadline and checked languages (farmers/pilot.py). */
export interface PilotSettings {
  target_farmers: number | null;
  deadline: string | null;
  /** Checked by a native speaker: their SMS go in that language. */
  reviewed_languages: Language[];
  /** Checked by the server setting SMS_REVIEWED_LANGUAGES: cannot be unticked in the app. */
  server_reviewed_languages: Language[];
}

/** The reply to POST /api/farmers/farmers/send_bulletin/: a count first, the sending only after confirm. */
export interface SendBulletinResult {
  requires_confirmation: boolean;
  farmers: number;
  queued: number;
  already_sent: number;
  skipped: string | null;
  detail: string;
}

/** Result of a bulk upload or its preview (CD-3.04 section 4.2). */
/** The reply to every bulk upload (CD-3.04 section 4.2). */
export interface UploadResult {
  count: number;
  success_count: number;
  error_count: number;
  errors: Array<{ row: number; errors: Record<string, string[] | string> }>;
  /** The rows that were refused, as they were read from the file. */
  error_rows_data?: Array<Record<string, string | number>>;
  /** A check that found problems: every row as read, keyed by the column names the upload reads, so the
   *  page can show the flagged rows for correction and rebuild the whole file (SCR-033). */
  rows_data?: Array<Record<string, string | number>>;
  /** True when the file names sensor codes the station does not have yet (FR-009). */
  requires_approval?: boolean;
  new_sensor_codes?: string[];
  /** Sensors created by a confirmed upload. */
  created_sensors?: string[];
  preview: boolean;
  batch_id?: string;
}

/** The reply to a bulk delete: a count first, the deletion only after confirm (FR-010). */
export interface BulkDeleteResult {
  requires_confirmation: boolean;
  count: number;
  deleted_count: number;
}
