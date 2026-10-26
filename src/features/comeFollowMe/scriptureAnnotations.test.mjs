import assert from "node:assert/strict";
import test from "node:test";
import { quickMarkPatch, selectionMarks, withVerseMarks } from "../annotations/verseAnnotations.ts";
import {
  collectChapterAnnotations,
  formatScriptureSelection,
  selectedScriptureVerses,
  selectionMarkWrites,
  verseFromScriptureId,
  verseKey,
  versesByChapter,
} from "./scriptureAnnotations.ts";

test("a verse's identity comes from its own scripture-pane id", () => {
  assert.deepEqual(verseFromScriptureId("scripture-isaiah-53-v4", "isaiah"), { chapter: 53, verse: 4 });
  assert.equal(verseFromScriptureId("scripture-isaiah-53", "isaiah"), null, "a chapter heading is no verse");
  assert.equal(verseFromScriptureId("scripture-isaiah-53-v4-6", "isaiah"), null, "a range is no single verse");
  assert.equal(verseFromScriptureId("scripture-jeremiah-53-v4", "isaiah"), null, "another book");
  assert.equal(verseFromScriptureId("isaiah-53-v4", "isaiah"), null, "a guide commentary id");
});

test("a selection covers each verse in its own chapter, across a chapter break", () => {
  // From Isaiah 52:15 across the chapter break into 53:1–2: each verse keeps its own chapter, never 53:15 or 52:1.
  const ids = [
    "scripture-isaiah-52-v15",
    "scripture-isaiah-53", // the chapter heading between them
    "scripture-isaiah-53-v1",
    "scripture-isaiah-53-v2",
    "scripture-isaiah-53-v2", // repeated
    "scripture-jeremiah-1-v1", // another book
    "scripture-isaiah-53-v3-5", // a range
  ];
  const verses = selectedScriptureVerses(ids, "isaiah");
  assert.deepEqual(verses, [
    { chapter: 52, verse: 15 },
    { chapter: 53, verse: 1 },
    { chapter: 53, verse: 2 },
  ]);
  // The full note editor opens on the first selected verse, in its own chapter.
  assert.deepEqual(verses[0], { chapter: 52, verse: 15 });
  // Starting in chapter 53's heading: the first verse it covers.
  assert.deepEqual(selectedScriptureVerses(["scripture-isaiah-53", "scripture-isaiah-53-v1"], "isaiah"), [{ chapter: 53, verse: 1 }]);
  assert.deepEqual(selectedScriptureVerses(["scripture-isaiah-53", "cfm-panel-scripture"], "isaiah"), [], "no verse at all");
});

test("the selection's reference names each chapter's verses", () => {
  assert.equal(formatScriptureSelection("Isaiah", [{ chapter: 53, verse: 4 }]), "Isaiah 53:4");
  assert.equal(
    formatScriptureSelection("Isaiah", [
      { chapter: 53, verse: 4 },
      { chapter: 53, verse: 5 },
      { chapter: 53, verse: 6 },
    ]),
    "Isaiah 53:4–6"
  );
  assert.equal(
    formatScriptureSelection("1 Nephi", [
      { chapter: 52, verse: 13 },
      { chapter: 52, verse: 14 },
      { chapter: 52, verse: 15 },
      { chapter: 53, verse: 1 },
      { chapter: 53, verse: 2 },
    ]),
    "1 Nephi 52:13–15; 53:1–2"
  );
});

test("a quick mark writes each chapter's verses under the standard reader's identity", () => {
  // The guides' canonical volume id is stored as the standard reader's route slug, one write per chapter.
  const writes = selectionMarkWrites({ volume: "doctrineandcovenants", slug: "sections" }, [
    { chapter: 2, verse: 3 },
    { chapter: 3, verse: 1 },
    { chapter: 3, verse: 2 },
  ]);
  assert.deepEqual(writes, [
    { target: { volume: "dnc", book: "sections", chapter: 2 }, verses: [3] },
    { target: { volume: "dnc", book: "sections", chapter: 3 }, verses: [1, 2] },
  ]);
  assert.deepEqual(versesByChapter([]), []);
});

test("a quick mark across a chapter break marks every selected verse alike, and keeps notes", () => {
  const row = (verse, extra = {}) => ({
    id: `r${verse}`,
    verse,
    body: "",
    visibility: "private",
    highlight_color: null,
    user_id: "me",
    is_mine: true,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...extra,
  });
  const someoneElse = { ...row(1), id: "theirs", user_id: "them", is_mine: false, highlight_color: "red" };
  // Isaiah 52:15 has a note and a yellow highlight; 53:1 has nothing of the reader's; 53:2 is underlined blue.
  let data = {
    52: { by_verse: { 14: [row(14, { highlight_color: "green" })], 15: [row(15, { body: "Kings shall shut their mouths", highlight_color: "yellow" })] } },
    53: { by_verse: { 1: [someoneElse], 2: [row(2, { underline: true, underline_color: "blue" })] } },
  };
  const selected = [
    { chapter: 52, verse: 15 },
    { chapter: 53, verse: 1 },
    { chapter: 53, verse: 2 },
  ];
  const writes = selectionMarkWrites({ volume: "oldtestament", slug: "isaiah" }, selected);
  /** What the menu does on a preset: one patch from the whole selection, applied chapter by chapter. */
  const mark = (preset) => {
    const { rows } = collectChapterAnnotations([52, 53], data);
    const marks = selectionMarks(selected.map(({ chapter, verse }) => rows.get(verseKey(chapter, verse))?.find((each) => each.is_mine)));
    const patch = quickMarkPatch(preset, marks);
    for (const { target, verses } of writes) data = { ...data, [target.chapter]: withVerseMarks(data[target.chapter], verses, patch) };
    return { marks, patch };
  };
  const mine = (chapter, verse) => data[chapter].by_verse[verse]?.find((each) => each.is_mine);
  const yellow = { kind: "highlight", color: "yellow" };

  // Yellow is on only some selected verses ("mixed"), so it goes on all of them, in both chapters.
  assert.equal(mark(yellow).marks.highlight, "mixed");
  for (const { chapter, verse } of selected) assert.equal(mine(chapter, verse)?.highlight_color, "yellow", `${chapter}:${verse}`);
  assert.equal(mine(52, 15).body, "Kings shall shut their mouths", "a quick mark never touches a note");
  assert.equal(mine(53, 2).underline_color, "blue", "a highlight never touches the underline");
  assert.equal(mine(52, 14).highlight_color, "green", "an unselected verse is untouched");
  assert.equal(data[53].by_verse[1].find((each) => !each.is_mine)?.highlight_color, "red", "another reader's row is untouched");
  assert.equal(data[52].by_verse[1], undefined, "no row crosses into the other chapter's verse numbers");

  // Now on every selected verse: the same preset takes it off them all. A verse left with nothing is removed.
  assert.deepEqual(mark(yellow).patch, { highlightColor: null });
  assert.equal(mine(52, 15)?.body, "Kings shall shut their mouths", "the note keeps its row");
  assert.equal(mine(52, 15)?.highlight_color, null);
  assert.equal(mine(53, 1), undefined, "a mark-only row with no marks left is gone");
  assert.equal(mine(53, 2)?.underline_color, "blue");

  // An underline preset changes only underlines, on every selected verse.
  assert.deepEqual(mark({ kind: "underline", color: "red" }).patch, { underlineColor: "red" });
  for (const { chapter, verse } of selected) assert.equal(mine(chapter, verse)?.underline_color, "red", `${chapter}:${verse}`);
});

test("each chapter's annotations stay with that chapter, and count only once loaded", () => {
  const row = (id, verse, color = null) => ({
    id,
    verse,
    body: color ? "" : "A note",
    visibility: "private",
    highlight_color: color,
    user_id: "me",
    is_mine: true,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  });
  const { rows, loaded } = collectChapterAnnotations([52, 53, 54, 55], {
    52: { by_verse: { 1: [row("a", 1, "yellow")] } },
    53: { by_verse: { 1: [row("b", 1)], 2: [] } },
    54: undefined, // still loading
    55: new Error("query failed"),
    56: { by_verse: { 1: [row("stray", 1)] } }, // not a chapter on this page
  });
  assert.deepEqual([...loaded].sort(), [52, 53]);
  assert.equal(rows.get(verseKey(52, 1))[0].id, "a");
  assert.equal(rows.get(verseKey(53, 1))[0].id, "b");
  assert.equal(rows.has(verseKey(53, 2)), false, "an empty verse has no rows");
  assert.equal(rows.has(verseKey(56, 1)), false);
  assert.equal(rows.size, 2);
});
