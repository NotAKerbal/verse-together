import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import JournalWorkspace, { type JournalWorkspaceProps } from "../src/features/notes/JournalWorkspace";
import { formatDayHeading, formatShortDayHeading, type JournalEntry, type JournalNoteEntry } from "../src/features/notes/journal";
import {
  nextJournalView,
  resolveJournalView,
  type JournalView,
  type JournalViewAction,
  type JournalViewContext,
  type JournalViewState,
} from "../src/features/notes/journalView";

const today = "2026-10-21";
const arriving: JournalViewContext = { today, activeNoteId: "a" };
const noActive: JournalViewContext = { today, activeNoteId: null };
const calendarToday: JournalView = { stage: "calendar", date: today, noteId: null };

/** Applies actions the way the page does: each from the view on screen, under possibly changing data. */
function run(context: JournalViewContext, actions: JournalViewAction[], state: JournalViewState = null) {
  let current = state;
  for (const action of actions) current = nextJournalView(resolveJournalView(current, context), action);
  return current;
}

describe("Notes view state", () => {
  test("arriving fresh always shows today's calendar, with or without an active note", () => {
    expect(resolveJournalView(null, noActive)).toEqual(calendarToday);
    // The provider's active note (say, from the reader's sidebar), whatever its day, is not opened on arrival.
    expect(resolveJournalView(null, arriving)).toEqual(calendarToday);
    expect(resolveJournalView(null, { today, activeNoteId: "today-note" })).toEqual(calendarToday);
  });

  test("an active note restored after arrival, or switched to elsewhere, never opens the view on its own", () => {
    // The provider restores its active note a moment after the page first renders.
    expect(resolveJournalView(null, noActive)).toEqual(calendarToday);
    expect(resolveJournalView(null, arriving)).toEqual(calendarToday);
    expect(resolveJournalView(null, { ...arriving, activeNoteId: "b" })).toEqual(calendarToday);
    // A day chosen meanwhile stays chosen when an unrelated note becomes active.
    const day = run(noActive, [{ type: "selectDate", date: "2026-10-18" }]);
    expect(resolveJournalView(day, arriving)).toEqual({ stage: "day", date: "2026-10-18", noteId: null });
  });

  test("the active note still opens when chosen, on the day it was chosen from", () => {
    const open = run(arriving, [
      { type: "selectDate", date: "2026-10-20" },
      { type: "openNote", noteId: "a", date: "2026-10-20" },
    ]);
    expect(resolveJournalView(open, arriving)).toEqual({ stage: "note", date: "2026-10-20", noteId: "a" });
  });

  test("closing keeps the note's day and shows its chooser, and the provider's active note never reopens it", () => {
    const open: JournalView = { stage: "note", date: "2026-10-20", noteId: "a" };
    const closed = run(arriving, [{ type: "closeNote" }], open);
    expect(closed).toEqual({ stage: "day", date: "2026-10-20", noteId: null });
    // The same active note, re-delivered or updated by a reactive query, stays closed.
    expect(resolveJournalView(closed, arriving)).toEqual(closed);
    expect(resolveJournalView(closed, { ...arriving, activeNoteId: "b" })).toEqual(closed);
  });

  test("choosing a day shows that day's chooser and returning to the note's day does not reopen it", () => {
    const open: JournalView = { stage: "note", date: "2026-10-20", noteId: "a" };
    const away = run(arriving, [{ type: "selectDate", date: "2026-10-18" }], open);
    expect(away).toEqual({ stage: "day", date: "2026-10-18", noteId: null });
    const back = run(arriving, [{ type: "selectDate", date: "2026-10-20" }], away);
    expect(resolveJournalView(back, arriving)).toEqual({ stage: "day", date: "2026-10-20", noteId: null });
  });

  test("re-choosing the open note's own day (Today, a reading logged for it) keeps the note open", () => {
    const open: JournalView = { stage: "note", date: today, noteId: "a" };
    expect(nextJournalView(open, { type: "selectDate", date: today })).toBe(open);
  });

  test("phone stages go calendar → day → note and back without losing the day", () => {
    const context: JournalViewContext = { today, activeNoteId: "b" };
    const day = run(noActive, [{ type: "selectDate", date: "2026-10-19" }]);
    expect(day).toEqual({ stage: "day", date: "2026-10-19", noteId: null });
    const note = run(context, [{ type: "openNote", noteId: "b", date: "2026-10-19" }], day);
    expect(resolveJournalView(note, context)).toEqual({ stage: "note", date: "2026-10-19", noteId: "b" });
    const closed = run(context, [{ type: "closeNote" }], note);
    expect(closed).toEqual({ stage: "day", date: "2026-10-19", noteId: null });
    expect(run(context, [{ type: "showCalendar" }], closed)).toEqual({ stage: "calendar", date: "2026-10-19", noteId: null });
  });

  test("a finished deletion closes only the deleted note, and leaves every other view exactly as it is", () => {
    const open: JournalView = { stage: "note", date: "2026-10-20", noteId: "a" };
    expect(nextJournalView(open, { type: "noteDeleted", noteId: "a" })).toEqual({ stage: "day", date: "2026-10-20", noteId: null });
    const others: JournalView[] = [
      calendarToday,
      { stage: "day", date: "2026-10-20", noteId: null },
      { stage: "note", date: "2026-10-18", noteId: "b" },
    ];
    // The same object, so the page's history knows there is nothing to do.
    for (const view of others) expect(nextJournalView(view, { type: "noteDeleted", noteId: "a" })).toBe(view);
  });

  test("an open note that stops being the loaded one (deleted, switched elsewhere) leaves for its day's chooser", () => {
    const open: JournalView = { stage: "note", date: today, noteId: "a" };
    expect(resolveJournalView(open, noActive)).toEqual({
      stage: "day",
      date: today,
      noteId: null,
    });
    expect(resolveJournalView(open, { today, activeNoteId: "z" }).noteId).toBeNull();
  });
});

function note(id: string, title: string, journalDate: string, createdAt: string): JournalNoteEntry {
  return {
    kind: "note",
    id,
    title,
    status: "draft",
    journal_date: journalDate,
    source: { kind: "scripture", label: "1 Nephi 2", href: "/browse/bookofmormon/1-nephi/2#v-3" },
    excerpt: null,
    markdown_revision: 0,
    markdown_canonical: true,
    read_only: false,
    author_label: "Reader",
    created_at: createdAt,
    updated_at: createdAt,
  };
}

const entries: JournalEntry[] = [
  note("a", "Morning thought", today, `${today}T08:00:00Z`),
  note("b", "Evening question", today, `${today}T20:00:00Z`),
  note("c", "Another day", "2026-10-18", "2026-10-18T09:00:00Z"),
  {
    kind: "reading",
    id: "r",
    journal_date: today,
    source: { kind: "scripture", label: "1 Nephi 2", href: "/browse/bookofmormon/1-nephi/2" },
    read_at: `${today}T07:00:00Z`,
  },
  {
    kind: "reading",
    id: "unsafe",
    journal_date: "2026-10-17",
    source: { kind: "page", label: "Odd source", href: "javascript:alert(1)" },
    reader_label: "Reader",
    read_at: "2026-10-17T07:00:00Z",
  },
];

const noop = () => {};

function render(layout: JournalWorkspaceProps["layout"], view: JournalView, overrides: Partial<JournalWorkspaceProps> = {}) {
  const props: JournalWorkspaceProps = {
    layout,
    status: "ready",
    entries,
    today,
    stage: view.stage,
    selectedDate: view.date,
    onSelectDate: noop,
    selectedKey: view.noteId ? `note:${view.noteId}` : null,
    onOpenNote: noop,
    onCloseNote: noop,
    onShowCalendar: noop,
    onNewNote: noop,
    notePane: view.noteId ? createElement("p", null, "EDITOR-PANE") : undefined,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(JournalWorkspace, props));
}

const countOf = (html: string, text: string) => html.split(text).length - 1;
/** The day's chooser is headed by its full date (an id'd, focusable h2); the rail's abbreviated date is not. */
const CHOOSER_HEADING = /<h2 id="[^"]+"[^>]*><time dateTime="\d{4}-\d{2}-\d{2}">/;
/** The opening tag of the element whose markup starts right before `marker` (its parent, for a child's tag). */
const tagBefore = (html: string, marker: string) => {
  const end = html.indexOf(marker);
  return html.slice(html.lastIndexOf("<", end - 1), end);
};

describe("Notes workspace stages", () => {
  test("arriving with an active note shows the month, not the note: phone the calendar alone, desktop with today's chooser", () => {
    const arrival = resolveJournalView(null, arriving);
    const phone = render("phone", arrival);
    expect(phone).toContain('aria-label="Calendar"');
    expect(phone).not.toMatch(CHOOSER_HEADING);
    expect(phone).not.toContain("EDITOR-PANE");

    const desktop = render("desktop", arrival, { notePane: createElement("p", null, "EDITOR-PANE") });
    expect(tagBefore(desktop, '<section aria-label="Calendar"')).not.toContain("inert");
    expect(desktop).toMatch(CHOOSER_HEADING);
    expect(desktop).toContain(`dateTime="${today}"`);
    expect(desktop).not.toContain("EDITOR-PANE");
    expect(desktop).not.toContain('aria-current="true"');
  });

  test("phone calendar stage shows only the month: no day list, no editor, no week/month toggle", () => {
    const html = render("phone", { stage: "calendar", date: today, noteId: null });
    expect(html).toContain('aria-label="Calendar"');
    expect(html).not.toMatch(CHOOSER_HEADING);
    expect(html).not.toContain("Morning thought");
    expect(html).not.toContain("EDITOR-PANE");
    expect(html).not.toMatch(/Show (week|month)/);
  });

  test("phone day stage lists that day's entries under its date, with a way back to the calendar", () => {
    const html = render("phone", { stage: "day", date: today, noteId: null });
    expect(html).not.toContain('aria-label="Calendar"');
    expect(html).toMatch(CHOOSER_HEADING);
    expect(html).toContain("Morning thought");
    expect(html).toContain("Evening question");
    expect(html).toContain('href="/browse/bookofmormon/1-nephi/2"');
    expect(html).not.toContain("Another day");
    expect(html).toContain("Back to </span><span class=\"truncate\">Calendar");
  });

  test("phone note stage shows only the note, not the calendar or the day's other entries", () => {
    const html = render("phone", { stage: "note", date: today, noteId: "a" });
    expect(html).toContain("EDITOR-PANE");
    expect(html).not.toContain('aria-label="Calendar"');
    expect(html).not.toContain("Evening question");
    expect(html).not.toMatch(CHOOSER_HEADING);
  });

  test("desktop without an open note puts the day's chooser in the main area, listed once", () => {
    const html = render("desktop", { stage: "day", date: today, noteId: null });
    expect(html).toContain('aria-label="Calendar"');
    expect(html).toMatch(CHOOSER_HEADING);
    expect(countOf(html, "Morning thought")).toBe(1);
    expect(countOf(html, "Evening question")).toBe(1);
    expect(html).not.toContain("EDITOR-PANE");
  });

  test("desktop with an open note moves the day's list beside the editor and puts the month out of reach; closing restores it", () => {
    const open: JournalView = { stage: "note", date: today, noteId: "a" };
    const html = render("desktop", open);
    expect(html).toContain("EDITOR-PANE");
    expect(tagBefore(html, "<p>EDITOR-PANE")).not.toContain("inert");
    // The month stays mounted (its month and day survive) but is inert until the note closes.
    expect(tagBefore(html, '<section aria-label="Calendar"')).toContain('inert=""');
    expect(html).toContain(`aria-label="Entries for`);
    expect(html).not.toMatch(CHOOSER_HEADING);
    expect(countOf(html, "Evening question")).toBe(1);

    const closed = render("desktop", nextJournalView(open, { type: "closeNote" }));
    expect(tagBefore(closed, '<section aria-label="Calendar"')).not.toContain("inert");
    expect(closed).toContain("October 2026");
    expect(closed).toMatch(CHOOSER_HEADING);
    expect(closed).toContain(`dateTime="${today}"`);
    expect(closed).not.toContain("EDITOR-PANE");
    expect(countOf(closed, "Evening question")).toBe(1);
  });

  test("desktop never mounts a note pane while no note is open, even if one is passed, and its empty panel is inert", () => {
    const html = render("desktop", { stage: "day", date: today, noteId: null }, { notePane: createElement("p", null, "EDITOR-PANE") });
    expect(html).not.toContain("EDITOR-PANE");
    expect(html).toMatch(/<section aria-label="Open note"[^>]*inert=""[^>]*><\/section>/);
  });

  test("a day without notes shows just its date and New note, with no empty-state box", () => {
    const html = render("desktop", { stage: "day", date: "2026-10-05", noteId: null });
    expect(html).toMatch(/<h2 id="[^"]+"[^>]*><time dateTime="2026-10-05">/);
    expect(html).toContain("New note");
    expect(html).not.toContain("Nothing recorded on this day.");
  });
});

/** The markup of each list item in the day's list, in order. */
const cardsOf = (html: string) => [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1]);

describe("Notes entry cards", () => {
  test("a note card is one real button with its source link beside it, never nested in it", () => {
    for (const layout of ["desktop", "phone"] as const) {
      const html = render(layout, { stage: "day", date: today, noteId: null });
      expect(html).not.toContain('role="button"');
      const noteCards = cardsOf(html).filter((card) => card.includes("<button"));
      expect(noteCards).toHaveLength(2);
      for (const card of noteCards) {
        const button = card.match(/<button\b[\s\S]*?<\/button>/)![0];
        expect(countOf(card, "<button")).toBe(1);
        expect(button).not.toContain("<a ");
        // The source link (and the author and time) follow the button instead of sitting inside it.
        expect(card.slice(card.indexOf("</button>"))).toMatch(/<a [^>]*href="\/browse\/bookofmormon\/1-nephi\/2#v-3"/);
        expect(card.slice(card.indexOf("</button>"))).toContain("Reader");
      }
    }
  });

  test("the open note's card in the desktop rail is marked current", () => {
    const html = render("desktop", { stage: "note", date: today, noteId: "a" });
    const current = cardsOf(html).filter((card) => card.includes('aria-current="true"'));
    expect(current).toHaveLength(1);
    expect(current[0]).toContain("Morning thought");
  });

  test("a reading card is a single link to what was read, covering its label, reader and time", () => {
    const html = render("desktop", { stage: "day", date: today, noteId: null });
    const reading = cardsOf(html).find((card) => card.includes("Reading"))!;
    expect(countOf(reading, "<a ")).toBe(1);
    expect(reading).toMatch(/^<a [^>]*href="\/browse\/bookofmormon\/1-nephi\/2">[\s\S]*Reading[\s\S]*1 Nephi 2[\s\S]*<time dateTime="2026-10-21T07:00:00Z"[\s\S]*<\/a>$/);
  });

  test("a reading whose source isn't a safe in-app path is shown without any link", () => {
    const html = render("desktop", { stage: "day", date: "2026-10-17", noteId: null });
    const reading = cardsOf(html).find((card) => card.includes("Odd source"))!;
    expect(reading).toContain("Read by Reader");
    expect(reading).not.toContain("<a ");
    expect(html).not.toContain("javascript:");
  });
});

describe("Leaving an open note", () => {
  test("desktop puts a back control right before the day heading in the rail, only while a note is open", () => {
    const open = render("desktop", { stage: "note", date: today, noteId: "a" });
    const back = open.indexOf('aria-label="Back to calendar"');
    expect(back).toBeGreaterThan(-1);
    const heading = open.indexOf("<h2", back);
    expect(open.slice(back, heading)).toMatch(/^aria-label="Back to calendar"[^>]*>[\s\S]*<\/button>$/);
    expect(open.slice(heading)).toMatch(/^<h2[^>]*><time dateTime="2026-10-21"/);

    expect(render("desktop", { stage: "day", date: today, noteId: null })).not.toContain("Back to calendar");
  });

  test("the desktop rail abbreviates the day on screen but keeps the full date as its name, with Today", () => {
    const railHeading = (html: string) => html.slice(html.indexOf('aria-label="Entries for')).match(/<h2\b[^>]*>[\s\S]*?<\/h2>/)![0];
    const heading = railHeading(render("desktop", { stage: "note", date: today, noteId: "a" }));
    const full = formatDayHeading(today);
    const short = formatShortDayHeading(today);
    expect(short.length).toBeLessThan(full.length);
    expect(heading).toContain(`<span aria-hidden="true">${short}</span>`);
    expect(heading).toContain(`<span class="sr-only">${full}</span>`);
    expect(heading).toContain(`title="${full}"`);
    expect(heading).toContain(">Today</span>");

    const otherDay = railHeading(render("desktop", { stage: "note", date: "2026-10-18", noteId: "c" }));
    expect(otherDay).not.toContain("Today");
    // The main chooser has the room for the full date.
    expect(render("desktop", { stage: "day", date: today, noteId: null })).toContain(`<time dateTime="${today}">${full}</time>`);
  });

  test("phone keeps its back-to-the-day control in the top bar", () => {
    const html = render("phone", { stage: "note", date: today, noteId: "a" });
    expect(html).toContain('Back to </span><span class="truncate">Wednesday, October 21, 2026');
  });
});
