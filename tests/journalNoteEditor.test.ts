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
