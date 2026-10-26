import { describe, expect, test } from "vitest";
import { journalGoalWeek, journalHomeProgress, journalRevisit } from "../src/features/notes/journalHome";
import type { JournalEntry, JournalNoteEntry } from "../src/features/notes/journal";

const note = (id: string, date: string, change: Partial<JournalNoteEntry> = {}): JournalNoteEntry => ({
  kind: "note", id, title: "A thought", status: "draft", journal_date: date, source: null, excerpt: "Something to remember",
  has_reflection: true, markdown_revision: 0, markdown_canonical: true, read_only: false, author_label: "You",
  created_at: `${date}T12:00:00Z`, updated_at: `${date}T12:00:00Z`, ...change,
});
const reading = (id: string, date: string): JournalEntry => ({
  kind: "reading", id, journal_date: date, read_at: `${date}T12:00:00Z`,
  source: { kind: "scripture", label: "Jeremiah 1", href: "/browse/oldtestament/jeremiah/1" },
});

describe("journal homepage progress", () => {
  test("Monday–Sunday weeks cross month, year and daylight saving boundaries using local calendar days", () => {
    expect(journalGoalWeek("2026-10-25")).toEqual({ start: "2026-10-19", end: "2026-10-25" });
    expect(journalGoalWeek("2026-10-26")).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(journalGoalWeek("2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  });

  test("counts unique study days and actual notes; ignores future entries, readings without notes and repeated rows", () => {
    const both = note("both", "2026-10-22", { reading_at: "2026-10-22T12:00:00Z" });
    const entries = [reading("a", "2026-10-19"), reading("b", "2026-10-19"), both, both,
      note("personal", "2026-10-23"), note("reading-only", "2026-10-24", { title: "Jeremiah 1", excerpt: null, has_reflection: false, reading_at: "2026-10-24T12:00:00Z" }),
      reading("old", "2026-10-01"), reading("future", "2026-10-26"), reading("prior-month", "2026-09-30")];
    expect(journalHomeProgress(entries, "2026-10-25")).toEqual({
      week: { start: "2026-10-19", end: "2026-10-25" }, studyDays: 3, reflections: 2, monthStudyDays: 4,
    });
  });

  test("shows real zero progress and revisits only earlier notes with actual text", () => {
    expect(journalHomeProgress([], "2026-10-25")).toMatchObject({ studyDays: 0, reflections: 0, monthStudyDays: 0 });
    const earlier = note("earlier", "2026-10-18");
    expect(journalRevisit([earlier, reading("read", "2026-10-24"), note("today", "2026-10-25"),
      note("empty", "2026-10-24", { has_reflection: false })], "2026-10-25")).toBe(earlier);
    expect(journalRevisit([], "2026-10-25")).toBeNull();
  });
});
