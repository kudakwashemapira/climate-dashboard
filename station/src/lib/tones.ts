/**
 * Which badge tone each status value takes. The badge always shows the word and an icon as well,
 * so the tone only supports the meaning (CD-3.05 section 6: never colour alone).
 */
import type { Tone } from "../components/ui";
import type {
  BatchStatus, CalibrationResult, CalibrationStatus, IncomingKind, QualityFlag, SensorStatus, Severity, SmsStatus, StationStatus,
} from "../services/types";

export const QUALITY_TONE: Record<QualityFlag, Tone> = { Valid: "good", Estimated: "info", Suspect: "warn", Rejected: "crit" };
export const SENSOR_TONE: Record<SensorStatus, Tone> = { Active: "good", Faulty: "crit", "Out for calibration": "warn", Retired: "neutral" };
export const CALIBRATION_TONE: Record<CalibrationStatus, Tone> = { Current: "good", Due: "warn", Overdue: "crit", Unknown: "neutral" };
export const RESULT_TONE: Record<CalibrationResult, Tone> = { Pass: "good", Adjusted: "info", Fail: "crit" };
export const STATION_TONE: Record<StationStatus, Tone> = { Active: "good", Inactive: "warn", Decommissioned: "neutral" };
export const SEVERITY_TONE: Record<Severity, Tone> = { Low: "neutral", Moderate: "info", High: "warn", Extreme: "crit" };
export const BATCH_TONE: Record<BatchStatus, Tone> = { Pending: "info", Completed: "good", Partial: "warn", Failed: "crit", Deleted: "neutral" };
export const SMS_TONE: Record<SmsStatus, Tone> = { Queued: "neutral", Sent: "info", Delivered: "good", Undelivered: "warn", Failed: "crit" };
export const INCOMING_TONE: Record<IncomingKind, Tone> = {
  Weather: "info", Stop: "warn", Start: "good", Help: "neutral", Join: "info", Yes: "good", Other: "neutral",
};

/** What each calibration status means, in the words of sensors/services.py. */
export const CALIBRATION_MEANING: Record<CalibrationStatus, string> = {
  Current: "Next calibration is due in more than 30 days",
  Due: "Next calibration is due within 30 days",
  Overdue: "The due date has passed, or the last calibration failed",
  Unknown: "No calibration has been logged",
};

/** A share of 100 judged against two thresholds; null (no data) is neutral. */
export function pctTone(value: number | null | undefined, good = 95, warn = 80): Tone {
  if (value === null || value === undefined) return "neutral";
  return value >= good ? "good" : value >= warn ? "warn" : "crit";
}
