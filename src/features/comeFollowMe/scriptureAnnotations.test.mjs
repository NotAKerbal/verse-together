import assert from "node:assert/strict";
import test from "node:test";
import { collectChapterAnnotations, selectionVerse, verseFromScriptureId, verseKey } from "./scriptureAnnotations.ts";

test("a verse's identity comes from its own scripture-pane id", () => {
  assert.deepEqual(verseFromScriptureId("scripture-isaiah-53-v4", "isaiah"), { chapter: 53, verse: 4 });
  assert.equal(verseFromScriptureId("scripture-isaiah-53", "isaiah"), null, "a chapter heading is no verse");
  assert.equal(verseFromScriptureId("scripture-isaiah-53-v4-6", "isaiah"), null, "a range is no single verse");
  assert.equal(verseFromScriptureId("scripture-jeremiah-53-v4", "isaiah"), null, "another book");
  assert.equal(verseFromScriptureId("isaiah-53-v4", "isaiah"), null, "a guide commentary id");
});

test("a selection annotates the verse it starts in, in that verse's own chapter", () => {
  // From Isaiah 52:15 across the chapter break into 53:1–2: the start verse, never 53:15 or 53:1.
  const touched = ["scripture-isaiah-52-v15", "scripture-isaiah-53-v1", "scripture-isaiah-53-v2"];
  assert.deepEqual(selectionVerse("scripture-isaiah-52-v15", touched, "isaiah"), { chapter: 52, verse: 15 });
  // Backwards across the same break is the same range: the DOM range always starts at the earlier point.
  // Starting in chapter 53's heading: the first verse the selection touches.
  assert.deepEqual(
    selectionVerse(null, ["scripture-isaiah-53", "scripture-isaiah-53-v1", "scripture-isaiah-53-v2"], "isaiah"),
    { chapter: 53, verse: 1 }
  );
  assert.equal(selectionVerse(null, ["scripture-isaiah-53"], "isaiah"), null, "no verse at all");
  assert.equal(selectionVerse("cfm-panel-scripture", [], "isaiah"), null);
});

test("the touched verses are only read as far as needed", () => {
  let read = 0;
  function* touched() {
    for (const id of ["scripture-isaiah-50-v1", "scripture-isaiah-50-v2", "scripture-isaiah-50-v3"]) {
      read += 1;
      yield id;
    }
  }
  assert.deepEqual(selectionVerse(null, touched(), "isaiah"), { chapter: 50, verse: 1 });
  assert.equal(read, 1);
  read = 0;
  selectionVerse("scripture-isaiah-50-v2", touched(), "isaiah");
  assert.equal(read, 0, "a selection starting in a verse never walks the pane");
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
