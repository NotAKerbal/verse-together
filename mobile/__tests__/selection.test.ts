import {
  buildScriptureDocument,
  displaySelection,
  documentMarks,
  NOTE_CARD_LABEL,
  selectedWords,
  selectionKey,
  selectionRanges,
  type DocumentVerse,
  type ScriptureDocument,
  type ScriptureStyle,
} from "../src/features/reader/scriptureDocument";
import { annotationChapter, deviceChapterAnnotations, myAnnotationsByVerse, type VerseAnnotation } from "../src/shared/web";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";

// The map between the continuous native text the reader selects in and each verse's own words: UTF-16 offsets of
// scripture text only, as the web's selectedVerseRanges and the shared mark rules (convex/annotationRules.ts) use.

const STYLE: ScriptureStyle = {
  body: { font: "serif", size: 16, lineHeight: 28, color: "#000" },
  number: { font: "sans", size: 11.5, color: "#a00" },
  verseSpacing: 24,
  note: { layout: "card", label: { font: "sans", size: 11, color: "#666" }, body: { font: "sans", size: 14, lineHeight: 24, color: "#000" }, gap: 8 },
};

// Alma 32:21–22, as the library has them.
const V21 = "And now as I said concerning faith--faith is not to have a perfect knowledge of things; therefore if ye have faith ye hope for things which are not seen, which are true.";
const V22 = "And now, behold, I say unto you, and I would that ye should remember, that God is merciful unto all who believe on his name; therefore he desireth, in the first place, that ye should believe, yea, even on his word.";

function doc(verses: DocumentVerse[] = [{ verse: 21, text: V21 }, { verse: 22, text: V22 }]) {
  return buildScriptureDocument(verses, STYLE);
}

/** The displayed offsets of the `occurrence`th `phrase` (0-based), as the native view would report them. */
function find(document: ScriptureDocument, phrase: string, occurrence = 0) {
  let at = -1;
  for (let index = 0; index <= occurrence; index++) {
    at = document.text.indexOf(phrase, at + 1);
    if (at < 0) throw new Error(`"${phrase}" #${occurrence} isn't in the text`);
  }
  return { start: at, end: at + phrase.length };
}

const annotation = (patch: Partial<VerseAnnotation>): VerseAnnotation => ({
  id: "a",
  verse: 21,
  body: "",
  visibility: "private",
  highlight_color: null,
  user_id: "device",
  is_mine: true,
  created_at: "",
  updated_at: "",
  ...patch,
});

describe("the scripture text", () => {
  it("shows each verse's number and typeset words, one paragraph per verse", () => {
    const document = doc();
    expect(document.text.startsWith("21  And now as I said concerning faith—faith is not")).toBe(true);
    expect(document.text).toContain("which are true.\n22  And now, behold");
    expect(document.verses.map((region) => document.text.slice(region.start, region.end))).toEqual([V21.replace("--", "—"), V22]);
    expect(document.paragraphs).toHaveLength(2);
    expect(document.paragraphs[0]).toMatchObject({ start: 0, end: document.verses[1].blockStart, spacingAfter: 24 });
    expect(document.paragraphs[1]).toMatchObject({ end: document.text.length, spacingAfter: 0 });
  });

  it("sets a note beneath its verse without counting it as scripture", () => {
    const document = doc([{ verse: 21, text: V21 }, { verse: 22, text: V22, note: "  Remember mercy.  " }]);
    const region = document.verses[1];
    expect(document.text.slice(region.note!.start, region.note!.end)).toBe(`${NOTE_CARD_LABEL}\nRemember mercy.`);
    // Selecting from the verse into its note keeps only the verse's words.
    const ranges = selectionRanges(document, find(document, "his word.").start, document.text.length);
    expect(ranges).toEqual([{ verse: 22, start: V22.indexOf("his word."), end: V22.length, text: V22 }]);
  });
});

describe("a selection's exact words", () => {
  it("maps a word to UTF-16 offsets of the verse's own text", () => {
    const document = doc();
    const { start, end } = find(document, "perfect");
    const ranges = selectionRanges(document, start, end);
    expect(ranges).toEqual([{ verse: 21, start: V21.indexOf("perfect"), end: V21.indexOf("perfect") + 7, text: V21 }]);
    expect(V21.slice(ranges[0].start, ranges[0].end)).toBe("perfect");
  });

  it("tells apart two occurrences of the same word", () => {
    const document = doc();
    const second = selectionRanges(document, find(document, "faith", 1).start, find(document, "faith", 1).end)[0];
    const third = selectionRanges(document, find(document, "faith", 2).start, find(document, "faith", 2).end)[0];
    expect(second.start).toBe(V21.indexOf("--faith") + 2);
    expect(third.start).toBe(V21.lastIndexOf("faith"));
    expect(selectionKey([second])).not.toBe(selectionKey([third]));
  });

  it("maps the em dash back to the source's two hyphens", () => {
    const document = doc();
    const { start, end } = find(document, "faith—faith");
    const [range] = selectionRanges(document, start, end);
    expect(V21.slice(range.start, range.end)).toBe("faith--faith");
    expect(selectedWords([range])).toBe("faith—faith");
    // Starting or ending on the dash itself takes both hyphens.
    const dash = document.text.indexOf("—");
    expect(selectionRanges(document, dash, dash + 1)).toEqual([{ verse: 21, start: V21.indexOf("--"), end: V21.indexOf("--") + 2, text: V21 }]);
  });

  it("crosses verses, keeping a partial first and last verse", () => {
    const document = doc();
    const ranges = selectionRanges(document, find(document, "which are true.").start, find(document, "I say unto you").end);
    expect(ranges).toEqual([
      { verse: 21, start: V21.indexOf("which are true."), end: V21.length, text: V21 },
      { verse: 22, start: 0, end: V22.indexOf("I say unto you") + "I say unto you".length, text: V22 },
    ]);
    expect(selectedWords(ranges)).toBe("which are true. And now, behold, I say unto you");
  });

  it("is the same selection dragged backward", () => {
    const document = doc();
    const { start, end } = find(document, "perfect knowledge");
    expect(selectionRanges(document, end, start)).toEqual(selectionRanges(document, start, end));
  });

  it("never counts a verse number, the line break or edge whitespace", () => {
    const document = doc();
    // From verse 21's last word through verse 22's number: verse 22 isn't selected.
    const end21 = document.verses[0].end;
    expect(selectionRanges(document, end21 - 5, document.verses[1].start).map((range) => range.verse)).toEqual([21]);
    expect(selectionRanges(document, end21 - 5, document.verses[1].start)[0].end).toBe(V21.length);
    // Only a number, or only spaces, is no selection.
    expect(selectionRanges(document, document.verses[1].blockStart, document.verses[1].start)).toEqual([]);
    const space = V21.indexOf(" now");
    expect(selectionRanges(document, document.verses[0].start + space, document.verses[0].start + space + 1)).toEqual([]);
    // " perfect " trims to "perfect".
    const { start, end } = find(document, " perfect ");
    const [trimmed] = selectionRanges(document, start, end);
    expect(V21.slice(trimmed.start, trimmed.end)).toBe("perfect");
    // A collapsed selection is none.
    expect(selectionRanges(document, start, start)).toEqual([]);
  });

  it("keeps an emoji's surrogate pair whole", () => {
    const text = "Joy 😀 cometh in the morning.";
    const document = doc([{ verse: 5, text }]);
    const emoji = document.text.indexOf("😀");
    // A selection ending between the pair's two halves takes the whole emoji.
    const [range] = selectionRanges(document, emoji - 4, emoji + 1);
    expect(text.slice(range.start, range.end)).toBe("Joy 😀");
    expect(range.end - range.start).toBe(6);
    const [after] = selectionRanges(document, emoji + 1, emoji + 9);
    expect(text.slice(after.start, after.end)).toBe("😀 cometh");
  });

  it("finds the same words again in the text (to restore the native selection)", () => {
    const document = doc();
    const selection = { start: find(document, "faith—faith").start, end: find(document, "I say").end };
    const ranges = selectionRanges(document, selection.start, selection.end);
    expect(displaySelection(document, ranges)).toEqual(selection);
    // Not on other words (another translation's text).
    expect(displaySelection(document, [{ ...ranges[0], text: "Other words entirely, now." }])).toBeNull();
  });
});

describe("marks on the exact words", () => {
  it("draws a whole-verse mark over the verse's words only (not its number)", () => {
    const document = doc();
    const marks = documentMarks(document, (verse) => (verse === 21 ? annotation({ highlight_color: "yellow" }) : null));
    expect(marks).toEqual([{ start: document.verses[0].start, end: document.verses[0].end, kind: "highlight", color: "yellow" }]);
  });

  it("draws saved ranges on their words, over the whole-verse mark", () => {
    const document = doc();
    const start = V21.indexOf("perfect");
    const marks = documentMarks(document, (verse) =>
      verse !== 21 ? null : annotation({
        highlight_color: "yellow",
        underline: true,
        underline_color: "red",
        text_marks: [{ start, end: start + 7, text: "perfect", kind: "highlight", color: "blue" }],
      })
    );
    const region = document.verses[0];
    const display = find(document, "perfect");
    expect(marks.filter((mark) => mark.kind === "highlight")).toEqual([
      { start: region.start, end: display.start, kind: "highlight", color: "yellow" },
      { ...display, kind: "highlight", color: "blue" },
      { start: display.end, end: region.end, kind: "highlight", color: "yellow" },
    ]);
    expect(marks.filter((mark) => mark.kind === "underline")).toEqual([{ start: region.start, end: region.end, kind: "underline", color: "red" }]);
  });

  it("maps a range over the em dash to the displayed dash", () => {
    const document = doc();
    const start = V21.indexOf("faith--faith");
    const marks = documentMarks(document, () => annotation({ text_marks: [{ start, end: start + 12, text: "faith--faith", kind: "underline", color: "green" }] }));
    expect(marks).toEqual([{ ...find(document, "faith—faith"), kind: "underline", color: "green" }]);
  });

  it("never draws a range saved on other words", () => {
    const document = doc();
    const marks = documentMarks(document, () => annotation({ text_marks: [{ start: 0, end: 7, text: "Behold,", kind: "highlight", color: "pink" }] }));
    expect(marks).toEqual([]);
  });
});

describe("saving marks on a selection (the shared setVerseMarks rule)", () => {
  const ALMA_32 = annotationChapter("bookofmormon", "alma", 32);
  const saved = (verse: number) => myAnnotationsByVerse(deviceChapterAnnotations(deviceStudy.getSnapshot().annotations, ALMA_32)).get(verse);
  const document = doc();
  const ranges = (phrase: string, occurrence = 0) => {
    const { start, end } = find(document, phrase, occurrence);
    return selectionRanges(document, start, end);
  };
  const mark = (selected: ReturnType<typeof ranges>, patch: object) =>
    deviceStudy.setVerseMarks(ALMA_32, selected.map((range) => range.verse), { ...patch, ranges: selected });

  beforeEach(() => {
    setStoragePort(memoryStorage());
    initDeviceStudy();
  });

  it("marks only the chosen occurrence", () => {
    mark(ranges("faith", 2), { highlightColor: "yellow" });
    const row = saved(21)!;
    expect(row.highlight_color).toBeNull();
    expect(row.text_marks).toEqual([{ start: V21.lastIndexOf("faith"), end: V21.lastIndexOf("faith") + 5, text: "faith", kind: "highlight", color: "yellow" }]);
    const drawn = documentMarks(document, (verse) => saved(verse));
    expect(drawn).toEqual([{ ...find(document, "faith", 2), kind: "highlight", color: "yellow" }]);
  });

  it("removes part of a mark, keeping its neighbours, the note and the other kind", () => {
    deviceStudy.saveAnnotation({ ...ALMA_32, verse: 21 }, "Faith is a seed.", {});
    mark(ranges("perfect knowledge of things"), { highlightColor: "green" });
    mark(ranges("perfect"), { underlineColor: "blue" });
    mark(ranges("knowledge"), { highlightColor: null });
    const row = saved(21)!;
    expect(row.body).toBe("Faith is a seed.");
    const highlights = row.text_marks!.filter((item) => item.kind === "highlight").map((item) => item.text);
    expect(highlights).toEqual(["perfect ", " of things"]);
    expect(row.text_marks!.filter((item) => item.kind === "underline")).toMatchObject([{ text: "perfect", color: "blue" }]);
  });

  it("splits a whole-verse highlight when part of it is taken off", () => {
    deviceStudy.setVerseMarks(ALMA_32, [21], { highlightColor: "purple" });
    mark(ranges("perfect"), { highlightColor: null });
    const row = saved(21)!;
    expect(row.highlight_color).toBeNull();
    expect(row.text_marks!.map((item) => [item.start, item.end, item.color])).toEqual([
      [0, V21.indexOf("perfect"), "purple"],
      [V21.indexOf("perfect") + 7, V21.length, "purple"],
    ]);
  });

  it("marks across verses, each verse only its selected part", () => {
    mark(ranges("which are true.\n22  And now"), { underlineColor: "red" });
    expect(saved(21)!.text_marks).toMatchObject([{ text: "which are true.", kind: "underline", color: "red" }]);
    expect(saved(22)!.text_marks).toMatchObject([{ start: 0, text: "And now", kind: "underline", color: "red" }]);
  });

  it("keeps the marks across a relaunch (the store read again from storage)", () => {
    const port = memoryStorage();
    setStoragePort(port);
    initDeviceStudy();
    mark(ranges("perfect"), { highlightColor: "blue" });
    setStoragePort(port);
    initDeviceStudy();
    expect(documentMarks(document, (verse) => saved(verse))).toEqual([{ ...find(document, "perfect"), kind: "highlight", color: "blue" }]);
  });
});
