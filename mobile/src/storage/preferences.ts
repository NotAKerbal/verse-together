// Reader preferences and small device settings, with the web's rules (src/lib/preferences.ts): text size 85–130%,
// serif or sans, text width, simple mode, and the selection menu's mark presets (normalized by the shared
// convex/annotationRules.ts). Stored under the web's own key names.

import { useSyncExternalStore } from "react";
import { readMarkPresets, normalizeMarkPresets, type MarkPreset } from "../shared/web";
import { readJson, writeJson } from "./kv";

export type ReaderTextWidth = "comfortable" | "wide" | "full";

export type ReaderPreferences = {
  fontScale: number;
  fontFamily: "serif" | "sans";
  textWidth: ReaderTextWidth;
  markPresets: MarkPreset[];
};

export const PREFS_KEY = "reader_prefs_v1";
export const SIMPLE_MODE_KEY = "vt_simple_mode_v1";
export const MIN_FONT_SCALE = 0.85;
export const MAX_FONT_SCALE = 1.3;

export function defaultPreferences(): ReaderPreferences {
  return { fontScale: 1, fontFamily: "serif", textWidth: "comfortable", markPresets: readMarkPresets(null) };
}

export function normalizePreferences(input: unknown): ReaderPreferences {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const base = defaultPreferences();
  const rawScale = typeof value.fontScale === "number" && Number.isFinite(value.fontScale) ? value.fontScale : base.fontScale;
  return {
    fontScale: Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, rawScale)),
    fontFamily: value.fontFamily === "sans" ? "sans" : "serif",
    textWidth: value.textWidth === "wide" || value.textWidth === "full" ? value.textWidth : "comfortable",
    markPresets: readMarkPresets(value as { markPresets?: unknown; quickMarks?: unknown }),
  };
}

type Listener = () => void;

/** A tiny observable value persisted under one key. */
function persisted<T>(key: string, read: (raw: unknown) => T) {
  let value: T | undefined;
  const listeners = new Set<Listener>();
  const get = () => {
    if (value === undefined) value = read(readJson<unknown>(key, null));
    return value;
  };
  return {
    get,
    set(next: T) {
      writeJson(key, next);
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Forget the cached value (tests, or after storage was replaced). */
    reset() {
      value = undefined;
    },
  };
}

export const readerPreferences = persisted(PREFS_KEY, normalizePreferences);
export const simpleMode = persisted(SIMPLE_MODE_KEY, (raw) => raw === true || raw === "1" || raw === 1);

export function useReaderPreferences(): [ReaderPreferences, (next: ReaderPreferences) => void] {
  const prefs = useSyncExternalStore(readerPreferences.subscribe, readerPreferences.get, readerPreferences.get);
  return [prefs, (next) => readerPreferences.set({ ...next, markPresets: normalizeMarkPresets(next.markPresets) ?? [] })];
}

export function useSimpleMode(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(simpleMode.subscribe, simpleMode.get, simpleMode.get);
  return [value, (next) => simpleMode.set(next)];
}

// ---- Last reading position (the Library's Continue reading card) ----

export type ReadingPosition = { volume: string; book: string; chapter: number; at: string };
export const LAST_POSITION_KEY = "vt_last_position_v1";

export const lastPosition = persisted<ReadingPosition | null>(LAST_POSITION_KEY, (raw) => {
  const value = raw as Partial<ReadingPosition> | null;
  return value && typeof value.volume === "string" && typeof value.book === "string" && Number.isInteger(value.chapter)
    ? (value as ReadingPosition)
    : null;
});

export function useLastPosition(): ReadingPosition | null {
  return useSyncExternalStore(lastPosition.subscribe, lastPosition.get, lastPosition.get);
}
