"use client";

export type AppTheme = "light" | "dark" | "sepia";

export const THEME_STORAGE_KEY = "vt_theme_v1";

const VALID_THEMES: ReadonlyArray<AppTheme> = ["light", "dark", "sepia"];

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === "string" && VALID_THEMES.includes(value as AppTheme);
}

export function getSystemTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readStoredTheme(): AppTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isAppTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function resolveTheme(): AppTheme {
  return readStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
}

export function saveTheme(theme: AppTheme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}
