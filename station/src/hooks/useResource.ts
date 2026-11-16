/**
 * Server state goes through TanStack Query (CD-3.07 section 6.2): reads with useQuery, writes with
 * useMutation. After any write every cached list and figure is refetched, so two screens can never
 * show different counts for the same thing.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, send, type Params } from "../services/http";
import type { Page } from "../services/types";

/** One page of a list. While a new page or filter loads, the previous rows stay on screen. */
export function useList<T>(path: string, params: Params = {}, enabled = true) {
  return useQuery({
    queryKey: [path, params],
    queryFn: () => get<Page<T>>(path, params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** A whole small collection (stations, metrics, sensors) for pick lists and lookups. */
export function useAll<T>(path: string, params: Params = {}, enabled = true) {
  return useQuery({
    queryKey: [path, "all", params],
    queryFn: async () => (await get<Page<T>>(path, { ...params, page_size: 500 })).results,
    staleTime: 60_000,
    enabled,
  });
}

/** Any other read: one object, or an analysis result. */
export function useFetch<T>(path: string, params: Params = {}, enabled = true) {
  return useQuery({
    queryKey: [path, params],
    queryFn: () => get<T>(path, params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export interface SaveInput {
  id?: number | string;
  data: unknown;
  /** Extra query parameters, for example ?station= when a superadmin creates a record. */
  params?: Params;
}

/** Create (no id) or update (with id) one record of a list endpoint. */
export function useSave<T>(path: string, method: "PATCH" | "PUT" = "PATCH") {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, params }: SaveInput) => {
      const query = params ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])).toString()}` : "";
      return id === undefined ? send<T>("POST", `${path}${query}`, data) : send<T>(method, `${path}${id}/${query}`, data);
    },
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useRemove(path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => send<null>("DELETE", `${path}${id}/`),
    onSuccess: () => client.invalidateQueries(),
  });
}

/** A custom action such as "revert calibration". */
export function useAction<T, V = unknown>(run: (input: V) => Promise<T>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: run, onSuccess: () => client.invalidateQueries() });
}
