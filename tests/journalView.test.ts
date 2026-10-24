import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import JournalWorkspace, { type JournalWorkspaceProps } from "../src/features/notes/JournalWorkspace";
import type { JournalEntry, JournalNoteEntry } from "../src/features/notes/journal";
import {
  nextJournalView,
  resolveJournalView,
  type JournalView,
  type JournalViewAction,
  type JournalViewContext,
  type JournalViewState,
} from "../src/features/notes/journalView";

const today = "2026-10-21";
const arriving: JournalViewContext = { today, activeNoteId: "a", activeNoteDate: "2026-10-20" };
const noActive: JournalViewContext = { today, activeNoteId: null, activeNoteDate: null };

/** Applies actions the way the page does: each from the view on screen, under possibly changing data. */
function run(context: JournalViewContext, actions: JournalViewAction[], state: JournalViewState = null) {
  let current = state;
  for (const action of actions) current = nextJournalView(resolveJournalView(current, context), action);
  return current;
}

describe("Notes view state", () => {
  test("arriving with an active note opens it on its own day; without one shows the calendar for today", () => {
    expect(resolveJournalView(null, arriving)).toEqual({ stage: "note", date: "2026-10-20", noteId: "a" });
    expect(resolveJournalView(null, noActive)).toEqual({ stage: "calendar", date: today, noteId: null });
    // The active note's day isn't known yet: nothing is opened on the wrong day.
    expect(resolveJournalView(null, { today, activeNoteId: "a", activeNoteDate: null }).stage).toBe("calendar");
  });

  test("closing keeps the note's day and shows its chooser, and the provider's active note never reopens it", () => {
    const closed = run(arriving, [{ type: "closeNote" }]);
    expect(closed).toEqual({ stage: "day", date: "2026-10-20", noteId: null });
    // The same active note, re-delivered or updated by a reactive query, stays closed.
    expect(resolveJournalView(closed, arriving)).toEqual(closed);
    expect(resolveJournalView(closed, { ...arriving, activeNoteId: "b" })).toEqual(closed);
  });

  test("choosing a day shows that day's chooser and returning to the note's day does not reopen it", () => {
    const away = run(arriving, [{ type: "selectDate", date: "2026-10-18" }]);
    expect(away).toEqual({ stage: "day", date: "2026-10-18", noteId: null });
    const back = run(arriving, [{ type: "selectDate", date: "2026-10-20" }], away);
    expect(resolveJournalView(back, arriving)).toEqual({ stage: "day", date: "2026-10-20", noteId: null });
  });

  test("re-choosing the open note's own day (Today, a reading logged for it) keeps the note open", () => {
    const open: JournalView = { stage: "note", date: today, noteId: "a" };
    expect(nextJournalView(open, { type: "selectDate", date: today })).toBe(open);
  });

  test("phone stages go calendar → day → note and back without losing the day", () => {
    const context: JournalViewContext = { today, activeNoteId: "b", activeNoteDate: "2026-10-19" };
    const day = run(noActive, [{ type: "selectDate", date: "2026-10-19" }]);
    expect(day).toEqual({ stage: "day", date: "2026-10-19", noteId: null });
    const note = run(context, [{ type: "openNote", noteId: "b", date: "2026-10-19" }], day);
    expect(resolveJournalView(note, context)).toEqual({ stage: "note", date: "2026-10-19", noteId: "b" });
    const closed = run(context, [{ type: "closeNote" }], note);
    expect(closed).toEqual({ stage: "day", date: "2026-10-19", noteId: null });
    expect(run(context, [{ type: "showCalendar" }], closed)).toEqual({ stage: "calendar", date: "2026-10-19", noteId: null });
  });

  test("an open note that stops being the loaded one (deleted, switched elsewhere) leaves for its day's chooser", () => {
    const open: JournalView = { stage: "note", date: today, noteId: "a" };
    expect(resolveJournalView(open, { today, activeNoteId: null, activeNoteDate: null })).toEqual({
      stage: "day",
      date: today,
      noteId: null,
    });
    expect(resolveJournalView(open, { today, activeNoteId: "z", activeNoteDate: today }).noteId).toBeNull();
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

function render(layout: JournalWorkspaceProps["layout"], view: JournalView) {
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
  };
  return renderToStaticMarkup(createElement(JournalWorkspace, props));
}

const countOf = (html: string, text: string) => html.split(text).length - 1;

describe("Notes workspace stages", () => {
  test("phone calendar stage shows only the month: no day list, no editor, no week/month toggle", () => {
    const html = render("phone", { stage: "calendar", date: today, noteId: null });
    expect(html).toContain('aria-label="Calendar"');
    expect(html).not.toContain("Select a note");
    expect(html).not.toContain("Morning thought");
    expect(html).not.toContain("EDITOR-PANE");
    expect(html).not.toMatch(/Show (week|month)/);
  });

  test("phone day stage lists that day's entries under Select a note, with a way back to the calendar", () => {
    const html = render("phone", { stage: "day", date: today, noteId: null });
    expect(html).not.toContain('aria-label="Calendar"');
    expect(html).toContain(">Select a note</h2>");
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
    expect(html).not.toContain("Select a note");
  });

  test("desktop without an open note puts the day's chooser in the main area, listed once", () => {
    const html = render("desktop", { stage: "day", date: today, noteId: null });
    expect(html).toContain('aria-label="Calendar"');
    expect(html).toContain(">Select a note</h2>");
    expect(countOf(html, "Morning thought")).toBe(1);
    expect(countOf(html, "Evening question")).toBe(1);
    expect(html).not.toContain("EDITOR-PANE");
  });

  test("desktop with an open note collapses the month to the day's list beside the editor; closing restores it", () => {
    const open: JournalView = { stage: "note", date: today, noteId: "a" };
    const html = render("desktop", open);
    expect(html).toContain("EDITOR-PANE");
    expect(html).not.toContain('aria-label="Calendar"');
    expect(html).toContain(`aria-label="Entries for`);
    expect(html).not.toContain("Select a note");
    expect(countOf(html, "Evening question")).toBe(1);

    const closed = render("desktop", nextJournalView(open, { type: "closeNote" }));
    expect(closed).toContain('aria-label="Calendar"');
    expect(closed).toContain("October 2026");
    expect(closed).toContain(">Select a note</h2>");
    expect(closed).toContain(`dateTime="${today}"`);
    expect(closed).not.toContain("EDITOR-PANE");
  });

  test("a day without notes invites starting one instead of asking to select", () => {
    const html = render("desktop", { stage: "day", date: "2026-10-05", noteId: null });
    expect(html).toContain(">Start a note</h2>");
    expect(html).toContain("Nothing recorded on this day.");
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
    expect(open.slice(heading)).toMatch(/^<h2[^>]*><time dateTime="2026-10-21">/);

    expect(render("desktop", { stage: "day", date: today, noteId: null })).not.toContain("Back to calendar");
  });

  test("phone keeps its back-to-the-day control in the top bar", () => {
    const html = render("phone", { stage: "note", date: today, noteId: "a" });
    expect(html).toContain('Back to </span><span class="truncate">Wednesday, October 21, 2026');
  });
});
