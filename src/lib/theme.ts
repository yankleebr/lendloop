/**
 * Theme store, per browser via localStorage. The user picks Light or Dark; until they do
 * ("system"), the OS theme is followed live. The resolved theme is written to `<html data-theme>`;
 * THEME_SCRIPT does the same before first paint.
 */

export const THEME_STORAGE_KEY = "lendloop-theme";

export type ResolvedTheme = "light" | "dark";
/** "system" = no explicit choice stored yet. */
type ThemePreference = "system" | ResolvedTheme;

const DARK_QUERY = "(prefers-color-scheme: dark)";
const CHANGE_EVENT = "lendloop-theme-change";

export function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** The theme currently painted (what the inline script or applyTheme last wrote). */
export function readAppliedTheme(): ResolvedTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(preference: ThemePreference): void {
  document.documentElement.dataset.theme = resolveTheme(preference);
}

export function setTheme(theme: ResolvedTheme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice still applies to this page view.
  }
  applyTheme(theme);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Notifies on own changes, other tabs (storage event) and OS theme changes (until a choice is stored). */
export function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  const reapply = () => {
    applyTheme(readPreference());
    onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) reapply();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", reapply);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", reapply);
  };
}

/** Runs in <head> before first paint; mirrors readPreference + applyTheme without imports. */
export const THEME_SCRIPT = `(function(){var p="system";try{p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})||"system"}catch(e){}if(p!=="light"&&p!=="dark")p="system";try{var d=p==="dark"||(p==="system"&&window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})();`;
