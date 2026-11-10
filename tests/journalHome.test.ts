import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { JournalInvitation } from "../src/features/notes/JournalHomeSections";
import {
  JOURNAL_INVITATION_ART, journalGoalWeek, journalHomeProgress, journalInvitationFromStored, journalRevisit, pickJournalInvitation,
  randomIndexExcept, REFLECTION_PROMPTS, storedJournalInvitation,
} from "../src/features/notes/journalHome";
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

describe("the journal invitation's prompt and artwork", () => {
  test("offers many distinct prompts and only shipped artwork", () => {
    expect(REFLECTION_PROMPTS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(REFLECTION_PROMPTS).size).toBe(REFLECTION_PROMPTS.length);
    expect(JOURNAL_INVITATION_ART.length).toBeGreaterThan(1);
    for (const art of JOURNAL_INVITATION_ART) expect(existsSync(new URL(`../public${art.src}`, import.meta.url))).toBe(true);
  });

  test("random picks reach both ends of the range and never return the excluded index", () => {
    expect(randomIndexExcept(5, null, () => 0)).toBe(0);
    expect(randomIndexExcept(5, null, () => 0.999999)).toBe(4);
    expect(randomIndexExcept(5, 0, () => 0)).toBe(1);
    expect(randomIndexExcept(5, 4, () => 0.999999)).toBe(3);
    expect(randomIndexExcept(5, 2, () => 0.5)).toBe(3);
    expect(randomIndexExcept(5, 2, () => 1)).toBe(4);
    expect(randomIndexExcept(5, 7, () => 0.999999)).toBe(4);
    expect(randomIndexExcept(5, -1, () => Number.NaN)).toBe(0);
    expect(randomIndexExcept(1, 0, () => 0.5)).toBe(0);
    for (let excluded = 0; excluded < 5; excluded += 1) {
      const seen = new Set(Array.from({ length: 4 }, (_, step) => randomIndexExcept(5, excluded, () => step / 4)));
      expect(seen).toEqual(new Set([0, 1, 2, 3, 4].filter(index => index !== excluded)));
    }
  });

  test("choosing another changes both the prompt and the artwork", () => {
    for (const value of [0, 0.3, 0.7, 0.999999]) {
      const previous = { prompt: 3, art: 2 };
      const next = pickJournalInvitation(previous, () => value);
      expect(next.prompt).not.toBe(previous.prompt);
      expect(next.art).not.toBe(previous.art);
      expect(REFLECTION_PROMPTS[next.prompt]).toBeDefined();
      expect(JOURNAL_INVITATION_ART[next.art]).toBeDefined();
    }
  });

  test("a remembered invitation round-trips, and unknown or malformed storage avoids nothing", () => {
    const choice = { prompt: 5, art: 1 };
    expect(journalInvitationFromStored(JSON.parse(JSON.stringify(storedJournalInvitation(choice))))).toEqual(choice);
    expect(journalInvitationFromStored({ prompt: "A retired prompt", art: JOURNAL_INVITATION_ART[0].src })).toEqual({ art: 0 });
    for (const value of [null, "text", 4, { prompt: 2, art: 1 }]) {
      const previous = journalInvitationFromStored(value);
      const next = pickJournalInvitation(previous, () => 0);
      expect(next).toEqual({ prompt: 0, art: 0 });
    }
  });

  test("the server render is deterministic and chooses nothing, so hydration matches", () => {
    const random = vi.spyOn(Math, "random");
    const render = () => renderToStaticMarkup(createElement(JournalInvitation, { date: "2026-10-25", onWrite: () => {} }));
    const html = render();
    expect(render()).toBe(html);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(html).not.toContain("Make room for a little light.");
    expect(html).toMatch(/<h2 aria-live="polite" aria-atomic="true"><\/h2>/);
    expect(html).toContain("Choose another prompt");
    expect(html).not.toContain("background-image");
    for (const prompt of REFLECTION_PROMPTS) expect(html).not.toContain(prompt);
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });
});
