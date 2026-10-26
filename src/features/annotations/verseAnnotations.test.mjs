import assert from "node:assert/strict";
import test from "node:test";
import {
  annotationProblem,
  applyVerseMarks,
  DEFAULT_MARK_PRESETS,
  MARK_PRESET_NAME_MAX,
  MARK_PRESETS_MAX,
  markPresetsProblem,
  normalizeAnnotationBody,
  normalizeMarkPresetName,
  normalizeMarkPresets,
  readMarkPresets,
  sameMarkPreset,
  sameNamedMarkPreset,
  verseMarksProblem,
} from "../../../convex/annotationRules.ts";
import {
  annotationChapter,
  annotationSummary,
  highlightOf,
  markPresetFullLabel,
  markPresetLabel,
  markPresetPhrase,
  myAnnotationsByVerse,
  presetState,
  quickMarkPatch,
  selectionMarks,
  underlineColorOf,
  underlineOf,
  verseMarkAttributes,
  withVerseMarks,
} from "./verseAnnotations.ts";

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

test("an annotation is any mix of a note, a highlight, and an underline, and never an empty stand-in", () => {
  assert.equal(annotationProblem("A note", undefined), null, "a note alone");
  assert.equal(annotationProblem("A note", "blue"), null, "a note with a highlight");
  assert.equal(annotationProblem("", "yellow"), null, "a highlight alone needs no note text");
  assert.equal(annotationProblem("  \n ", "purple"), null, "whitespace is no note, but the highlight stands");
  assert.notEqual(annotationProblem("", undefined), null, "nothing at all");
  assert.notEqual(annotationProblem(" \t\n", null), null, "only whitespace and no highlight");
  assert.equal(annotationProblem("", undefined, true), null, "an underline alone needs no note text");
  assert.equal(annotationProblem(" \n", null, true), null, "whitespace is no note, but the underline stands");
  assert.equal(annotationProblem("", "pink", true), null, "a highlight and an underline together");
  assert.equal(annotationProblem("A note", undefined, true), null, "a note with an underline");
  assert.notEqual(annotationProblem("", undefined, false), null, "no note, no highlight, not underlined");
  assert.notEqual(annotationProblem("", undefined, null), null, "a legacy caller's missing underline is no underline");
  assert.notEqual(annotationProblem("x".repeat(1201), undefined, true), null, "too long, underlined or not");
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

const annotation = (extra = {}) => ({
  id: "a",
  verse: 7,
  body: "",
  visibility: "private",
  highlight_color: null,
  user_id: "me",
  is_mine: true,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  ...extra,
});

test("a verse's text is marked by its highlight and underline, alone or together", () => {
  assert.deepEqual(verseMarkAttributes(annotation({ highlight_color: "yellow" })), { "data-verse-highlight": "yellow" });
  assert.deepEqual(verseMarkAttributes(annotation({ underline: true, underline_color: "green" })), { "data-verse-underline": "green" });
  assert.deepEqual(verseMarkAttributes(annotation({ highlight_color: "blue", underline: true, underline_color: "pink", body: "A note" })), {
    "data-verse-highlight": "blue",
    "data-verse-underline": "pink",
  });
  assert.deepEqual(verseMarkAttributes(annotation({ highlight_color: "red" })), { "data-verse-highlight": "red" });
  // A note alone marks no text (its card shows it), and no annotation marks nothing.
  assert.equal(verseMarkAttributes(annotation({ body: "A note", underline: false })), null);
  assert.equal(verseMarkAttributes(undefined), null);
  assert.equal(verseMarkAttributes(null), null);
});

test("a row from before underlines existed reads as not underlined", () => {
  const legacy = annotation({ highlight_color: "green" });
  assert.equal("underline" in legacy, false);
  assert.equal(underlineOf(legacy), false);
  assert.deepEqual(verseMarkAttributes(legacy), { "data-verse-highlight": "green" });
  assert.equal(underlineOf(undefined), false);
  assert.equal(underlineColorOf(legacy), "none");
  // An underline saved before underlines had colors (or read from an older server) is red.
  assert.equal(underlineColorOf(annotation({ underline: true })), "red");
  assert.equal(underlineColorOf(annotation({ underline: true, underline_color: null })), "red");
  assert.deepEqual(verseMarkAttributes(annotation({ underline: true })), { "data-verse-underline": "red" });
  // A stray color with no underline is no underline.
  assert.equal(underlineColorOf(annotation({ underline: false, underline_color: "blue" })), "none");
});

test("an annotation's summary names what it holds, in its colors", () => {
  assert.equal(annotationSummary(annotation({ highlight_color: "pink" })), "Pink highlight only");
  assert.equal(annotationSummary(annotation({ underline: true })), "Red underline only");
  assert.equal(annotationSummary(annotation({ highlight_color: "pink", underline: true, underline_color: "blue" })), "Pink highlight and blue underline");
  assert.equal(annotationSummary(annotation({ body: "Ruth's vow", underline: true, underline_color: "green" })), "Note with green underline");
  assert.equal(annotationSummary(annotation({ body: "Ruth's vow" })), "Note");
  assert.equal(markPresetLabel({ kind: "underline", color: "purple" }), "Purple underline");
});

const quickRow = (verse, extra = {}) => ({
  id: `id-${verse}`,
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

test("the selection menu reads the marks the selected verses share, or that they differ", () => {
  assert.deepEqual(selectionMarks([undefined, quickRow(2, { body: "A note" })]), {
    highlight: "none",
    underline: "none",
    highlights: [],
    underlines: [],
  });
  assert.deepEqual(
    selectionMarks([
      quickRow(1, { highlight_color: "pink", underline: true, underline_color: "green" }),
      quickRow(2, { highlight_color: "pink", underline: true, underline_color: "green" }),
    ]),
    { highlight: "pink", underline: "green", highlights: ["pink"], underlines: ["green"] }
  );
  assert.deepEqual(
    selectionMarks([
      quickRow(1, { highlight_color: "purple" }),
      undefined,
      quickRow(3, { highlight_color: "blue", underline: true }),
      quickRow(4, { underline: true, underline_color: "yellow" }),
    ]),
    { highlight: "mixed", underline: "mixed", highlights: ["blue", "purple"], underlines: ["red", "yellow"] }
  );
});

test("a preset is on when every selected verse has it, mixed when some do", () => {
  const marks = selectionMarks([
    quickRow(1, { highlight_color: "yellow", underline: true, underline_color: "red" }),
    quickRow(2, { highlight_color: "blue", underline: true, underline_color: "red" }),
  ]);
  assert.equal(presetState({ kind: "underline", color: "red" }, marks), true);
  assert.equal(presetState({ kind: "highlight", color: "yellow" }, marks), "mixed");
  assert.equal(presetState({ kind: "highlight", color: "red" }, marks), false, "a red underline is not a red highlight");
  assert.equal(presetState({ kind: "underline", color: "yellow" }, marks), false, "a yellow highlight is not a yellow underline");
});

test("a preset sets its mark on every selected verse, or removes it when all already have it", () => {
  const none = selectionMarks([undefined, undefined]);
  const allYellow = selectionMarks([quickRow(1, { highlight_color: "yellow" }), quickRow(2, { highlight_color: "yellow" })]);
  const someYellow = selectionMarks([quickRow(1, { highlight_color: "yellow" }), undefined]);
  const yellowHighlight = { kind: "highlight", color: "yellow" };
  assert.deepEqual(quickMarkPatch(yellowHighlight, none), { highlightColor: "yellow" });
  assert.deepEqual(quickMarkPatch(yellowHighlight, allYellow), { highlightColor: null });
  assert.deepEqual(quickMarkPatch(yellowHighlight, someYellow), { highlightColor: "yellow" });
  assert.deepEqual(quickMarkPatch({ kind: "highlight", color: "blue" }, allYellow), { highlightColor: "blue" });
  // An underline preset names only the underline: the yellow highlight is untouched.
  assert.deepEqual(quickMarkPatch({ kind: "underline", color: "yellow" }, allYellow), { underlineColor: "yellow" });

  const allRedUnderline = selectionMarks([quickRow(1, { underline: true }), quickRow(2, { underline: true, underline_color: "red" })]);
  const someRedUnderline = selectionMarks([quickRow(1, { underline: true }), undefined]);
  assert.deepEqual(quickMarkPatch({ kind: "underline", color: "red" }, none), { underlineColor: "red" });
  assert.deepEqual(quickMarkPatch({ kind: "underline", color: "red" }, someRedUnderline), { underlineColor: "red" });
  assert.deepEqual(quickMarkPatch({ kind: "underline", color: "red" }, allRedUnderline), { underline: false });
  // Another color changes the underline's color rather than removing it.
  assert.deepEqual(quickMarkPatch({ kind: "underline", color: "green" }, allRedUnderline), { underlineColor: "green" });
  assert.deepEqual(quickMarkPatch({ kind: "highlight", color: "red" }, allRedUnderline), { highlightColor: "red" });
});

test("a quick mark changes only the marks it names, and never a note", () => {
  const noted = { body: "Thy people", highlightColor: "pink", underline: true, underlineColor: "blue" };
  assert.deepEqual(applyVerseMarks(noted, { highlightColor: null }), {
    highlightColor: undefined,
    underline: true,
    underlineColor: "blue",
    keep: true,
  });
  assert.deepEqual(applyVerseMarks(noted, { underlineColor: "green" }), {
    highlightColor: "pink",
    underline: true,
    underlineColor: "green",
    keep: true,
  });
  assert.deepEqual(applyVerseMarks(noted, { underline: false, highlightColor: null }), {
    highlightColor: undefined,
    underline: false,
    underlineColor: undefined,
    keep: true,
  });
  assert.deepEqual(applyVerseMarks({ body: "", highlightColor: "blue" }, { highlightColor: null }), {
    highlightColor: undefined,
    underline: false,
    underlineColor: undefined,
    keep: false,
  });
  // Callers from before underlines had colors: true keeps a saved color, or adds red.
  assert.deepEqual(applyVerseMarks(null, { underline: true }), { highlightColor: undefined, underline: true, underlineColor: "red", keep: true });
  assert.deepEqual(applyVerseMarks(noted, { underline: true }).underlineColor, "blue");
  assert.deepEqual(applyVerseMarks({ body: "", underline: true }, { highlightColor: "red" }), {
    highlightColor: "red",
    underline: true,
    underlineColor: "red",
    keep: true,
  });
  assert.equal(verseMarksProblem([1], {}), "Choose a highlight or an underline");
  assert.equal(verseMarksProblem([1], { underlineColor: "pink" }), null);
  assert.equal(verseMarksProblem([1], { underline: false, underlineColor: "pink" }), "An underline that is off has no color");
  assert.equal(verseMarksProblem([], { underline: true }), "Select a verse to mark");
  assert.equal(verseMarksProblem([0], { underline: true }), "Unknown verse");
  assert.equal(verseMarksProblem([3, 4], { highlightColor: null }), null);
});

test("an optimistic quick mark matches the saved result on the viewer's rows only", () => {
  const theirs = { ...quickRow(5, { highlight_color: "green" }), id: "theirs", is_mine: false, user_id: "someone" };
  const data = {
    by_verse: {
      4: [quickRow(4, { body: "A note", underline: true })],
      5: [theirs],
      6: [quickRow(6, { highlight_color: "blue" })],
    },
  };
  const now = "2026-10-25T00:00:00.000Z";
  const marked = withVerseMarks(data, [4, 5, 6, 6], { highlightColor: "yellow" }, now);
  assert.deepEqual(marked.by_verse[4], [
    { ...data.by_verse[4][0], highlight_color: "yellow", underline: true, underline_color: "red", updated_at: now },
  ]);
  assert.equal(marked.by_verse[5].length, 2);
  assert.deepEqual(marked.by_verse[5][1], theirs);
  assert.equal(marked.by_verse[5][0].is_mine, true);
  assert.equal(marked.by_verse[6][0].highlight_color, "yellow");
  assert.deepEqual(data.by_verse[6][0].highlight_color, "blue", "the cached result itself is left alone");

  const underlined = withVerseMarks(marked, [4, 6], { underlineColor: "purple" }, now);
  assert.deepEqual(
    [4, 6].map((verse) => [underlined.by_verse[verse][0].highlight_color, underlined.by_verse[verse][0].underline_color]),
    [["yellow", "purple"], ["yellow", "purple"]]
  );
  assert.equal(underlined.by_verse[4][0].body, "A note");

  const cleared = withVerseMarks(underlined, [4, 5, 6], { highlightColor: null, underline: false }, now);
  assert.equal(cleared.by_verse[4][0].body, "A note");
  assert.equal(cleared.by_verse[4][0].underline_color, null);
  assert.deepEqual(cleared.by_verse[5], [theirs]);
  assert.equal(cleared.by_verse[6], undefined);
});

test("mark presets: defaults, the earlier choice carried over, an empty list kept, each pair once and in order", () => {
  assert.deepEqual(readMarkPresets(undefined), DEFAULT_MARK_PRESETS);
  assert.deepEqual(readMarkPresets({}), DEFAULT_MARK_PRESETS);
  assert.deepEqual(readMarkPresets({ markPresets: "yellow" }), DEFAULT_MARK_PRESETS);
  assert.deepEqual(readMarkPresets({ markPresets: [] }), []);
  assert.deepEqual(readMarkPresets({ markPresets: [], quickMarks: ["yellow"] }), [], "saved presets win over the earlier choice");
  assert.deepEqual(readMarkPresets({ quickMarks: ["underline", "orange", "blue", "blue"] }), [
    { kind: "highlight", color: "blue" },
    { kind: "underline", color: "red" },
  ]);
  assert.deepEqual(readMarkPresets({ quickMarks: [] }), []);
  assert.equal(DEFAULT_MARK_PRESETS.find((preset) => preset.kind === "underline")?.color, "red");
  // A fresh copy each time, so a caller can't change the defaults.
  assert.notEqual(readMarkPresets(null), readMarkPresets(null));

  assert.equal(normalizeMarkPresets(undefined), null);
  assert.deepEqual(
    normalizeMarkPresets([
      { kind: "underline", color: "red" },
      { kind: "highlight", color: "red" },
      { kind: "underline", color: "red" },
      { kind: "strike", color: "red" },
      { kind: "highlight", color: "orange" },
      null,
      "yellow",
      { kind: "highlight", color: "yellow", extra: true },
    ]),
    [
      { kind: "underline", color: "red" },
      { kind: "highlight", color: "red" },
      { kind: "highlight", color: "yellow" },
    ]
  );
  const colors = ["red", "yellow", "blue", "green", "pink", "purple"];
  const every = ["highlight", "underline"].flatMap((kind) => colors.map((color) => ({ kind, color })));
  assert.equal(MARK_PRESETS_MAX, 12);
  assert.deepEqual(normalizeMarkPresets([...every, ...every]), every);
});

test("a preset name is trimmed to single spaces, an empty one is no name, and over the limit is refused", () => {
  assert.equal(normalizeMarkPresetName("  Blessings  "), "Blessings");
  assert.equal(normalizeMarkPresetName("Promised\n\t  blessings"), "Promised blessings");
  assert.equal(normalizeMarkPresetName("   "), undefined);
  assert.equal(normalizeMarkPresetName(""), undefined);
  assert.equal(normalizeMarkPresetName(null), undefined);
  assert.equal(normalizeMarkPresetName(7), undefined);

  const yellow = { kind: "highlight", color: "yellow" };
  const fits = "x".repeat(MARK_PRESET_NAME_MAX);
  assert.equal(MARK_PRESET_NAME_MAX, 40);
  assert.equal(markPresetsProblem([{ ...yellow, name: fits }]), null);
  // Surrounding whitespace doesn't count against the limit.
  assert.equal(markPresetsProblem([{ ...yellow, name: `   ${fits}   ` }]), null);
  assert.equal(markPresetsProblem([{ ...yellow, name: `${fits}y` }]), "Keep each quick mark name to 40 characters");
  assert.match(markPresetsProblem(new Array(MARK_PRESETS_MAX + 1).fill(yellow)), /up to 12/);
});

test("named presets: stored without empty names, each pair once (its first name), never named by default", () => {
  assert.deepEqual(
    normalizeMarkPresets([
      { kind: "highlight", color: "yellow", name: "  Blessings " },
      { kind: "underline", color: "red", name: "   " },
      { kind: "highlight", color: "yellow", name: "Duplicate pair" },
      { kind: "underline", color: "blue", name: `${"c".repeat(45)}` },
    ]),
    [
      { kind: "highlight", color: "yellow", name: "Blessings" },
      { kind: "underline", color: "red" },
      // A stored or local copy over the limit (only by tampering) is cut to fit rather than lost.
      { kind: "underline", color: "blue", name: "c".repeat(MARK_PRESET_NAME_MAX) },
    ]
  );
  const unnamed = (presets) => presets.every((preset) => !("name" in preset));
  assert.ok(unnamed(DEFAULT_MARK_PRESETS));
  assert.ok(unnamed(readMarkPresets(null)));
  assert.ok(unnamed(readMarkPresets({ quickMarks: ["yellow", "underline"] })));
  // The name survives a round trip through normalization.
  const named = [{ kind: "underline", color: "green", name: "Commandments" }];
  assert.deepEqual(readMarkPresets({ markPresets: named }), named);
  assert.deepEqual(normalizeMarkPresets(normalizeMarkPresets(named)), named);
});

test("a preset's identity is its mark; a rename is still a change to save", () => {
  const plain = { kind: "highlight", color: "blue" };
  const named = { ...plain, name: "Promises" };
  assert.equal(sameMarkPreset(plain, named), true);
  assert.equal(sameNamedMarkPreset(plain, named), false);
  assert.equal(sameNamedMarkPreset(named, { ...plain, name: "Promises" }), true);
  assert.equal(sameNamedMarkPreset(named, { ...plain, name: "Covenants" }), false);
  assert.equal(sameNamedMarkPreset(plain, { ...plain }), true);
});

test("a named preset says its style too, and marks exactly as its unnamed pair does", () => {
  const named = { kind: "highlight", color: "yellow", name: "Blessings" };
  const plain = { kind: "highlight", color: "yellow" };
  assert.equal(markPresetLabel(named), "Yellow highlight");
  assert.equal(markPresetFullLabel(named), "Blessings (yellow highlight)");
  assert.equal(markPresetFullLabel(plain), "Yellow highlight");
  assert.equal(markPresetPhrase(named), "Blessings (yellow highlight)");
  assert.equal(markPresetPhrase({ kind: "underline", color: "red" }), "red underline");

  const marks = selectionMarks([quickRow(1, { highlight_color: "yellow" }), quickRow(2)]);
  assert.equal(presetState(named, marks), presetState(plain, marks));
  assert.deepEqual(quickMarkPatch(named, marks), quickMarkPatch(plain, marks));
  const all = selectionMarks([quickRow(1, { highlight_color: "yellow" })]);
  assert.deepEqual(quickMarkPatch(named, all), { highlightColor: null });
});
