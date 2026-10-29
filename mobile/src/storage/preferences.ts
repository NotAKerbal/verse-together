// Reader preferences and small device settings, with the web's rules (src/lib/preferences.ts): text size 85–130%,
// serif or sans, text width, footnotes, how compared translations show, simple mode, and the selection menu's mark
// presets (normalized by the shared convex/annotationRules.ts). Stored under the web's own key names.
//
// Whose reader preferences show follows the study session (studySession.ts), as the web follows its account:
//  - signed out ("device"): this device's own preferences, under the web's `reader_prefs_v1`;
//  - signed in ("account"): that account's copy, cached on the device under a key naming the account and kept in
//    step with the account's readerPreferences row (features/settings/preferencesSync.ts). A change made here is
//    shown at once and marked as waiting until the account confirms it, so an older copy arriving later (a slow
//    first read, a reconnect) never replaces it. Until the account's own copy has been read on this device once,
//    nothing can be changed (readerPreferencesReady): a change then would be made over the defaults and sent over
//    the account's own choices, as the web waits for the account's copy before its settings can be changed;
//  - an account not yet known ("blocked"): this device's preferences are shown, and changes last only until the
//    account is known. They are never saved as the device's or as any account's.
// Signing in never copies this device's preferences into the account, and the account's never replace this
// device's, so signing out shows exactly what was there before. Simple mode stays on this device, as on the web.

import { useSyncExternalStore } from "react";
import { readMarkPresets, normalizeMarkPresets, type MarkPreset } from "../shared/web";
import { readJson, storage, writeJson } from "./kv";
import { getStudySession, subscribeStudySession } from "./studySession";

export type ReaderTextWidth = "comfortable" | "wide" | "full";
export type ComparisonView = "inline" | "sideBySide";

export type ReaderPreferences = {
  fontScale: number;
  fontFamily: "serif" | "sans";
  textWidth: ReaderTextWidth;
  /** Footnote markers in the reader (web default: shown). */
  showFootnotes: boolean;
  /** How compared Bible translations show beside the main text: under each verse, or in columns. */
  comparisonView: ComparisonView;
  markPresets: MarkPreset[];
};

export const PREFS_KEY = "reader_prefs_v1";
export const SIMPLE_MODE_KEY = "vt_simple_mode_v1";
/** One account's reader preferences on this device: `vt_account_reader_prefs_v1:<appUserId>`. */
export const ACCOUNT_PREFS_PREFIX = "vt_account_reader_prefs_v1:";
export const MIN_FONT_SCALE = 0.85;
export const MAX_FONT_SCALE = 1.3;

export function defaultPreferences(): ReaderPreferences {
  return { fontScale: 1, fontFamily: "serif", textWidth: "comfortable", showFootnotes: true, comparisonView: "inline", markPresets: readMarkPresets(null) };
}

export function normalizePreferences(input: unknown): ReaderPreferences {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const base = defaultPreferences();
  const rawScale = typeof value.fontScale === "number" && Number.isFinite(value.fontScale) ? value.fontScale : base.fontScale;
  return {
    fontScale: Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, rawScale)),
    fontFamily: value.fontFamily === "sans" ? "sans" : "serif",
    textWidth: value.textWidth === "wide" || value.textWidth === "full" ? value.textWidth : "comfortable",
    showFootnotes: typeof value.showFootnotes === "boolean" ? value.showFootnotes : base.showFootnotes,
    comparisonView: value.comparisonView === "sideBySide" ? "sideBySide" : "inline",
    markPresets: readMarkPresets(value as { markPresets?: unknown; quickMarks?: unknown }),
  };
}

/** The settings that change how scripture looks (saved by saveReaderPreferences, apart from the mark presets). */
export type ReaderAppearance = Pick<ReaderPreferences, "fontScale" | "fontFamily" | "textWidth" | "showFootnotes" | "comparisonView">;

export function appearanceOf(prefs: ReaderPreferences): ReaderAppearance {
  const { fontScale, fontFamily, textWidth, showFootnotes, comparisonView } = prefs;
  return { fontScale, fontFamily, textWidth, showFootnotes, comparisonView };
}

export function sameAppearance(a: ReaderPreferences, b: ReaderPreferences): boolean {
  return (
    Math.abs(a.fontScale - b.fontScale) < 0.0005 &&
    a.fontFamily === b.fontFamily &&
    a.textWidth === b.textWidth &&
    a.showFootnotes === b.showFootnotes &&
    a.comparisonView === b.comparisonView
  );
}

export function samePresets(a: MarkPreset[], b: MarkPreset[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** This device's record: fields the app added later are written only once changed, so older records keep their shape. */
function deviceRecord(prefs: ReaderPreferences) {
  const { showFootnotes, comparisonView, ...rest } = prefs;
  return { ...rest, ...(showFootnotes ? {} : { showFootnotes }), ...(comparisonView === "inline" ? {} : { comparisonView }) };
}

type Listener = () => void;

/** A tiny observable value persisted under one key, as JSON. */
function persisted<T>(key: string, read: (raw: unknown) => T, write: (value: T) => unknown = (value) => value) {
  let value: T | undefined;
  const listeners = new Set<Listener>();
  const get = () => {
    if (value === undefined) value = read(readJson<unknown>(key, null));
    return value;
  };
  return {
    get,
    set(next: T) {
      writeJson(key, write(next));
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

/**
 * A small device setting stored as a plain string (the web keeps these in localStorage as text): `parse` reads the
 * stored text (null when missing or unreadable), `serialize` writes it. `set` returns false, changing nothing, when
 * the device refuses the write.
 */
export function persistedText<T>(key: string, parse: (raw: string | null) => T, serialize: (value: T) => string) {
  let value: T | undefined;
  const listeners = new Set<Listener>();
  const get = () => {
    if (value === undefined) {
      let raw: string | null = null;
      try {
        raw = storage().getItem(key);
      } catch {
        raw = null;
      }
      value = parse(raw);
    }
    return value;
  };
  return {
    get,
    set(next: T): boolean {
      try {
        storage().setItem(key, serialize(next));
      } catch {
        return false;
      }
      value = parse(serialize(next));
      listeners.forEach((listener) => listener());
      return true;
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      value = undefined;
    },
  };
}

// ---- Whose reader preferences ----

/** One account's preferences on this device, and which of its changes the account hasn't confirmed yet. */
export type AccountPrefsRecord = {
  prefs: ReaderPreferences;
  /** Bumped by each change made here; `confirmed…` is the latest one the account has saved. */
  appearanceRev: number;
  confirmedAppearanceRev: number;
  presetsRev: number;
  confirmedPresetsRev: number;
  /** True once the account's own copy (or its having none) has been read. */
  fromServer: boolean;
};

function emptyAccountRecord(): AccountPrefsRecord {
  return { prefs: defaultPreferences(), appearanceRev: 0, confirmedAppearanceRev: 0, presetsRev: 0, confirmedPresetsRev: 0, fromServer: false };
}

function normalizeAccountRecord(raw: unknown): AccountPrefsRecord {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof AccountPrefsRecord, unknown>>;
  const count = (input: unknown) => (typeof input === "number" && Number.isInteger(input) && input >= 0 ? input : 0);
  const appearanceRev = count(value.appearanceRev);
  const presetsRev = count(value.presetsRev);
  return {
    prefs: normalizePreferences(value.prefs),
    appearanceRev,
    confirmedAppearanceRev: Math.min(appearanceRev, count(value.confirmedAppearanceRev)),
    presetsRev,
    confirmedPresetsRev: Math.min(presetsRev, count(value.confirmedPresetsRev)),
    fromServer: value.fromServer === true,
  };
}

const accountRecords = new Map<string, AccountPrefsRecord>();
const accountListeners = new Map<string, Set<Listener>>();

export function readAccountPrefs(owner: string): AccountPrefsRecord {
  let record = accountRecords.get(owner);
  if (!record) {
    record = normalizeAccountRecord(readJson<unknown>(ACCOUNT_PREFS_PREFIX + owner, null));
    accountRecords.set(owner, record);
  }
  return record;
}

/** Saves one account's record (throws when the device refuses) and tells that account's readers and its sync. */
export function writeAccountPrefs(owner: string, record: AccountPrefsRecord) {
  writeJson(ACCOUNT_PREFS_PREFIX + owner, record);
  accountRecords.set(owner, record);
  accountListeners.get(owner)?.forEach((listener) => listener());
  if (activeOwnerKey() === `account:${owner}`) notify();
}

/** Hears every change to one account's record on this device (a change made here, or the account's copy arriving). */
export function subscribeAccountPrefs(owner: string, listener: Listener): () => void {
  let set = accountListeners.get(owner);
  if (!set) accountListeners.set(owner, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

export function appearancePending(record: AccountPrefsRecord): boolean {
  return record.appearanceRev > record.confirmedAppearanceRev;
}

export function presetsPending(record: AccountPrefsRecord): boolean {
  return record.presetsRev > record.confirmedPresetsRev;
}

/**
 * Removes one account's preferences from this device (signing out, or deleting the account). With `keepPending`, a
 * record holding changes the account hasn't received yet stays, for that account only.
 */
export function purgeAccountPrefs(owner: string, { keepPending = false }: { keepPending?: boolean } = {}) {
  const record = readAccountPrefs(owner);
  if (keepPending && (appearancePending(record) || presetsPending(record))) return;
  accountRecords.delete(owner);
  try {
    storage().removeItem(ACCOUNT_PREFS_PREFIX + owner);
  } catch {}
}

const deviceReader = persisted(PREFS_KEY, normalizePreferences, deviceRecord);
/** Changes made while the account isn't known yet: shown, never saved. */
let transient: ReaderPreferences | null = null;
const readerListeners = new Set<Listener>();
let watchingSession = false;
let lastOwnerKey: string | null = null;

function activeOwnerKey(): string {
  const session = getStudySession();
  return session.mode === "account" ? `account:${session.owner}` : session.mode;
}

function notify() {
  readerListeners.forEach((listener) => listener());
}

function watchSession() {
  if (watchingSession) return;
  watchingSession = true;
  lastOwnerKey = activeOwnerKey();
  subscribeStudySession(() => {
    const next = activeOwnerKey();
    if (next === lastOwnerKey) return;
    lastOwnerKey = next;
    transient = null;
    notify();
  });
  deviceReader.subscribe(() => {
    if (getStudySession().mode === "device") notify();
  });
}

/** Where a reader-preference change is saved now. */
export type PreferencesOwner = { kind: "device" } | { kind: "account"; owner: string } | { kind: "pending" };

export function preferencesOwner(): PreferencesOwner {
  const session = getStudySession();
  if (session.mode === "account") return { kind: "account", owner: session.owner };
  return session.mode === "device" ? { kind: "device" } : { kind: "pending" };
}

/** The reader preferences that show now, and their one way to change. */
export const readerPreferences = {
  get(): ReaderPreferences {
    watchSession();
    const owner = preferencesOwner();
    if (owner.kind === "account") return readAccountPrefs(owner.owner).prefs;
    if (owner.kind === "pending") return transient ?? deviceReader.get();
    return deviceReader.get();
  },
  /**
   * Saves `next` for whoever owns the preferences now. Returns false, changing nothing, while an account's own copy
   * hasn't been read yet (readerPreferencesReady). Throws, changing nothing, when the device refuses the write.
   */
  set(next: ReaderPreferences): boolean {
    watchSession();
    const owner = preferencesOwner();
    if (owner.kind === "device") {
      deviceReader.set(next);
      return true;
    }
    if (owner.kind === "pending") {
      transient = next;
      notify();
      return true;
    }
    const current = readAccountPrefs(owner.owner);
    // Not read yet: what shows is the defaults, and saving them would replace the account's own choices.
    if (!current.fromServer) return false;
    const appearanceChanged = !sameAppearance(current.prefs, next);
    const presetsChanged = !samePresets(current.prefs.markPresets, next.markPresets);
    if (!appearanceChanged && !presetsChanged) return true;
    writeAccountPrefs(owner.owner, {
      ...current,
      prefs: next,
      appearanceRev: current.appearanceRev + (appearanceChanged ? 1 : 0),
      presetsRev: current.presetsRev + (presetsChanged ? 1 : 0),
    });
    return true;
  },
  subscribe(listener: Listener) {
    watchSession();
    readerListeners.add(listener);
    return () => {
      readerListeners.delete(listener);
    };
  },
  /** Forget every cached value (tests, or after storage was replaced). */
  reset() {
    deviceReader.reset();
    accountRecords.clear();
    transient = null;
  },
};

export const simpleMode = persisted(SIMPLE_MODE_KEY, (raw) => raw === true || raw === "1" || raw === 1);

/**
 * Whether the reader preferences shown now can be changed: always on this device (and, unsaved, while the account is
 * checked); for an account, once its own copy (or its having none) has been read on this device. Until then the
 * settings that save to the account should be disabled, saying the account's settings are loading.
 */
export function readerPreferencesReady(): boolean {
  const owner = preferencesOwner();
  return owner.kind !== "account" || readAccountPrefs(owner.owner).fromServer;
}

export function useReaderPreferencesReady(): boolean {
  return useSyncExternalStore(readerPreferences.subscribe, readerPreferencesReady, readerPreferencesReady);
}

/** The preferences shown now, and a setter returning false (changing nothing) while they aren't ready. */
export function useReaderPreferences(): [ReaderPreferences, (next: ReaderPreferences) => boolean] {
  const prefs = useSyncExternalStore(readerPreferences.subscribe, readerPreferences.get, readerPreferences.get);
  return [prefs, (next) => readerPreferences.set({ ...next, markPresets: normalizeMarkPresets(next.markPresets) ?? [] })];
}

function ownerSnapshotKey() {
  return activeOwnerKey();
}

/** Where the reader preferences shown now are saved: this device, an account, or nowhere yet (account being checked). */
export function usePreferencesOwner(): PreferencesOwner {
  useSyncExternalStore(readerPreferences.subscribe, ownerSnapshotKey, ownerSnapshotKey);
  return preferencesOwner();
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
