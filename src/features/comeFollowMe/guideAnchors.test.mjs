import assert from "node:assert/strict";
import test from "node:test";
import { guideHighlightProblem, sameGuideAnchor } from "../../../convex/annotationRules.ts";
import { describeSpan, isGuideHighlight, locate, resolveAnchor } from "./guideAnchors.ts";

/** A part's text index from [blockId | null, text] pieces, the way the live guide's text nodes join up. */
function build(pieces) {
  let text = "";
  const anchors = [];
  for (const [id, body] of pieces) {
    if (id) anchors.push({ id, start: text.length });
    text += body;
  }
  return { text, anchors };
}

/** The [start, end) of the nth occurrence of `quote`. */
function spanOf(index, quote, nth = 0) {
  let at = -1;
  for (let i = 0; i <= nth; i += 1) at = index.text.indexOf(quote, at + 1);
  assert.notEqual(at, -1, `"${quote}" #${nth} is in the text`);
  return [at, at + quote.length];
}

function anchorFor(index, from, to) {
  const described = describeSpan(index, from, to);
  assert.equal(described.ok, true);
  return described.anchor;
}

const guide = build([
  [null, "Before the first heading. "],
  ["comfort-ye", "Comfort ye, comfort ye my people. "],
  ["cfm-v-40-2", "Speak ye comfortably to Jerusalem, and cry unto her."],
]);

test("a selection is its block, offsets, exact text, and context, trimmed of outer whitespace", () => {
  const [start, end] = spanOf(guide, " comfort ye my people. ");
  const anchor = anchorFor(guide, start, end);
  assert.equal(anchor.exact, "comfort ye my people.");
  assert.equal(anchor.startBlock, "comfort-ye");
  assert.equal(anchor.startOffset, "Comfort ye, ".length);
  assert.equal(anchor.endBlock, "comfort-ye");
  assert.equal(anchor.endOffset - anchor.startOffset, anchor.exact.length);
  assert.ok(anchor.prefix.endsWith("Comfort ye, "));
  assert.ok(anchor.suffix.startsWith(" Speak ye"));
  assert.ok(anchor.prefix.length <= 32 && anchor.suffix.length <= 32);
  assert.deepEqual(resolveAnchor(guide, anchor), { start: start + 1, end: end - 1 });
});

test("nothing to highlight, or too much", () => {
  const blank = build([[null, "Text.   \n  More."]]);
  assert.deepEqual(describeSpan(blank, 5, 11), { ok: false, reason: "empty" });
  const long = build([[null, "word ".repeat(1000)]]);
  assert.deepEqual(describeSpan(long, 0, long.text.length), { ok: false, reason: "too-long" });
});

test("a span ending exactly where the next block starts belongs to its own block", () => {
  const index = build([["a", "Comfort ye."], ["b", "Speak ye."]]);
  const anchor = anchorFor(index, 0, "Comfort ye.".length);
  assert.equal(anchor.startBlock, "a");
  assert.equal(anchor.endBlock, "a");
  assert.equal(anchor.endOffset, "Comfort ye.".length);
});

test("a span across blocks keeps a start and an end anchor, and survives text added earlier", () => {
  const [start] = spanOf(guide, "my people");
  const [, end] = spanOf(guide, "Speak ye");
  const anchor = anchorFor(guide, start, end);
  assert.equal(anchor.startBlock, "comfort-ye");
  assert.equal(anchor.endBlock, "cfm-v-40-2");
  assert.equal(anchor.exact, "my people. Speak ye");
  assert.deepEqual(resolveAnchor(guide, anchor), { start, end });

  // New prose before both blocks moves every offset in the part; block-relative points don't move.
  const edited = build([
    [null, "A new opening paragraph was added here. Before the first heading. "],
    ["comfort-ye", "Comfort ye, comfort ye my people. "],
    ["cfm-v-40-2", "Speak ye comfortably to Jerusalem, and cry unto her."],
  ]);
  const [newStart] = spanOf(edited, "my people");
  assert.deepEqual(resolveAnchor(edited, anchor), { start: newStart, end: newStart + anchor.exact.length });
});

test("repeated text resolves to the copy whose context matches, even when its block id is gone", () => {
  const index = build([
    ["first", "Thus saith the Lord unto the isles. "],
    ["second", "Then said I, thus saith the Lord unto the people of Zion. "],
  ]);
  const [start, end] = spanOf(index, "thus saith the Lord", 0); // lowercase: only in "second"
  const anchor = anchorFor(index, start, end);
  const [start2, end2] = spanOf(index, "the Lord", 1);
  const second = anchorFor(index, start2, end2);
  assert.deepEqual(resolveAnchor(index, second), { start: start2, end: end2 });

  // The heading id changed and a sentence was added earlier in the part: the recorded place is gone, so
  // the quote is found by its context, and it is the second "the Lord", not the first.
  const edited = build([
    ["first", "An added sentence. Thus saith the Lord unto the isles. "],
    ["second-renamed", "Then said I, thus saith the Lord unto the people of Zion. "],
  ]);
  const [expected] = spanOf(edited, "the Lord", 1);
  assert.deepEqual(resolveAnchor(edited, second), { start: expected, end: expected + "the Lord".length });
  assert.ok(resolveAnchor(edited, anchor), "the unique lowercase phrase is found too");
});

test("text that is ambiguous, gone, or changed is left unplaced, never put on other prose", () => {
  const pad = "And it shall come to pass in that day, ";
  const refrain = "the remnant shall return";
  const tail = " unto the mighty God, the everlasting Father.";
  const twice = build([
    ["one", `${pad}${refrain}${tail} `],
    ["two", `${pad}${refrain}${tail}`],
  ]);
  const [start, end] = spanOf(twice, refrain, 1);
  const anchor = anchorFor(twice, start, end);
  assert.deepEqual(resolveAnchor(twice, anchor), { start, end }, "its recorded place still decides");

  // Same text, but the block ids are gone: two places fit equally well, so neither is chosen.
  const renamed = build([
    ["uno", `${pad}${refrain}${tail} `],
    ["dos", `${pad}${refrain}${tail}`],
  ]);
  assert.equal(resolveAnchor(renamed, anchor), null);

  // The highlighted words themselves changed.
  const changed = build([
    ["one", `${pad}${refrain}${tail} `],
    ["two", `${pad}a remnant shall return${tail}`],
  ]);
  const [s1, e1] = spanOf(twice, refrain, 0);
  const firstAnchor = anchorFor(twice, s1, e1);
  assert.deepEqual(resolveAnchor(changed, firstAnchor), { start: s1, end: e1 }, "the untouched copy still resolves");
  const otherAnchor = { ...anchor, startBlock: "gone", endBlock: "gone" };
  assert.equal(resolveAnchor(build([["x", "Nothing like it here."]]), otherAnchor), null);
});

test("a unique quote is recovered on one side of context, not on none", () => {
  const index = build([["p", "He giveth power to the faint; and to them that have no might he increaseth strength."]]);
  const [start, end] = spanOf(index, "power to the faint");
  const anchor = { ...anchorFor(index, start, end), startBlock: "missing", endBlock: "missing" };
  const prefixChanged = build([["p", "Indeed he gives power to the faint; and to them that have no might he increaseth strength."]]);
  const [at] = spanOf(prefixChanged, "power to the faint");
  assert.deepEqual(resolveAnchor(prefixChanged, anchor), { start: at, end: at + anchor.exact.length });
  const bothChanged = build([["p", "Indeed he gives power to the faint, always."]]);
  assert.equal(resolveAnchor(bothChanged, anchor), null);
});

test("the same words at the saved offset are not the highlight when the original copy is gone", () => {
  // Review reproduction: the second "the Lord" was highlighted; the passage was rewritten so that its copy
  // is gone and the first copy now sits at the saved offset, with different text on both sides.
  const original = { text: "A the Lord B. C the Lord D.", anchors: [{ id: "section", start: 0 }] };
  const anchor = anchorFor(original, 16, 24);
  assert.equal(anchor.exact, "the Lord");
  assert.equal(anchor.prefix, "A the Lord B. C ");
  assert.equal(anchor.suffix, " D.");
  assert.deepEqual(resolveAnchor(original, anchor), { start: 16, end: 24 }, "unchanged text still resolves in place");
  const rewritten = { text: "XXXXXXXXXXXXXXXXthe Lord B.", anchors: [{ id: "section", start: 0 }] };
  assert.equal(rewritten.text.slice(16, 24), "the Lord", "the saved offset holds the same words");
  assert.equal(resolveAnchor(rewritten, anchor), null);
});

test("a unique quote at its old offset with both sides changed is not placed", () => {
  const before = build([["p", "Then shall the lame man leap as an hart, and the tongue of the dumb sing: for in the wilderness."]]);
  const [start, end] = spanOf(before, "the tongue of the dumb sing");
  const anchor = anchorFor(before, start, end);
  // Same length on each side, so the quote is still exactly at its recorded block offset.
  const after = build([["p", "Xxxx xxxxx xxx xxxx xxx xxxx xx xx xxxx, xxx the tongue of the dumb sing; xxx xx xxx xxxxxxxxxx."]]);
  assert.equal(after.text.slice(start, end), anchor.exact);
  assert.equal(resolveAnchor(after, anchor), null);
  // One side intact at the same place is still this span (an edit after the quote, say).
  const editedAfter = build([["p", `${before.text.slice(0, end)}; something else entirely follows here now.`]]);
  assert.deepEqual(resolveAnchor(editedAfter, anchor), { start, end });
});

test("a short or empty context means the edge of the part", () => {
  const index = build([[null, "Comfort ye my people, saith your God."]]);
  const atStart = anchorFor(index, 0, "Comfort ye".length);
  assert.equal(atStart.prefix, "", "nothing before the part's first words");
  assert.deepEqual(resolveAnchor(index, atStart), { start: 0, end: "Comfort ye".length });
  const atEnd = anchorFor(index, index.text.indexOf("your God."), index.text.length);
  assert.equal(atEnd.suffix, "");
  assert.deepEqual(resolveAnchor(index, atEnd), { start: index.text.indexOf("your God."), end: index.text.length });

  // Text added before the part's start: the empty prefix no longer holds, but the unchanged suffix still
  // identifies the only copy.
  const prepended = build([[null, "A new first line. Comfort ye my people, saith your God."]]);
  const at = prepended.text.indexOf("Comfort ye");
  assert.deepEqual(resolveAnchor(prepended, atStart), { start: at, end: at + "Comfort ye".length });
  // An empty prefix is not "any text": the only copy, now mid-part and with a different suffix, has
  // neither side of its context, so it is not placed.
  const elsewhere = build([[null, "Then: Comfort ye all."]]);
  assert.equal(resolveAnchor(elsewhere, atStart), null);
});

test("positions land in the text node holding the character, skipping empty nodes", () => {
  // Nodes: "Hello" [0,5), "" at 5, " big" [5,9), "!!!" [9,12).
  const starts = [0, 5, 5, 9];
  const lengths = [5, 0, 4, 3];
  assert.deepEqual(locate(starts, lengths, 0, "start"), { node: 0, offset: 0 });
  assert.deepEqual(locate(starts, lengths, 5, "start"), { node: 2, offset: 0 }, "a start at a boundary begins the next node");
  assert.deepEqual(locate(starts, lengths, 5, "end"), { node: 0, offset: 5 }, "an end at a boundary closes the previous node");
  assert.deepEqual(locate(starts, lengths, 12, "end"), { node: 3, offset: 3 });
  assert.deepEqual(locate(starts, lengths, 7, "start"), { node: 2, offset: 2 });
});

test("the server accepts only well-formed guide anchors and treats the same span as one highlight", () => {
  const valid = {
    guide: "2026-10-05",
    part: "reader",
    startBlock: "comfort-ye",
    startOffset: 12,
    endBlock: "comfort-ye",
    endOffset: 33,
    exact: "comfort ye my people.",
    prefix: "Comfort ye, ",
    suffix: " Speak ye",
  };
  assert.equal(guideHighlightProblem(valid), null);
  assert.equal(guideHighlightProblem({ ...valid, startBlock: "", endBlock: "cfm-v-40-2", endOffset: 5 }), null, "across blocks");
  assert.notEqual(guideHighlightProblem({ ...valid, guide: "../2026-10-05" }), null);
  assert.notEqual(guideHighlightProblem({ ...valid, part: "scripture" }), null);
  assert.notEqual(guideHighlightProblem({ ...valid, startBlock: "has space" }), null);
  assert.notEqual(guideHighlightProblem({ ...valid, startOffset: -1 }), null);
  assert.notEqual(guideHighlightProblem({ ...valid, endOffset: 33.5 }), null);
  assert.notEqual(guideHighlightProblem({ ...valid, endOffset: 34 }), null, "same block, wrong length");
  assert.notEqual(guideHighlightProblem({ ...valid, exact: "   ", endOffset: 15 }), null);
  assert.notEqual(guideHighlightProblem({ ...valid, prefix: "x".repeat(65) }), null);
  const long = "x".repeat(4001);
  assert.notEqual(guideHighlightProblem({ ...valid, exact: long, endOffset: 12 + long.length }), null);

  assert.equal(sameGuideAnchor(valid, { ...valid, prefix: "different context" }), true, "same span, same highlight");
  assert.equal(sameGuideAnchor(valid, { ...valid, startOffset: 13, endOffset: 34 }), false);
  assert.equal(sameGuideAnchor(valid, { ...valid, part: "introduction" }), false);
});

test("query rows are checked before use", () => {
  const row = {
    id: "h1",
    guide: "2026-10-05",
    part: "introduction",
    startBlock: "",
    startOffset: 0,
    endBlock: "",
    endOffset: 4,
    exact: "Text",
    prefix: "",
    suffix: " more",
    highlightColor: "green",
    updatedAt: "2026-10-05T00:00:00.000Z",
  };
  assert.equal(isGuideHighlight(row), true);
  assert.equal(isGuideHighlight({ ...row, highlightColor: "red" }), false);
  assert.equal(isGuideHighlight({ ...row, part: "scripture" }), false);
  assert.equal(isGuideHighlight({ ...row, exact: undefined }), false);
  assert.equal(isGuideHighlight(null), false);
});
