/**
 * The one formatting helper of this app (CD-3.05 section 5, CD-3.07 section 6.2).
 * Every number and date shown on screen goes through here: thousands separators, fixed decimals
 * per metric, percentages with one decimal, and "no data" for a missing value, never zero.
 * Times are stored in UTC and shown in Central Africa Time.
 */
export const NO_DATA = "no data";

const LOCALE = "en-GB";
const ZONE = "Africa/Harare";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Numeric = number | string | null | undefined;

export function toNumber(value: Numeric): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function fmtNumber(value: Numeric, decimals = 0): string {
  const n = toNumber(value);
  if (n === null) return NO_DATA;
  return n.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export const fmtInt = (value: Numeric): string => fmtNumber(value, 0);

export function fmtPct(value: Numeric): string {
  const n = toNumber(value);
  return n === null ? NO_DATA : `${fmtNumber(n, 1)}%`;
}

/** A change against a baseline: always carries its sign, with a true minus sign. */
export function fmtSigned(value: Numeric, decimals = 1): string {
  const n = toNumber(value);
  if (n === null) return NO_DATA;
  const body = fmtNumber(Math.abs(n), decimals);
  return n > 0 ? `+${body}` : n < 0 ? `−${body}` : body;
}

const METRIC_DECIMALS: Record<string, number> = { TEMP_C: 1, PRECIP_MM: 1, HUMIDITY_PCT: 0, WIND_MS: 1 };

export const metricDecimals = (metric?: string | null): number => (metric && metric in METRIC_DECIMALS ? METRIC_DECIMALS[metric] : 1);

/** A reading with its unit, for example "24.5 °C". The unit is never dropped. */
export function fmtReading(value: Numeric, unit?: string | null, metric?: string | null): string {
  const n = toNumber(value);
  if (n === null) return NO_DATA;
  const text = fmtNumber(n, metricDecimals(metric));
  if (!unit) return text;
  return unit === "%" ? `${text}%` : `${text} ${unit}`;
}

export function fmtWithUnit(value: Numeric, unit: string, decimals = 1): string {
  const n = toNumber(value);
  return n === null ? NO_DATA : `${fmtNumber(n, decimals)} ${unit}`;
}

/** Axis ticks: 0, 500, 1K, 2.5K, 1.2M. */
export function fmtCompact(value: Numeric): string {
  const n = toNumber(value);
  if (n === null) return "";
  return Math.abs(n) < 1000 ? fmtNumber(n, Number.isInteger(n) ? 0 : 1) : new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** "2026-10-12" or a timestamp -> "12 Oct 2026". Date-only values are never shifted by a time zone. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return NO_DATA;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return NO_DATA;
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: dateOnly ? "UTC" : ZONE });
}

/** A timestamp in Central Africa Time: "12 Oct 2026, 08:00". */
export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return NO_DATA;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return NO_DATA;
  return d.toLocaleString(LOCALE, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONE });
}

export const fmtMonth = (month: number): string => MONTHS[month - 1] ?? String(month);

/** Short day label for a chart axis: "12 Oct". */
export function fmtDay(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" });
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** ISO timestamp -> the value a datetime-local input expects, in the browser's own time zone. */
export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The value of a datetime-local input -> ISO timestamp in UTC, as the API stores it. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * A calendar day in Central Africa Time as an API time filter. CAT is UTC+2 all year, so the
 * offset is fixed. "To" covers the whole day: a bare date would stop at 00:00 and drop its readings.
 */
export const dayStartParam = (date: string): string => (date ? `${date}T00:00:00+02:00` : "");
export const dayEndParam = (date: string): string => (date ? `${date}T23:59:59+02:00` : "");

export const fmtYesNo = (value: boolean | null | undefined): string => (value ? "Yes" : "No");

/** "2025-01-01" and "2025-03-31" -> "1 Jan 2025 to 31 Mar 2025". */
export const fmtPeriod = (from: string | null | undefined, to: string | null | undefined): string => `${fmtDate(from)} to ${fmtDate(to)}`;

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
