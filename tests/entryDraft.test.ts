import { describe, expect, test } from "vitest";
import {
  entryDraftInput,
  entryDraftProblem,
  followEntrySource,
  freshEntryDraft,
  isPristineEntry,
  restartEntryDraft,
  withLiveHref,
} from "../src/features/notes/entryDraft";
import type { NoteSource } from "../src/features/notes/journal";
import { lessonNoteSource } from "../src/features/comeFollowMe/lessons";
import { COME_FOLLOW_ME_WEEKS } from "../src/lib/comeFollowMe";
import { noteSourceProblem } from "../convex/noteJournal";

const chapter2: NoteSource = { kind: "scripture", label: "1 Nephi 2", href: "/browse/bookofmormon/1nephi/2", volume: "bookofmormon", book: "1nephi", chapter: 2 };
const chapter3: NoteSource = { ...chapter2, label: "1 Nephi 3", href: "/browse/bookofmormon/1nephi/3", chapter: 3 };

describe("the unsaved journal entry", () => {
  test("Log starts a blank entry logging the chapter; New note starts one linked to it without reading", () => {
    const log = freshEntryDraft({ source: chapter2, logReading: true, journalDate: "2026-10-25" });
    expect(log).toMatchObject({ text: "", source: chapter2, logReading: true, journalDate: "2026-10-25", edited: false });
    expect(log.requestId).toMatch(/^rl-/);
    expect(freshEntryDraft({ source: chapter2 }).logReading).toBe(false);
    // Reading needs something to have read.
    expect(freshEntryDraft({ source: null, logReading: true }).logReading).toBe(false);
  });

  test("note-only, reading-only and both are saveable; an empty entry or an invalid day is not", () => {
    const base = freshEntryDraft({ source: chapter2, journalDate: "2026-10-25" });
    expect(entryDraftProblem(base)).toBe("Write a note or log your reading first.");
    expect(entryDraftProblem({ ...base, text: "  \n" })).not.toBeNull();
    expect(entryDraftProblem({ ...base, text: "A thought" })).toBeNull();
    expect(entryDraftProblem({ ...base, logReading: true })).toBeNull();
    expect(entryDraftProblem({ ...base, text: "Both", logReading: true })).toBeNull();
    expect(entryDraftProblem({ ...base, logReading: true, source: null })).toBe("Choose what you read.");
    expect(entryDraftProblem({ ...base, text: "x", journalDate: "" })).toBe("Choose a day for this entry.");
  });

  test("reopening keeps a draft with text or a chosen reading (and its request id); a blank one restarts", () => {
    const blank = freshEntryDraft({ source: chapter2, logReading: true });
    const restarted = restartEntryDraft(blank, { source: chapter3 });
    expect(restarted).toMatchObject({ source: chapter3, logReading: false, requestId: blank.requestId });

    const typed = { ...blank, text: "Keep me" };
    expect(restartEntryDraft(typed, { source: chapter3 })).toBe(typed);
    const chosen = { ...blank, logReading: false, edited: true };
    expect(isPristineEntry(chosen)).toBe(false);
    expect(restartEntryDraft(chosen, { source: chapter3, logReading: true })).toBe(chosen);
  });

  test("an untouched draft follows the chapter in view; one with content stays on its own", () => {
    const blank = freshEntryDraft({ source: chapter2, logReading: true });
    expect(followEntrySource(blank, chapter3)).toMatchObject({ source: chapter3, logReading: true });
    // The same page with a query or verse hash is not a move, so a live href isn't replaced.
    const live = { ...blank, source: { ...chapter2, href: "/browse/bookofmormon/1nephi/2?compare=kjv" } };
    expect(followEntrySource(live, chapter2)).toBe(live);
    const typed = { ...blank, text: "About chapter 2" };
    expect(followEntrySource(typed, chapter3)).toBe(typed);
  });

  test("the saved input carries the request id, so a retry names the same entry", () => {
    const draft = { ...freshEntryDraft({ source: chapter2, logReading: true, journalDate: "2026-10-25" }), text: "Hi" };
    expect(entryDraftInput(draft)).toEqual({
      journalDate: "2026-10-25",
      source: chapter2,
      markdownBody: "Hi",
      logReading: true,
      requestId: draft.requestId,
    });
    expect(entryDraftInput({ ...draft, source: null, logReading: false }).source).toBeUndefined();
  });

  test("a source for the page in view takes its live query, without the hash; other pages are left alone", () => {
    expect(withLiveHref(chapter2, { pathname: "/browse/bookofmormon/1nephi/2", search: "?compare=kjv" }).href).toBe(
      "/browse/bookofmormon/1nephi/2?compare=kjv"
    );
    expect(withLiveHref(chapter2, { pathname: "/come-follow-me/2026-10-19", search: "" })).toBe(chapter2);
  });
});

describe("a Come, Follow Me lesson's Add note", () => {
  const lessonPath = "/come-follow-me/2026-10-26";
  const lesson = lessonNoteSource("2026-10-26", "Jeremiah 31–33; 36–39; Lamentations 1; 3");
  const jeremiah31: NoteSource = { kind: "scripture", label: "Jeremiah 31", href: "/browse/oldtestament/jeremiah/31", volume: "oldtestament", book: "jeremiah", chapter: 31 };
  const jeremiah32: NoteSource = { ...jeremiah31, label: "Jeremiah 32", href: "/browse/oldtestament/jeremiah/32", chapter: 32 };

  test("every scheduled week, with or without a study guide, links its notes to a storable lesson source", () => {
    for (const week of COME_FOLLOW_ME_WEEKS) {
      const source = lessonNoteSource(week.start, week.block);
      expect(source).toEqual({ kind: "guide", label: week.block, href: `/come-follow-me/${week.start}` });
      expect(noteSourceProblem(source), week.start).toBeNull();
    }
  });

  test("replaces an untouched Log with a note-only entry for the lesson, and never replaces one in progress", () => {
    const log = freshEntryDraft({ source: jeremiah31, logReading: true });
    const note = restartEntryDraft(log, { source: lesson, logReading: false });
    expect(note).toMatchObject({ source: lesson, logReading: false, text: "", requestId: log.requestId });
    expect(entryDraftProblem(note)).toBe("Write a note or log your reading first.");
    expect(entryDraftInput({ ...note, text: "Hope" })).toMatchObject({ source: lesson, logReading: false });

    const typed = { ...log, text: "Already writing" };
    expect(restartEntryDraft(typed, { source: lesson, logReading: false })).toBe(typed);
    const chosenReading = { ...freshEntryDraft({ source: null }), edited: true };
    expect(restartEntryDraft(chosenReading, { source: lesson, logReading: false })).toBe(chosenReading);
  });

  test("stays with the lesson as its chapters scroll by, while Log still follows the chapter being read", () => {
    const note = freshEntryDraft({ source: lesson });
    expect(followEntrySource(note, jeremiah32, lessonPath)).toBe(note);
    // A live query or hash on the lesson is still the lesson.
    const live = { ...note, source: { ...lesson, href: `${lessonPath}?x=1#ch-31` } };
    expect(followEntrySource(live, jeremiah32, lessonPath)).toBe(live);

    const log = freshEntryDraft({ source: jeremiah31, logReading: true });
    expect(followEntrySource(log, jeremiah32, lessonPath)).toMatchObject({ source: jeremiah32, logReading: true });
    // Leaving the lesson with the panel open, an untouched note follows the new page as before.
    expect(followEntrySource(note, jeremiah32, jeremiah32.href)).toMatchObject({ source: jeremiah32 });
  });
});
