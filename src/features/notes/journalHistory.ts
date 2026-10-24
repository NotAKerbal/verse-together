// The Notes page's place in the browser's history. Opening a note from the day's chooser adds one history entry
// at the same URL, so the browser's Back closes the note to that chooser and Forward opens it again. Switching
// notes while one is open rewrites that entry instead of stacking more, so one Back always returns to the
// chooser. Closing a note on the page (its X, a back control, choosing another day) steps back off its entry
// too, so the next Back leaves the page as usual. Arriving on the page never adds an entry.
//
// An entry's state keeps every key already there (Next.js keeps its router state in history.state, other
// features their own) and adds only which note and day, under one key; never the note's content. No DOM here:
// the page hands in a HistoryPort (window.history, or a fake in tests) and listens for popstate itself.

import { dateFromKey, localDateKey } from "./journal";
import type { JournalView } from "./journalView";

export const JOURNAL_HISTORY_KEY = "notesJournalView";

export type JournalHistoryEntry = {
  noteId: string;
  /** The note's journal day. */
  date: string;
  /** The chooser the note was opened from, shown again when Back leaves the entry. */
  back: { stage: "calendar" | "day"; date: string };
};

/** The parts of window.history this uses. */
export type HistoryPort = {
  readonly state: unknown;
  pushState(state: unknown): void;
  replaceState(state: unknown): void;
  back(): void;
};

export type JournalHistoryHandlers = {
  /** Put this view on screen. */
  show(view: JournalView): void;
  /** History reopened this note: make it the provider's active note, if it isn't and still exists. */
  select(noteId: string): void;
};

export type JournalHistoryTimers = {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

/** How long a step back off a closed note's entry may take before it is treated as done. */
export const SETTLE_MS = 1000;

const NOTE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && localDateKey(dateFromKey(value)) === value;
}

/** `state` with the entry added under its key; every other key is kept as it is. */
export function withJournalEntry(state: unknown, entry: JournalHistoryEntry): Record<string, unknown> {
  const base = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  const { noteId, date, back } = entry;
  return { ...base, [JOURNAL_HISTORY_KEY]: { noteId, date, back: { stage: back.stage, date: back.date } } };
}

/** The note a history entry holds, checked again (an entry can outlive a deploy, or be anything). */
export function journalEntryFromState(state: unknown): JournalHistoryEntry | null {
  if (!state || typeof state !== "object" || !Object.hasOwn(state, JOURNAL_HISTORY_KEY)) return null;
  const value = (state as Record<string, unknown>)[JOURNAL_HISTORY_KEY];
  if (!value || typeof value !== "object") return null;
  const { noteId, date, back } = value as Record<string, unknown>;
  if (typeof noteId !== "string" || !NOTE_ID.test(noteId) || !isDateKey(date)) return null;
  if (!back || typeof back !== "object") return null;
  const { stage, date: backDate } = back as Record<string, unknown>;
  if ((stage !== "calendar" && stage !== "day") || !isDateKey(backDate)) return null;
  return { noteId, date, back: { stage, date: backDate } };
}

const noteView = (entry: JournalHistoryEntry): JournalView => ({ stage: "note", date: entry.date, noteId: entry.noteId });

/** Where Back from a note opened from `view` returns: that chooser, or the open note's day. */
function backFrom(view: JournalView): JournalHistoryEntry["back"] {
  return view.stage === "note" ? { stage: "day", date: view.date } : { stage: view.stage, date: view.date };
}

const defaultTimers: JournalHistoryTimers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class JournalHistory {
  private readonly port: HistoryPort;
  private handlers: JournalHistoryHandlers;
  private readonly timers: JournalHistoryTimers;
  /** The note entry the page is on, as last written or arrived at; null off one. */
  private current: JournalHistoryEntry | null = null;
  /** A step back off a note's entry, taken here and not yet landed, and what waits for it. */
  private settling: { then: (() => void) | null; timer: unknown } | null = null;

  constructor(port: HistoryPort, handlers: JournalHistoryHandlers, timers: JournalHistoryTimers = defaultTimers) {
    this.port = port;
    this.handlers = handlers;
    this.timers = timers;
  }

  /** The page's current handlers (they close over its latest render). */
  setHandlers(handlers: JournalHistoryHandlers) {
    this.handlers = handlers;
  }

  /**
   * A person moves the page from `from` (the view on screen) to `to`. A note is shown at once and history
   * follows. Leaving a note's entry is shown once the step back off it lands, exactly as the browser's Back
   * would be: the browser restores the chooser's scroll first, then the page moves (a phone starts the new
   * screen at its top), rather than the page moving first and the browser's restore scrolling it again.
   */
  go(from: JournalView, to: JournalView) {
    const show = () => this.handlers.show(to);
    if (to.stage === "note") {
      show();
      // The note already open (clicked again, or its day re-chosen): nothing to record.
      if (from.stage === "note" && from.noteId === to.noteId && from.date === to.date) return;
      const write = () => this.write(from, to);
      // A note just closed here is still stepping back off its entry: record this one once that has landed.
      if (this.settling) this.settling.then = write;
      else write();
      return;
    }
    if (this.settling) {
      this.settling.then = show;
      return;
    }
    this.current = null;
    // Off the note's entry, so the next Back leaves the page. Without one (arrived with a note open), the
    // page simply stays where it is.
    if (journalEntryFromState(this.port.state)) {
      this.settling = { then: show, timer: this.timers.set(() => this.settle(), SETTLE_MS) };
      this.port.back();
    } else {
      show();
    }
  }

  /** The browser's Back or Forward (or a step back taken here) has landed. */
  popState() {
    if (this.settling) {
      this.settle();
      return;
    }
    const entry = journalEntryFromState(this.port.state);
    if (entry) {
      this.current = entry;
      this.handlers.show(noteView(entry));
      this.handlers.select(entry.noteId);
      return;
    }
    const left = this.current;
    // Not a step this page made (another feature's entry, or a hash): the view stays.
    if (!left) return;
    this.current = null;
    this.handlers.show({ stage: left.back.stage, date: left.back.date, noteId: null });
  }

  /** On arrival (a reload, Back or Forward into the page, a remount): reopen the note the entry holds. */
  restore() {
    if (this.settling) return;
    const entry = journalEntryFromState(this.port.state);
    this.current = entry;
    if (!entry) return;
    this.handlers.show(noteView(entry));
    this.handlers.select(entry.noteId);
  }

  dispose() {
    if (this.settling) this.timers.clear(this.settling.timer);
    this.settling = null;
  }

  private write(from: JournalView, to: JournalView & { stage: "note" }) {
    const state = this.port.state;
    const on = journalEntryFromState(state);
    if (on && on.noteId === to.noteId && on.date === to.date) {
      this.current = on;
      return;
    }
    // One note entry at most: an open note's entry is rewritten, keeping where Back returns.
    const entry: JournalHistoryEntry = { noteId: to.noteId, date: to.date, back: on ? on.back : backFrom(from) };
    if (on) this.port.replaceState(withJournalEntry(state, entry));
    else this.port.pushState(withJournalEntry(state, entry));
    this.current = entry;
  }

  private settle() {
    const settling = this.settling;
    if (!settling) return;
    this.settling = null;
    this.timers.clear(settling.timer);
    settling.then?.();
  }
}
