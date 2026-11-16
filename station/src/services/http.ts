/**
 * The one API client. It adds the access token, renews it once when it has expired, and keeps two
 * kinds of failure apart (CD-3.07 section 6.2): the server replied with an error (ApiError), or no
 * reply was received at all (NetworkError). After a NetworkError the server may still have saved
 * the request, so screens word that case differently.
 */
import { clearSession, getSession, setAccessToken } from "./session";

export type Params = Record<string, string | number | boolean | null | undefined>;

const STATUS_TEXT: Record<number, string> = {
  401: "Your session has ended. Sign in again.",
  403: "You do not have permission to do that.",
  404: "Not found, or outside your station.",
  413: "That file is too large to upload.",
  429: "Too many attempts. Wait a minute, then try again.",
};

/** Field name -> message, from the error body Django REST Framework returns. */
function fieldMessages(body: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (body && typeof body === "object" && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (Array.isArray(value)) out[key] = value.map(String).join(" ");
      else if (typeof value === "string") out[key] = value;
      else if (value && typeof value === "object") out[key] = Object.values(value as Record<string, unknown>).flat().map(String).join(" ");
    }
  }
  return out;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  /** Messages keyed by field name; "detail" and "non_field_errors" apply to the whole request. */
  readonly fields: Record<string, string>;

  constructor(status: number, body: unknown) {
    const fields = fieldMessages(body);
    const general = fields.detail ?? fields.non_field_errors;
    const specific = Object.entries(fields).filter(([k]) => k !== "detail" && k !== "non_field_errors");
    let message = general ?? "";
    if (!message && specific.length) message = specific.map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" ");
    if (!message) message = STATUS_TEXT[status] ?? (status >= 500 ? "The server had a problem. Try again; if it continues, contact support." : `Request failed (${status}).`);
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.fields = fields;
  }
}

export class NetworkError extends Error {
  constructor() {
    super("No reply from the server. Check your connection, then try again.");
    this.name = "NetworkError";
  }
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function withQuery(path: string, params?: Params): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `${path}${path.includes("?") ? "&" : "?"}${text}` : path;
}

let renewing: Promise<boolean> | null = null;

/** One renewal at a time, shared by every request that found its token expired. */
function renewAccess(): Promise<boolean> {
  if (!renewing) {
    renewing = (async () => {
      const session = getSession();
      if (!session?.refresh) return false;
      try {
        const res = await fetch("/api/users/token/refresh/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh: session.refresh }),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { access?: string };
        if (!body.access) return false;
        setAccessToken(body.access);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      renewing = null;
    });
  }
  return renewing;
}

const isSignIn = (path: string): boolean => path.startsWith("/users/token/") || path.startsWith("/instauth/");

async function request(path: string, init: RequestInit, mayRenew = true): Promise<Response> {
  const session = getSession();
  const headers = new Headers(init.headers);
  if (session && !isSignIn(path)) headers.set("Authorization", `Bearer ${session.access}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new NetworkError();
  }
  if (res.status === 401 && session && !isSignIn(path)) {
    if (mayRenew && (await renewAccess())) return request(path, init, false);
    clearSession(); // the app shows the sign-in page again
  }
  return res;
}

function parseText(text: string, ok: boolean): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return ok ? text : null; // an HTML error page carries nothing useful for the user
  }
}

async function parse(res: Response): Promise<unknown> {
  return parseText(await res.text(), res.ok);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await request(path, init);
  const body = await parse(res);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export const get = <T>(path: string, params?: Params): Promise<T> => api<T>(withQuery(path, params));

export const send = <T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** How much of an upload has been sent, from 0 to 1 (CD-3.05 section 7: station links can be slow). */
export type OnProgress = (share: number) => void;

/** POST a form with XMLHttpRequest, which, unlike fetch, reports how much of the body has been sent. */
function postForm(path: string, body: FormData, onProgress?: OnProgress): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api${path}`);
    const session = getSession();
    if (session) xhr.setRequestHeader("Authorization", `Bearer ${session.access}`);
    if (onProgress) xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new NetworkError());
    xhr.onabort = () => reject(new NetworkError());
    xhr.send(body);
  });
}

/**
 * Upload a file as the form field "file". `onProgress` follows the sending of the file. As for every
 * other request, an expired token is renewed once, and the session ends when that fails.
 */
export async function upload<T>(path: string, file: File, params?: Params, onProgress?: OnProgress): Promise<T> {
  const target = withQuery(path, params);
  const body = new FormData();
  body.append("file", file);
  let reply = await postForm(target, body, onProgress);
  if (reply.status === 401 && getSession()) {
    if (await renewAccess()) reply = await postForm(target, body, onProgress);
    if (reply.status === 401) clearSession(); // the app shows the sign-in page again
  }
  const ok = reply.status >= 200 && reply.status < 300;
  const parsed = parseText(reply.text, ok);
  if (!ok) throw new ApiError(reply.status, parsed);
  return parsed as T;
}

/** Fetch a file with the access token and hand it to the browser to save. */
export async function download(path: string, params: Params | undefined, fallbackName: string): Promise<void> {
  const res = await request(withQuery(path, params), {});
  if (!res.ok) throw new ApiError(res.status, await parse(res));
  const blob = await res.blob();
  const named = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = named?.[1] ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
