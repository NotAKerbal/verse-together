import { describe, expect, test } from "vitest";
import {
  JOURNAL_HISTORY_KEY,
  JournalHistory,
  SETTLE_MS,
  journalEntryFromState,
  withJournalEntry,
  type HistoryPort,
  type JournalHistoryEntry,
} from "../src/features/notes/journalHistory";
import { nextJournalView, resolveJournalView, type JournalView, type JournalViewAction, type JournalViewState } from "../src/features/notes/journalView";

const today = "2026-10-21";
/** What Next.js (and another feature) keep in history.state; every one must survive untouched. */
const routerState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["", { children: ["notes", {}] }], otherFeature: { kept: 1 } };

/**
 * A browser's session history for one tab: entry 0 is the page before /notes, entry 1 is /notes itself.
 * history.back() is asynchronous, as in browsers: its popstate arrives when the test calls `land()`.
 */
class FakeBrowser implements HistoryPort {
  entries: unknown[] = [{ page: "previous" }, routerState];
  index = 1;
  pending = 0;
  calls: string[] = [];
  listener: (() => void) | null = null;
  get state() {
    return this.entries[this.index];
  }
  pushState(state: unknown) {
    this.calls.push("push");
    this.entries = [...this.entries.slice(0, this.index + 1), state];
    this.index += 1;
  }
  replaceState(state: unknown) {
    this.calls.push("replace");
    this.entries[this.index] = state;
  }
  back() {
    this.calls.push("back");
    this.pending -= 1;
  }
  /** Delivers the traversals history.back() asked for. */
  land() {
    const delta = this.pending;
    this.pending = 0;
    if (delta) this.traverse(delta);
  }
  /** The browser's own Back (-1) and Forward (+1) buttons. */
  traverse(delta: number) {
    this.index = Math.max(0, Math.min(this.entries.length - 1, this.index + delta));
    if (this.index >= 1) this.listener?.();
  }
  get leftPage() {
    return this.index === 0;
  }
}

class FakeTimers {
  handles = new Map<number, () => void>();
  next = 1;
  set = (callback: () => void, ms: number) => {
    expect(ms).toBe(SETTLE_MS);
    const handle = this.next++;
    this.handles.set(handle, callback);
    return handle;
  };
  clear = (handle: unknown) => {
    this.handles.delete(handle as number);
  };
  fire() {
    const due = [...this.handles.values()];
    this.handles.clear();
    for (const callback of due) callback();
  }
}

/** The Notes page as the adapter wires it: view state resolved against the provider's active note. */
function page(options: { active?: string | null; notes?: Record<string, string> } = {}) {
  const notes = options.notes ?? { a: today, b: today, c: "2026-10-18" };
  const browser = new FakeBrowser();
  const timers = new FakeTimers();
  let state: JournalViewState = null;
  let active = options.active ?? null;
  const selected: string[] = [];
  const view = () => resolveJournalView(state, { today, activeNoteId: active });
  const history = new JournalHistory(
    browser,
    {
      show: (next) => {
        state = next;
      },
      select: (noteId) => {
        if (noteId === active || !(noteId in notes)) return;
        selected.push(noteId);
        active = noteId;
      },
    },
    timers
  );
  browser.listener = () => history.popState();
  const act = (action: JournalViewAction) => history.go(view(), nextJournalView(view(), action));
  const open = (noteId: string) => {
    act({ type: "openNote", noteId, date: notes[noteId] });
    active = noteId;
  };
  return { browser, timers, history, view, act, open, selected, setActive: (id: string | null) => (active = id) };
}

const day = (date: string): JournalView => ({ stage: "day", date, noteId: null });
const noteAt = (noteId: string, date: string): JournalView => ({ stage: "note", date, noteId });

describe("Notes history entries", () => {
  test("an entry adds only the note and day under its own key, and every other key is kept", () => {
    const entry: JournalHistoryEntry = { noteId: "a", date: today, back: { stage: "day", date: today } };
    const state = withJournalEntry(routerState, entry);
    expect(state).toEqual({ ...routerState, [JOURNAL_HISTORY_KEY]: entry });
    expect(state.__PRIVATE_NEXTJS_INTERNALS_TREE).toBe(routerState.__PRIVATE_NEXTJS_INTERNALS_TREE);
    expect(journalEntryFromState(state)).toEqual(entry);
    expect(withJournalEntry(null, entry)).toEqual({ [JOURNAL_HISTORY_KEY]: entry });
  });

  test("anything that isn't a well-formed entry is ignored, never trusted", () => {
    const good = { noteId: "a", date: today, back: { stage: "day", date: today } };
    for (const state of [
      null,
      undefined,
      "notes",
      routerState,
      { [JOURNAL_HISTORY_KEY]: null },
      { [JOURNAL_HISTORY_KEY]: { ...good, noteId: 7 } },
      { [JOURNAL_HISTORY_KEY]: { ...good, noteId: "" } },
      { [JOURNAL_HISTORY_KEY]: { ...good, noteId: "../x" } },
      { [JOURNAL_HISTORY_KEY]: { ...good, noteId: "x".repeat(129) } },
      { [JOURNAL_HISTORY_KEY]: { ...good, date: "2026-02-30" } },
      { [JOURNAL_HISTORY_KEY]: { ...good, date: "21/10/2026" } },
      { [JOURNAL_HISTORY_KEY]: { ...good, back: null } },
      { [JOURNAL_HISTORY_KEY]: { ...good, back: { stage: "note", date: today } } },
      { [JOURNAL_HISTORY_KEY]: { ...good, back: { stage: "day", date: "yesterday" } } },
      Object.create({ [JOURNAL_HISTORY_KEY]: good }),
    ]) {
      expect(journalEntryFromState(state)).toBeNull();
    }
    // Only what the entry needs is read back; extra fields (say, content) are dropped.
    expect(journalEntryFromState({ [JOURNAL_HISTORY_KEY]: { ...good, markdown: "secret" } })).toEqual(good);
  });
});

describe("Back and Forward on the Notes page", () => {
  test("opening a note from the day's chooser adds one entry; Back closes it to that day, Forward reopens it", () => {
    const { browser, view, act, open, selected, setActive } = page();
    act({ type: "selectDate", date: "2026-10-18" });
    expect(browser.calls).toEqual([]);
    open("c");
    expect(browser.calls).toEqual(["push"]);
    expect(browser.state).toEqual({ ...routerState, [JOURNAL_HISTORY_KEY]: { noteId: "c", date: "2026-10-18", back: { stage: "day", date: "2026-10-18" } } });
    expect(view()).toEqual(noteAt("c", "2026-10-18"));

    browser.traverse(-1);
    expect(browser.leftPage).toBe(false);
    expect(browser.state).toBe(routerState);
    expect(view()).toEqual(day("2026-10-18"));

    // The provider moved on meanwhile (say, the reader's sidebar): Forward opens the entry's note again.
    setActive("a");
    browser.traverse(1);
    expect(selected).toEqual(["c"]);
    expect(view()).toEqual(noteAt("c", "2026-10-18"));

    browser.traverse(-1);
    browser.traverse(-1);
    expect(browser.leftPage).toBe(true);
  });

  test("switching notes rewrites the entry, so one Back returns to the chooser; the same note adds nothing", () => {
    const { browser, view, open } = page();
    open("a");
    open("a");
    open("b");
    open("b");
    expect(browser.calls).toEqual(["push", "replace"]);
    expect(browser.entries).toHaveLength(3);
    expect(journalEntryFromState(browser.state)).toEqual({ noteId: "b", date: today, back: { stage: "calendar", date: today } });
    browser.traverse(-1);
    expect(view()).toEqual({ stage: "calendar", date: today, noteId: null });
    browser.traverse(-1);
    expect(browser.leftPage).toBe(true);
  });

  test("closing on the page steps back off the note's entry, so the next Back leaves the page", () => {
    for (const close of [{ type: "closeNote" }, { type: "showCalendar" }, { type: "selectDate", date: "2026-10-18" }] as const) {
      const { browser, view, act, open } = page();
      act({ type: "selectDate", date: today });
      open("a");
      act(close);
      expect(browser.calls).toEqual(["push", "back"]);
      // Shown as the step lands, in the same order as the browser's own Back.
      expect(view()).toEqual(noteAt("a", today));
      browser.land();
      expect(browser.state).toBe(routerState);
      expect(view()).toEqual(nextJournalView(noteAt("a", today), close));
      browser.traverse(-1);
      expect(browser.leftPage).toBe(true);
    }
  });

  test("re-choosing the open note's own day keeps it open and its entry", () => {
    const { browser, view, act, open } = page();
    open("a");
    act({ type: "selectDate", date: today });
    expect(view()).toEqual(noteAt("a", today));
    expect(browser.calls).toEqual(["push"]);
  });

  test("arriving with an active note shows today's calendar, selects nothing and adds no entry", () => {
    const { browser, history, view, selected, setActive } = page({ active: "c" });
    history.restore();
    expect(view()).toEqual({ stage: "calendar", date: today, noteId: null });
    // The provider restoring or switching its active note afterwards doesn't open it either.
    setActive("a");
    expect(view()).toEqual({ stage: "calendar", date: today, noteId: null });
    expect(selected).toEqual([]);
    expect(browser.calls).toEqual([]);
  });

  test("opening the active note arrived with adds an entry whose Back shows the calendar again", () => {
    const { browser, history, view, open } = page({ active: "a" });
    history.restore();
    open("a");
    expect(browser.calls).toEqual(["push"]);
    expect(view()).toEqual(noteAt("a", today));
    browser.traverse(-1);
    expect(view()).toEqual({ stage: "calendar", date: today, noteId: null });
    browser.traverse(1);
    expect(view()).toEqual(noteAt("a", today));
  });

  test("phone: calendar → day → note, Back returns to the day's list, and the Calendar button needs no history", () => {
    const { browser, view, act, open } = page();
    act({ type: "selectDate", date: "2026-10-18" });
    open("c");
    browser.traverse(-1);
    expect(view()).toEqual(day("2026-10-18"));
    act({ type: "showCalendar" });
    expect(view()).toEqual({ stage: "calendar", date: "2026-10-18", noteId: null });
    expect(browser.calls).toEqual(["push"]);
    // Choosing days and opening the calendar never add entries.
    act({ type: "selectDate", date: today });
    act({ type: "showCalendar" });
    expect(browser.entries).toHaveLength(3);
  });

  test("a new note opens through the same entry", () => {
    const { browser, history, view, setActive } = page({ notes: { a: today, fresh: today } });
    history.go(view(), noteAt("fresh", today));
    setActive("fresh");
    expect(view()).toEqual(noteAt("fresh", today));
    expect(journalEntryFromState(browser.state)?.noteId).toBe("fresh");
    browser.traverse(-1);
    expect(view().noteId).toBeNull();
  });

  test("reloading on a note's entry reopens it, and Back still returns to where it was opened from", () => {
    const first = page();
    first.act({ type: "selectDate", date: "2026-10-18" });
    first.open("c");
    // A reload keeps the session history; the page starts again with the provider on another note.
    const reloaded = page({ active: "a" });
    reloaded.browser.entries = first.browser.entries;
    reloaded.browser.index = first.browser.index;
    reloaded.history.restore();
    expect(reloaded.selected).toEqual(["c"]);
    expect(reloaded.view()).toEqual(noteAt("c", "2026-10-18"));
    reloaded.history.restore();
    expect(reloaded.selected).toEqual(["c"]);
    reloaded.browser.traverse(-1);
    expect(reloaded.view()).toEqual(day("2026-10-18"));

    // The X after a reload steps back too.
    reloaded.browser.traverse(1);
    reloaded.act({ type: "closeNote" });
    reloaded.browser.land();
    reloaded.browser.traverse(-1);
    expect(reloaded.browser.leftPage).toBe(true);
  });

  test("an entry whose note no longer exists falls back to that day's chooser", () => {
    const { browser, history, view, selected } = page({ active: "a" });
    browser.entries[1] = withJournalEntry(routerState, { noteId: "gone", date: "2026-10-18", back: { stage: "day", date: "2026-10-18" } });
    history.restore();
    expect(selected).toEqual([]);
    expect(view()).toEqual(day("2026-10-18"));
  });

  test("other entries and states at this URL (another feature's, a hash) don't move the view", () => {
    const { browser, view, act } = page();
    act({ type: "selectDate", date: "2026-10-18" });
    browser.pushState({ ...routerState, cfmPassagePreview: { volume: "x" } });
    browser.traverse(-1);
    browser.traverse(1);
    expect(view()).toEqual(day("2026-10-18"));
  });

  test("open, close, open again before the browser has moved: one entry, for the last note", () => {
    const { browser, view, act, open } = page();
    act({ type: "selectDate", date: today });
    open("a");
    act({ type: "closeNote" });
    open("b");
    // The note is shown at once; its entry waits for the step back off the last one.
    expect(view()).toEqual(noteAt("b", today));
    expect(browser.calls).toEqual(["push", "back"]);
    browser.land();
    expect(browser.calls).toEqual(["push", "back", "push"]);
    expect(browser.entries).toHaveLength(3);
    expect(journalEntryFromState(browser.state)).toEqual({ noteId: "b", date: today, back: { stage: "day", date: today } });
    expect(view()).toEqual(noteAt("b", today));

    // Closed again before it landed: nothing is recorded, and only one step back is taken.
    act({ type: "closeNote" });
    open("a");
    act({ type: "closeNote" });
    browser.land();
    expect(browser.calls).toEqual(["push", "back", "push", "back"]);
    expect(browser.state).toBe(routerState);
    expect(view()).toEqual(day(today));
  });

  test("a step back whose popstate never comes is treated as done, and dispose drops it", () => {
    const { browser, timers, history, view, act, open } = page();
    open("a");
    act({ type: "closeNote" });
    open("b");
    timers.fire();
    // The browser never moved, so the open note's entry is still on top: it is rewritten, not stacked on.
    expect(browser.calls).toEqual(["push", "back", "replace"]);
    expect(browser.entries).toHaveLength(3);
    expect(view()).toEqual(noteAt("b", "2026-10-21"));

    act({ type: "closeNote" });
    expect(timers.handles.size).toBe(1);
    timers.fire();
    expect(view()).toEqual(day("2026-10-21"));

    open("a");
    act({ type: "closeNote" });
    expect(timers.handles.size).toBe(1);
    history.dispose();
    expect(timers.handles.size).toBe(0);
  });
});
