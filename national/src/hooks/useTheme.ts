/** Light and dark theme (CD-3.05 section 3). index.html applies the saved theme before first paint. */
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const KEY = "climate.theme";
const listeners = new Set<() => void>();

const read = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable: the choice lasts for this page load */
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** The current theme. Components that draw with theme colours (charts) re-render when it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, read);
}
