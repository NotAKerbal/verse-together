// Keeps one signed-in account's reader preferences on this device (storage/preferences.ts) in step with the
// account, through the website's own functions (convex/preferences.ts): getReaderPreferences is subscribed while the
// session is verified, and changes made here are sent with saveReaderPreferences (text size, typeface, width,
// footnotes, comparison view) and saveMarkPresets (the quick marks), one at a time and newest last, as the web does.
//
// A change waits on the device, marked by revision, until the account confirms it: an account copy that arrives
// meanwhile (a slow first read, a reconnect, another device) fills in only what has no change waiting, so a fresh
// edit is never replaced by an older copy. Waiting changes are sent again after reconnecting, and after a failure on
// a growing delay. Nothing of this device's own (signed-out) preferences is ever sent: an account with no saved
// preferences starts from the defaults, as a new account does on the web. Nothing at all is sent before the
// account's own copy has been read on this device, so the defaults shown until then never replace its choices.
//
// One engine per verified session and Convex client (AccountProvider starts it beside StudySync); it is disposed with
// them, and a reply arriving afterwards changes nothing.

import { makeFunctionReference } from "convex/server";
import { useSyncExternalStore } from "react";
import type { SyncClient } from "../../account/studySync";
import type { MarkPreset } from "../../shared/web";
import {
  appearanceOf,
  appearancePending,
  defaultPreferences,
  normalizePreferences,
  presetsPending,
  readAccountPrefs,
  sameAppearance,
  samePresets,
  subscribeAccountPrefs,
  writeAccountPrefs,
  type AccountPrefsRecord,
  type ReaderAppearance,
  type ReaderPreferences,
} from "../../storage/preferences";

type ServerPreferences = {
  showFootnotes: boolean;
  fontScale: number;
  fontFamily: "serif" | "sans";
  comparisonView: "inline" | "sideBySide";
  textWidth?: "comfortable" | "wide" | "full";
  markPresets?: MarkPreset[];
};

/** The existing public functions (convex/preferences.ts); each checks its own caller. */
export const preferencesApi = {
  getReaderPreferences: makeFunctionReference<"query", Record<string, never>, ServerPreferences | null>("preferences:getReaderPreferences"),
  saveReaderPreferences: makeFunctionReference<"mutation", ReaderAppearance, { ok: boolean }>("preferences:saveReaderPreferences"),
  saveMarkPresets: makeFunctionReference<"mutation", { presets: MarkPreset[]; readerDefaults?: ReaderAppearance }, { markPresets: MarkPreset[] }>(
    "preferences:saveMarkPresets",
  ),
};

export type PreferencesSyncState = "idle" | "saving" | "waiting" | "error";

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

/**
 * Fills in the account's copy wherever no change made here is waiting. `value` null: the account has no saved
 * preferences, so the record keeps what it has (the defaults, or changes still to be sent).
 *
 * A change saved before the account's copy was ever read (only by earlier versions of the app, which allowed it)
 * was made over the defaults: on the first read it keeps only what it changed from the defaults, field by field, and
 * takes the account's own value for the rest, so the defaults it was made over are never sent as choices.
 */
export function applyServerPreferences(owner: string, value: unknown) {
  const stored = readAccountPrefs(owner);
  let record = stored;
  let prefs = record.prefs;
  if (value && typeof value === "object") {
    const server = normalizePreferences(value);
    if (!record.fromServer) record = mergeOverDefaults(record, server);
    prefs = record.prefs;
    if (!appearancePending(record) && !sameAppearance(prefs, server)) prefs = { ...prefs, ...appearanceOf(server) };
    if (!presetsPending(record) && !samePresets(prefs.markPresets, server.markPresets)) prefs = { ...prefs, markPresets: server.markPresets };
  }
  if (record === stored && prefs === stored.prefs && stored.fromServer) return;
  writeAccountPrefs(owner, { ...record, prefs, fromServer: true });
}

/** A record's waiting changes made over the defaults, laid over the account's copy (see applyServerPreferences). */
function mergeOverDefaults(record: AccountPrefsRecord, server: ReaderPreferences): AccountPrefsRecord {
  const base = defaultPreferences();
  let { prefs, confirmedAppearanceRev, confirmedPresetsRev } = record;
  if (appearancePending(record)) {
    const appearance = { ...appearanceOf(server) } as Record<keyof ReaderAppearance, unknown>;
    for (const key of Object.keys(appearance) as Array<keyof ReaderAppearance>) {
      if (!sameAppearance({ ...base, [key]: prefs[key] }, base)) appearance[key] = prefs[key];
    }
    prefs = { ...prefs, ...(appearance as ReaderAppearance) };
    // Nothing changed from the defaults after all: nothing to send.
    if (sameAppearance(prefs, server)) confirmedAppearanceRev = record.appearanceRev;
  }
  // A list is one choice: an edited list stays waiting; one still the defaults is the account's.
  if (presetsPending(record) && samePresets(prefs.markPresets, base.markPresets)) confirmedPresetsRev = record.presetsRev;
  return { ...record, prefs, confirmedAppearanceRev, confirmedPresetsRev };
}

/** Records that the account saved the change at `rev` (a later one still waits). */
function confirm(owner: string, group: "appearance" | "presets", rev: number, markPresets?: MarkPreset[]) {
  const record = readAccountPrefs(owner);
  if (group === "appearance") {
    if (rev > record.confirmedAppearanceRev) writeAccountPrefs(owner, { ...record, confirmedAppearanceRev: rev });
    return;
  }
  if (rev <= record.confirmedPresetsRev) return;
  // The account's normalized list, unless a newer change is waiting.
  const prefs = markPresets && record.presetsRev === rev ? { ...record.prefs, markPresets: normalizePreferences({ markPresets }).markPresets } : record.prefs;
  writeAccountPrefs(owner, { ...record, prefs, confirmedPresetsRev: rev });
}

export class PreferencesSync {
  private disposed = false;
  private running = false;
  private stops: Array<() => void> = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_MIN_MS;
  private state: PreferencesSyncState = "idle";
  private listeners = new Set<() => void>();

  constructor(
    readonly owner: string,
    private client: SyncClient,
  ) {}

  start(): this {
    this.stops.push(
      this.client.watch(preferencesApi.getReaderPreferences, {}, (value) => {
        if (this.disposed) return;
        try {
          applyServerPreferences(this.owner, value);
        } catch {
          // The device refused the write: the account's copy arrives again with its next change or reconnect.
        }
      }),
      subscribeAccountPrefs(this.owner, () => this.kick()),
      this.client.onConnectionChange(() => this.kick()),
    );
    this.kick();
    return this;
  }

  dispose() {
    this.disposed = true;
    this.stops.forEach((stop) => stop());
    this.stops = [];
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.listeners.clear();
  }

  /** A one-off call for this account through the session's client (Settings → Feedback); rejects offline. */
  mutation<T>(ref: unknown, args: Record<string, unknown>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error("Your account changed. Try again."));
    if (!this.client.connected()) return Promise.reject(new Error("You're offline. Connect to the internet and try again."));
    return this.client.mutation(ref, args) as Promise<T>;
  }

  getState(): PreferencesSyncState {
    return this.state;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(next: PreferencesSyncState) {
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  /** Sends what's waiting, if anything and if connected. */
  kick() {
    if (this.disposed || this.running || this.retryTimer) return;
    const record = readAccountPrefs(this.owner);
    if (!appearancePending(record) && !presetsPending(record)) return this.setState("idle");
    // Sent once the account's copy has been read and laid under them (applyServerPreferences), never over defaults.
    if (!record.fromServer || !this.client.connected()) return this.setState("waiting");
    void this.run();
  }

  private async run() {
    this.running = true;
    this.setState("saving");
    try {
      // One at a time: a later change always goes after the one before it.
      for (;;) {
        if (this.disposed) return;
        const record = readAccountPrefs(this.owner);
        if (!record.fromServer) break;
        if (appearancePending(record)) {
          const rev = record.appearanceRev;
          await this.client.mutation(preferencesApi.saveReaderPreferences, appearanceOf(record.prefs));
          if (this.disposed) return;
          confirm(this.owner, "appearance", rev);
          continue;
        }
        if (presetsPending(record)) {
          const rev = record.presetsRev;
          // Only used if the account has no preferences row yet: the account's own appearance, never this device's.
          const result = (await this.client.mutation(preferencesApi.saveMarkPresets, {
            presets: record.prefs.markPresets,
            readerDefaults: appearanceOf(record.prefs),
          })) as { markPresets?: MarkPreset[] } | null;
          if (this.disposed) return;
          confirm(this.owner, "presets", rev, Array.isArray(result?.markPresets) ? result.markPresets : undefined);
          continue;
        }
        break;
      }
      this.retryDelay = RETRY_MIN_MS;
      this.setState("idle");
    } catch {
      if (this.disposed) return;
      // Kept on the device; tried again on reconnecting, or after a growing delay.
      this.setState(this.client.connected() ? "error" : "waiting");
      const delay = this.retryDelay;
      this.retryDelay = Math.min(RETRY_MAX_MS, this.retryDelay * 2);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.kick();
      }, delay);
    } finally {
      this.running = false;
    }
  }
}

// ---- The running engine, for the screens ----

let active: PreferencesSync | null = null;
const activeListeners = new Set<() => void>();
let unsubscribeActive: (() => void) | null = null;

function notifyActive() {
  activeListeners.forEach((listener) => listener());
}

/**
 * Starts keeping `owner`'s preferences in step through `client` (convexSyncClient of the session's Convex client).
 * Returns the stop function; call it when the session or its client ends.
 */
export function startPreferencesSync(owner: string, client: SyncClient): () => void {
  active?.dispose();
  unsubscribeActive?.();
  const engine = new PreferencesSync(owner, client);
  active = engine;
  unsubscribeActive = engine.subscribe(notifyActive);
  engine.start();
  notifyActive();
  return () => {
    engine.dispose();
    if (active === engine) {
      active = null;
      unsubscribeActive?.();
      unsubscribeActive = null;
      notifyActive();
    }
  };
}

/** The engine keeping `owner`'s preferences in step this run (and so a connection to that account), or null. */
export function activePreferencesSync(owner: string): PreferencesSync | null {
  return active && active.owner === owner ? active : null;
}

function snapshot(): string {
  return active ? `${active.owner}:${active.getState()}` : "none";
}

function subscribe(listener: () => void) {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
}

/** How `owner`'s changes are getting to the account: null when nothing is keeping them in step this run. */
export function usePreferencesSyncState(owner: string | null): PreferencesSyncState | null {
  const key = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!owner || key === "none" || !key.startsWith(`${owner}:`)) return null;
  return key.slice(owner.length + 1) as PreferencesSyncState;
}
