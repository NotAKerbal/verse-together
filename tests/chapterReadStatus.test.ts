import { describe, expect, test } from "vitest";
import { chapterReadPassages, hasReaderNote } from "../src/features/notes/chapterReadStatus";
import type { ReadingLogRow } from "../src/features/notes/journal";
import type { InsightDraftSummary } from "../src/lib/appData";

const chapter = { volume: "oldtestament", book: "jeremiah", chapter: 31 };
const verses = Array.from({ length: 9 }, (_, i) => i + 1);
function reading(id: string, verseStart?: number, verseEnd?: number): ReadingLogRow {
  return { id, note_id: id, kind: "log", origin: "manual", source: {
    kind: "scripture", label: "Jeremiah 31", href: "/browse/oldtestament/jeremiah/31", ...chapter, verseStart, verseEnd,
  }, journal_date: "2026-10-26", read_at: "2026-10-26T12:00:00Z", created_at: "2026-10-26T12:00:00Z", request_id: id };
}

describe("reader logged passages", () => {
  test("joins overlapping and adjacent logs, keeping an unread gap and access to every entry", () => {
    const first = reading("first", 1, 2);
    const second = reading("second", 2, 4);
    const third = reading("third", 7, 9);
    const result = chapterReadPassages([first, second, third, first], chapter, verses);
    expect([...result.keys()]).toEqual([1, 2, 3, 4, 7, 8, 9]);
    expect(result.get(1)).toEqual({ start: 1, end: 4, readings: [first, second] });
    expect(result.get(4)).toBe(result.get(1));
    expect(result.get(7)).toEqual({ start: 7, end: 9, readings: [third] });
    expect(chapterReadPassages([reading("a", 1, 2), reading("b", 3, 4)], chapter, verses).get(1)?.end).toBe(4);
  });

  test("supports full chapters, single verses, reversed ranges, and canonical scripture aliases", () => {
    const whole = reading("chapter");
    whole.source.volume = "old-testament";
    whole.source.book = "Jer-emiah";
    expect(chapterReadPassages([whole], chapter, verses).get(1)).toMatchObject({ start: 1, end: 9 });
    const result = chapterReadPassages([reading("single", 2), reading("reverse", 9, 7)], chapter, verses);
    expect(result.get(2)).toMatchObject({ start: 2, end: 2 });
    expect(result.get(7)).toMatchObject({ start: 7, end: 9 });
  });

  test("ignores other chapters, non-scripture logs and out-of-chapter verses; reflects removal", () => {
    const other = reading("other");
    other.source.chapter = 30;
    const guide = reading("guide");
    guide.source.kind = "guide";
    const result = chapterReadPassages([other, guide, reading("past", 10, 12), reading("visible", 8, 12)], chapter, verses);
    expect([...result.keys()]).toEqual([8, 9]);
    expect(chapterReadPassages([], chapter, verses).size).toBe(0);
    expect(chapterReadPassages([reading("all")], chapter, []).size).toBe(0);
  });

  test("reserves note markers for saved text, including a note added to a reading later", () => {
    const log = { title: "Jeremiah 31", reading_at: "2026-10-26", markdown_canonical: true, excerpt: null } as InsightDraftSummary;
    expect(hasReaderNote(log)).toBe(false);
    expect(hasReaderNote({ ...log, excerpt: "An added thought" })).toBe(true);
    expect(hasReaderNote({ ...log, has_reflection: true })).toBe(true);
    expect(hasReaderNote({ ...log, has_reflection: false })).toBe(false);
    expect(hasReaderNote({ ...log, markdown_body: "   " })).toBe(false);
    expect(hasReaderNote({ ...log, markdown_body: "A local note" })).toBe(true);
    expect(hasReaderNote({ ...log, markdown_canonical: false, block_count: 2 })).toBe(true);
  });
});
