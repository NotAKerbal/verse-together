import { expect, test } from "vitest";
import { scriptureSourceOffsets, selectedVersePassages } from "../src/lib/verseSelection";

test("CFM typographic dashes map to canonical scripture offsets in both directions", () => {
  const offsets = scriptureSourceOffsets("A--B--C", "A—B—C");
  expect(offsets).toEqual([0, 1, 3, 4, 6, 7]);
  expect(offsets?.indexOf(6)).toBe(4);
  expect(scriptureSourceOffsets("A—B", "A—B")).toEqual([0, 1, 2, 3]);
});

test("text differences beyond typography are refused rather than marking different words", () => {
  expect(scriptureSourceOffsets("Old words", "New words")).toBeNull();
  expect(scriptureSourceOffsets("A--B", "A—BC")).toBeNull();
  expect(scriptureSourceOffsets("A--BC", "A—B")).toBeNull();
});


test("note quotations split around excluded JST verses and retain partial selection text", () => {
  expect(selectedVersePassages([
    { verse: 3, text: "Start chosen end", start: 6, end: 12 },
    { verse: 5, text: "Second verse", start: 0, end: 6 },
  ])).toEqual([
    { verseStart: 3, verseEnd: 3, text: "chosen" },
    { verseStart: 5, verseEnd: 5, text: "Second" },
  ]);
});

test("contiguous note quotations remain one passage, without crossing chapters", () => {
  expect(selectedVersePassages([
    { verse: 3, text: "Start selected", start: 6, end: 14, chapter: 9 },
    { verse: 4, text: "next words", start: 0, end: 4, chapter: 9 },
    { verse: 5, text: "new chapter", start: 0, end: 3, chapter: 10 },
  ])).toEqual([
    { verseStart: 3, verseEnd: 4, text: "selected next" },
    { verseStart: 5, verseEnd: 5, text: "new" },
  ]);
  expect(selectedVersePassages([])).toEqual([]);
});
