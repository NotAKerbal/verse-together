import assert from "node:assert/strict";
import test from "node:test";
import { annotationProblem, normalizeAnnotationBody } from "../../../convex/annotationRules.ts";
import { annotationChapter, highlightOf, myAnnotationsByVerse } from "./verseAnnotations.ts";

test("both readers store a chapter under the standard reader's route identity", () => {
  // The standard reader's route: /browse/dnc/doctrineandcovenants/76 (volume prop "dnc").
  // A Come, Follow Me guide over the same section carries the canonical volume id.
  assert.deepEqual(annotationChapter("doctrineandcovenants", "doctrineandcovenants", 76), {
    volume: "dnc",
    book: "doctrineandcovenants",
    chapter: 76,
  });
  assert.deepEqual(annotationChapter("dnc", "doctrineandcovenants", 76), annotationChapter("doctrineandcovenants", "doctrineandcovenants", 76));
  // Every other volume's route slug is its canonical id; the book slug and chapter pass through untouched.
  assert.deepEqual(annotationChapter("oldtestament", "isaiah", 53), { volume: "oldtestament", book: "isaiah", chapter: 53 });
  assert.deepEqual(annotationChapter("old-testament", "isaiah", 53), { volume: "oldtestament", book: "isaiah", chapter: 53 });
  assert.deepEqual(annotationChapter("bookofmormon", "1-nephi", 3), { volume: "bookofmormon", book: "1-nephi", chapter: 3 });
});

test("an annotation is a note, a highlight, or both, and never an empty stand-in", () => {
  assert.equal(annotationProblem("A note", undefined), null, "a note alone");
  assert.equal(annotationProblem("A note", "blue"), null, "a note with a highlight");
  assert.equal(annotationProblem("", "yellow"), null, "a highlight alone needs no note text");
  assert.equal(annotationProblem("  \n ", "purple"), null, "whitespace is no note, but the highlight stands");
  assert.notEqual(annotationProblem("", undefined), null, "nothing at all");
  assert.notEqual(annotationProblem(" \t\n", null), null, "only whitespace and no highlight");
  assert.equal(annotationProblem("x".repeat(1200), undefined), null);
  assert.notEqual(annotationProblem("x".repeat(1201), "green"), null, "too long, highlight or not");
  // The stored body is the normalized text: a highlight-only save stores "", not placeholder text.
  assert.equal(normalizeAnnotationBody("  \n "), "");
  assert.equal(normalizeAnnotationBody("  Two\n\nlines  "), "Two lines");
  // Normalizing first: 1,250 characters of mostly spaces fit.
  assert.equal(annotationProblem(`a${" ".repeat(1248)}b`, undefined), null);
});

test("only the viewer's own row is theirs, verse by verse", () => {
  const row = (verse, isMine, extra = {}) => ({
    id: `id-${verse}-${isMine}`,
    verse,
    body: "",
    visibility: "private",
    highlight_color: null,
    user_id: isMine ? "me" : "someone",
    is_mine: isMine,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...extra,
  });
  const mine = myAnnotationsByVerse({
    by_verse: { 3: [row(3, false), row(3, true, { highlight_color: "pink" })], 4: [row(4, false)] },
  });
  assert.deepEqual([...mine.keys()], [3]);
  assert.equal(mine.get(3).id, "id-3-true");
  assert.equal(highlightOf(mine.get(3)), "pink");
  assert.equal(highlightOf(undefined), "none");
  assert.equal(myAnnotationsByVerse(undefined).size, 0, "still loading");
});
