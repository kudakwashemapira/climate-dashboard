/** Small collections used by pick lists and to show a code instead of a numeric id. */
import { useMemo } from "react";
import { useAll } from "./useResource";
import type { MetricType, Sensor, Station } from "../services/types";

export function useStations() {
  const query = useAll<Station>("/stations/stations/");
  const stations = useMemo(() => query.data ?? [], [query.data]);
  const byId = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const options = useMemo(() => stations.map((s) => ({ value: String(s.id), label: `${s.station_code} – ${s.name}` })), [stations]);
  /** "HRE-001" for a station id; the id itself while the list is loading. */
  const code = (id: number | null | undefined): string => (id == null ? "" : byId.get(id)?.station_code ?? `#${id}`);
  return { stations, byId, options, code, isLoading: query.isLoading };
}

export function useMetrics() {
  const query = useAll<MetricType>("/weather/metrics/");
  const metrics = useMemo(() => query.data ?? [], [query.data]);
  const byCode = useMemo(() => new Map(metrics.map((m) => [m.code, m])), [metrics]);
  const options = useMemo(() => metrics.filter((m) => m.is_active).map((m) => ({ value: m.code, label: `${m.name} (${m.unit})` })), [metrics]);
  return { metrics, byCode, options, isLoading: query.isLoading };
}

/** Sensors, optionally of one station (superadmins); station users always get their own. */
export function useSensors(station?: number | string | null) {
  const query = useAll<Sensor>("/sensors/hardware/", station ? { station } : {});
  const sensors = useMemo(() => query.data ?? [], [query.data]);
  const options = useMemo(() => sensors.map((s) => ({ value: String(s.id), label: `${s.sensor_code} – ${s.sensor_type}` })), [sensors]);
  return { sensors, options, isLoading: query.isLoading };
}
