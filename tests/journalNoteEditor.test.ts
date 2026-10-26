import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { JournalNoteDocument } from "../src/features/notes/journal";

// The editor's outbox and CodeMirror are out of scope here: only its header is checked.
vi.mock("@/features/insights/InsightBuilderProvider", () => ({
  useInsightBuilder: () => ({ journalOutbox: { flush: () => {}, discard: () => {} }, deleteDraft: async () => {} }),
  useNoteOutboxEntry: () => undefined,
}));
vi.mock("../src/features/notes/useJournalEntryActions", () => ({
  useJournalEntryActions: () => ({ setEntryReading: () => Promise.resolve(), openReadingEntry: () => Promise.resolve() }),
}));
vi.mock("../src/features/notes/LazyMarkdownEditor", () => ({ default: () => null }));

const { default: JournalNoteEditor } = await import("../src/features/notes/JournalNoteEditor");
const { formatDayHeading } = await import("../src/features/notes/journal");

const note: JournalNoteDocument = {
  id: "a",
  title: "Morning thought",
  status: "draft",
  markdown_body: "",
  markdown_revision: 0,
  markdown_canonical: true,
  journal_date: "2026-10-20",
  source: { kind: "scripture", label: "1 Nephi 2", href: "/browse/bookofmormon/1-nephi/2#v-3" },
  created_at: "2026-10-21T08:00:00Z",
  updated_at: "2026-10-21T08:00:00Z",
};

const render = (props: Partial<Parameters<typeof JournalNoteEditor>[0]>) =>
  renderToStaticMarkup(createElement(JournalNoteEditor, { note, ...props }));

describe("Journal note editor header", () => {
  test("in the Notes calendar it leaves the day to the page and keeps the source and close control", () => {
    const html = render({ showDate: false, onClose: () => {} });
    expect(html).not.toContain(`dateTime="${note.journal_date}"`);
    expect(html).not.toContain(formatDayHeading(note.journal_date));
    expect(html).toContain('href="/browse/bookofmormon/1-nephi/2#v-3"');
    expect(html).toContain('aria-label="Close note"');
  });

  test("elsewhere (the reader's notebook) it still names the note's day", () => {
    const html = render({});
    expect(html).toContain(`dateTime="${note.journal_date}"`);
    expect(html).toContain(formatDayHeading(note.journal_date));
    expect(html).not.toContain('aria-label="Close note"');
  });
});

describe("Journal note editor metadata", () => {
  const occurrences = (html: string, text: string) => html.split(text).length - 1;

  test("an entry with reading names its passage once, on the chip, with a separate way to open it", () => {
    const html = render({ note: { ...note, reading_at: "2026-10-20T07:00:00Z" } });
    expect(occurrences(html, ">1 Nephi 2<")).toBe(0);
    expect(html).toContain("Read 1 Nephi 2");
    expect(html).toContain('aria-label="Open 1 Nephi 2"');
    expect(html).toContain('href="/browse/bookofmormon/1-nephi/2#v-3"');
    expect(html).not.toContain("wrote");
  });

  test("a note-only entry links its source once beside Log reading; a personal note says so", () => {
    const html = render({});
    expect(occurrences(html, "1 Nephi 2</a>")).toBe(1);
    expect(html).toContain('aria-label="Log reading"');
    expect(render({ note: { ...note, source: null } })).toContain("Personal note");
  });

  test("the time it was written shares the day's line, naming its own day when that differs", () => {
    const sameDay = render({ note: { ...note, created_at: "2026-10-20T12:00:00" } });
    expect(sameDay).toContain('dateTime="2026-10-20"');
    expect(sameDay).not.toContain("Written");
    const otherDay = render({ note: { ...note, created_at: "2026-10-22T12:00:00" } });
    expect(otherDay).toContain("Written ");
  });
});

describe("Journal note editor deletion", () => {
  test("drafts and archived notes offer Delete note, without asking until it is chosen", () => {
    for (const status of ["draft", "archived"] as const) {
      const html = renderToStaticMarkup(createElement(JournalNoteEditor, { note: { ...note, status } }));
      expect(html).toContain(">Delete note</button>");
      expect(html).not.toContain("Delete this note?");
    }
  });

  test("published notes offer no deletion", () => {
    const html = renderToStaticMarkup(createElement(JournalNoteEditor, { note: { ...note, status: "published" } }));
    expect(html).not.toContain("Delete note");
  });
});

describe("Journal entry reading chip", () => {
  test("a note-only entry offers Log reading for its source; an entry with reading names what was read", () => {
    expect(render({})).toContain('aria-label="Log reading"');
    const logged = render({ note: { ...note, reading_at: "2026-10-20T07:00:00Z" } });
    expect(logged).toContain('aria-label="Edit reading: 1 Nephi 2"');
    expect(logged).toContain("Read 1 Nephi 2");
  });

  test("a personal note without a source or page offers no reading; one on a chapter page can log it", () => {
    expect(render({ note: { ...note, source: null } })).not.toContain("Log reading");
    const onPage = render({
      note: { ...note, source: null },
      readingOptions: [{ source: { kind: "scripture", label: "Alma 32", href: "/browse/bookofmormon/alma/32" } }],
    });
    expect(onPage).toContain('aria-label="Log reading"');
  });
});
