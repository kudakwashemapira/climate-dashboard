/**
 * What every station-scoped screen shares: which station a record belongs to.
 *
 * The API decides the station in three ways (core/mixins.py), and the screens follow it exactly:
 *  - A station user always reads and writes their own station. The body still has to carry the
 *    station for sensors, because that serializer requires the field; the server overwrites it.
 *  - A national superadmin reads every station, may narrow a list with ?station=<id>, and must name
 *    the station when creating a record.
 *  - A screen opened for one station (the station detail tabs) fixes the station for both.
 */
import type { Column } from "../components/DataTable";
import type { FieldDef, FormData } from "../components/FormDialog";
import type { FilterDef } from "../components/ResourcePage";
import { useStations } from "../hooks/useLookups";
import type { Params } from "../services/http";
import { useScope, type Scope } from "../services/session";

/** Props of every module screen. */
export interface ModuleProps {
  /** Show and write the records of this one station (national station detail). */
  station?: number;
  /** Inside a tab: no page title, the description sits above the table. */
  embedded?: boolean;
}

export interface StationScope {
  scope: Scope;
  /** True when the user picks the station: a superadmin on a cross-station screen. */
  pick: boolean;
  /** The station records are written to, when it is already known. */
  stationId: number | null;
  /** "HRE-001" for a station id. */
  code: (id: number | null | undefined) => string;
  stationOptions: Array<{ value: string; label: string }>;
  columns: <T extends { station: number }>() => Column<T>[];
  filters: () => FilterDef[];
  fields: (resets?: string[]) => FieldDef[];
  /** Always sent with the list request. */
  baseParams: Params | undefined;
  /** The station as a query parameter, for endpoints that read it from the address. */
  stationParam: (form?: FormData) => Params;
  /** Adds the station to a request body when the user did not pick it in the form. */
  withStation: (payload: Record<string, unknown>) => Record<string, unknown>;
}

export function useStationScope(fixed?: number): StationScope {
  const scope = useScope();
  const { options, code } = useStations();
  const pick = scope.national && fixed === undefined;
  const stationId = fixed ?? scope.stationId;
  return {
    scope,
    pick,
    stationId,
    code,
    stationOptions: options,
    columns: () => (pick ? [{ key: "station", header: "Station", cell: (row) => code(row.station) }] : []),
    filters: () => (pick ? [{ name: "station", label: "Station", type: "select", options }] : []),
    fields: (resets) => (pick
      ? [{ name: "station", label: "Station", type: "select", required: true, options, lockedOnEdit: true, wide: true, resets,
           hint: "The station this record belongs to. It cannot be changed afterwards." }]
      : []),
    baseParams: fixed !== undefined ? { station: fixed } : undefined,
    stationParam: (form) => ({ station: pick ? String(form?.station ?? "") : stationId }),
    withStation: (payload) => (pick ? payload : { ...payload, station: stationId }),
  };
}
