/**
 * The signed-in session: tokens and the user summary returned at sign-in.
 * Kept in memory and in sessionStorage, so it ends when the browser tab is closed.
 */
import { useSyncExternalStore } from "react";

export interface SessionUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_superuser: boolean;
  role: { name: string; level: number } | null;
  station: { id: number; station_code: string; name: string; station_type?: string } | null;
}

export interface Session {
  access: string;
  refresh: string;
  user: SessionUser;
}

const KEY = "climate.session";
const listeners = new Set<() => void>();

function read(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Session) : null;
    return parsed && parsed.access && parsed.user ? parsed : null;
  } catch {
    return null; // storage unavailable or damaged: treat as signed out
  }
}

let current: Session | null = read();

export const getSession = (): Session | null => current;

export function setSession(next: Session | null): void {
  current = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the session still works for this page load */
  }
  listeners.forEach((notify) => notify());
}

export const clearSession = (): void => setSession(null);

export function setAccessToken(access: string): void {
  if (current) setSession({ ...current, access });
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** Re-renders the caller when the user signs in, signs out or the session expires. */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, getSession);
}

/**
 * Access level 1 to 4 (FR-021; the matrix is in the backend, core/permissions.py):
 * 1 national superadmin, 2 station administrator, 3 station data officer, 4 read-only.
 */
export function levelOf(user: SessionUser | undefined): number {
  if (!user) return 4;
  return user.is_superuser ? 1 : user.role?.level ?? 4;
}

/** Levels 1 to 3 add and edit records, upload files and log calibrations. */
export function canWrite(user: SessionUser | undefined): boolean {
  return Boolean(user) && levelOf(user) <= 3;
}

/** Levels 1 and 2 also delete, bulk delete, revert calibrations and change the station set-up. */
export function canAdminister(user: SessionUser | undefined): boolean {
  return Boolean(user) && levelOf(user) <= 2;
}

/** What the signed-in account may see and change. National superadmins see every station. */
export interface Scope {
  national: boolean;
  /** The station a station user belongs to; null for a national superadmin. */
  stationId: number | null;
  writable: boolean;
  /** May delete, bulk delete, revert and change the station set-up (levels 1 and 2). */
  admin: boolean;
}

export function useScope(): Scope {
  const user = useSession()?.user;
  return { national: Boolean(user?.is_superuser), stationId: user?.station?.id ?? null, writable: canWrite(user), admin: canAdminister(user) };
}

export function displayName(user: SessionUser): string {
  const name = `${user.first_name} ${user.last_name}`.trim();
  return name || user.email;
}
