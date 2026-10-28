// A passage as one continuous native text (modules/scripture-text), and the map between that text and each verse's
// own words. The text is what the reader sees: each verse's number, its words typeset (`--` as an em dash), and,
// when shown, its note. A selection the reader makes is reported in the text's UTF-16 offsets; it maps back to
// offsets in each verse's canonical scripture text only (VerseTextRange, as convex/annotationRules.ts stores marks),
// never counting a verse number, a note, or a line break, exactly as the web's selectedVerseRanges does.

import { typesetDashes } from "../../data/scripture";
import {
  highlightOf,
  matchingTextMarks,
  scriptureSourceOffsets,
  underlineColorOf,
  type MarkColor,
  type MarkKind,
  type VerseAnnotation,
  type VerseTextRange,
} from "../../shared/web";

export type RunStyle = { font: string; size: number; color: string; letterSpacing?: number };
export type ParagraphStyle = RunStyle & { lineHeight: number };

export type ScriptureStyle = {
  body: ParagraphStyle;
  number: RunStyle;
  /** Space between one verse and the next. */
  verseSpacing: number;
  /**
   * How a verse's note is set beneath it: a card ("Your annotation", then the note) or one line ("Your note: …").
   * `gap` is the space between the verse and its note.
   */
  note: { layout: "card" | "inline"; label: RunStyle; body: ParagraphStyle; gap: number } | null;
};

export type DocumentRun = RunStyle & { start: number; end: number };
export type DocumentParagraph = { start: number; end: number; lineHeight: number; spacingAfter: number };

/** One verse in the text: where its scripture words are, and each displayed offset's offset in `source`. */
export type VerseRegion = {
  verse: number;
  /** The verse's canonical text (what marks are saved against). */
  source: string;
  /** Its words in the text (not its number or note). */
  start: number;
  end: number;
  /** offsets[i]: the source offset of displayed offset `start + i` (length end - start + 1). */
  offsets: number[];
  /** The verse with its number and note, for decorations around the whole verse. */
  blockStart: number;
  blockEnd: number;
  note?: { start: number; end: number };
};

export type ScriptureDocument = { text: string; runs: DocumentRun[]; paragraphs: DocumentParagraph[]; verses: VerseRegion[] };

export type DocumentVerse = { verse: number; text: string; note?: string | null };

/** The space a card's note keeps inside its border, above and below. */
export const NOTE_CARD_PADDING = 8;
export const NOTE_CARD_LABEL = "YOUR ANNOTATION";
export const NOTE_INLINE_LABEL = "Your note: ";

function typeset(source: string): { displayed: string; offsets: number[] } {
  const displayed = typesetDashes(source);
  const offsets = scriptureSourceOffsets(source, displayed);
  if (offsets) return { displayed, offsets };
  return { displayed: source, offsets: Array.from({ length: source.length + 1 }, (_, index) => index) };
}

/** The passage's text, its styles, and where each verse's words are in it. */
export function buildScriptureDocument(verses: readonly DocumentVerse[], style: ScriptureStyle): ScriptureDocument {
  let text = "";
  const runs: DocumentRun[] = [];
  const paragraphs: DocumentParagraph[] = [];
  const regions: VerseRegion[] = [];
  const run = (value: string, runStyle: RunStyle) => {
    runs.push({ ...runStyle, start: text.length, end: text.length + value.length });
    text += value;
  };
  const paragraph = (start: number, lineHeight: number, spacingAfter: number) => paragraphs.push({ start, end: text.length, lineHeight, spacingAfter });
  const { lineHeight: bodyLineHeight, ...bodyRun } = style.body;

  verses.forEach((verse, index) => {
    const last = index === verses.length - 1;
    const note = style.note ? verse.note?.trim() : "";
    const blockStart = text.length;
    run(`${verse.verse}  `, style.number);
    const { displayed, offsets } = typeset(verse.text);
    const start = text.length;
    run(displayed + (last && !note ? "" : "\n"), bodyRun);
    const end = start + displayed.length;
    let noteRange: VerseRegion["note"];
    if (note && style.note) {
      const { label, body, gap } = style.note;
      const { lineHeight: noteLineHeight, ...noteRun } = body;
      const after = last ? 0 : style.verseSpacing;
      if (style.note.layout === "card") {
        paragraph(blockStart, bodyLineHeight, gap + NOTE_CARD_PADDING);
        const noteStart = text.length;
        run(`${NOTE_CARD_LABEL}\n`, label);
        paragraph(noteStart, Math.round(label.size * 1.45), 4);
        const bodyStart = text.length;
        run(note + (last ? "" : "\n"), noteRun);
        paragraph(bodyStart, noteLineHeight, NOTE_CARD_PADDING + after);
        noteRange = { start: noteStart, end: bodyStart + note.length };
      } else {
        paragraph(blockStart, bodyLineHeight, gap);
        const noteStart = text.length;
        run(NOTE_INLINE_LABEL, label);
        run(note + (last ? "" : "\n"), noteRun);
        paragraph(noteStart, noteLineHeight, after);
        noteRange = { start: noteStart, end: noteStart + NOTE_INLINE_LABEL.length + note.length };
      }
    } else {
      paragraph(blockStart, bodyLineHeight, last ? 0 : style.verseSpacing);
    }
    regions.push({ verse: verse.verse, source: verse.text, start, end, offsets, blockStart, blockEnd: noteRange?.end ?? end, note: noteRange });
  });
  return { text, runs, paragraphs, verses: regions };
}

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;
const isSpace = (char: string | undefined) => char !== undefined && /\s/.test(char);

/**
 * The reader's selection (text offsets, either order) as exact ranges of each verse's own words: verse numbers,
 * notes and line breaks never count, whitespace at either end is dropped, a surrogate pair is never split, and a
 * verse the selection only touches at its edge isn't included. Empty when no scripture word is selected.
 */
export function selectionRanges(doc: ScriptureDocument, selectionStart: number, selectionEnd: number): VerseTextRange[] {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  if (!(end > start)) return [];
  const ranges: VerseTextRange[] = [];
  for (const region of doc.verses) {
    let from = Math.max(start, region.start);
    let to = Math.min(end, region.end);
    if (from >= to) continue;
    if (from > region.start && isLow(doc.text.charCodeAt(from)) && isHigh(doc.text.charCodeAt(from - 1))) from--;
    if (to < region.end && isHigh(doc.text.charCodeAt(to - 1)) && isLow(doc.text.charCodeAt(to))) to++;
    while (from < to && isSpace(doc.text[from])) from++;
    while (to > from && isSpace(doc.text[to - 1])) to--;
    if (from >= to) continue;
    const sourceStart = region.offsets[from - region.start];
    const sourceEnd = region.offsets[to - region.start];
    if (!region.source.slice(sourceStart, sourceEnd).trim()) continue;
    ranges.push({ verse: region.verse, start: sourceStart, end: sourceEnd, text: region.source });
  }
  return ranges;
}

/** A selection's identity: the exact words, not just which verses. */
export function selectionKey(ranges: readonly VerseTextRange[] | null | undefined): string {
  return (ranges ?? []).map((range) => `${range.verse}:${range.start}:${range.end}`).join(",");
}

/** The selected words themselves, as the reader sees them (an em dash for `--`), verse after verse. */
export function selectedWords(ranges: readonly VerseTextRange[]): string {
  return ranges.map((range) => typesetDashes(range.text.slice(range.start, range.end))).join(" ");
}

/** A source offset's displayed offset in a verse: a range's start rounds down, its end up (an em dash is two). */
function displayedOffset(region: VerseRegion, source: number, edge: "start" | "end"): number {
  const { offsets } = region;
  if (edge === "start") {
    let index = 0;
    while (index + 1 < offsets.length && offsets[index + 1] <= source) index++;
    return region.start + index;
  }
  let index = offsets.length - 1;
  while (index > 0 && offsets[index - 1] >= source) index--;
  return region.start + index;
}

/** Where saved ranges are in the text, to restore the native selection, or null when they don't match it. */
export function displaySelection(doc: ScriptureDocument, ranges: readonly VerseTextRange[]): { start: number; end: number } | null {
  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  if (!first || !last) return null;
  const find = (range: VerseTextRange) => doc.verses.find((region) => region.verse === range.verse && region.source === range.text);
  const from = find(first);
  const to = find(last);
  if (!from || !to) return null;
  return { start: displayedOffset(from, first.start, "start"), end: displayedOffset(to, last.end, "end") };
}

export type DocumentMark = { start: number; end: number; kind: MarkKind; color: MarkColor };

/**
 * Every verse's marks on its exact words (VerseMarkedText's rule): saved ranges that still match the verse's words,
 * over its whole-verse highlight or underline. A range saved on other words (another translation's) is never drawn.
 */
export function documentMarks(doc: ScriptureDocument, annotationOf: (verse: number) => VerseAnnotation | null | undefined): DocumentMark[] {
  const out: DocumentMark[] = [];
  for (const region of doc.verses) {
    const annotation = annotationOf(region.verse);
    if (!annotation) continue;
    const saved = matchingTextMarks(annotation.text_marks, region.source);
    for (const kind of ["highlight", "underline"] as const) {
      const whole = kind === "highlight" ? highlightOf(annotation) : underlineColorOf(annotation);
      const base = whole === "none" ? undefined : whole;
      const marks = saved.filter((mark) => mark.kind === kind);
      if (!base && !marks.length) continue;
      const length = region.source.length;
      const edges = [...new Set([0, length, ...marks.flatMap((mark) => [mark.start, mark.end])])].sort((a, b) => a - b);
      const pieces: Array<{ start: number; end: number; color: MarkColor }> = [];
      for (let index = 0; index < edges.length - 1; index++) {
        const from = edges[index];
        const to = edges[index + 1];
        const color = marks.findLast((mark) => mark.start <= from && mark.end >= to)?.color ?? base;
        if (!color) continue;
        const previous = pieces[pieces.length - 1];
        if (previous && previous.color === color && previous.end === from) previous.end = to;
        else pieces.push({ start: from, end: to, color });
      }
      for (const piece of pieces) {
        const start = displayedOffset(region, piece.start, "start");
        const end = displayedOffset(region, piece.end, "end");
        if (end > start) out.push({ start, end, kind, color: piece.color });
      }
    }
  }
  return out;
}

export type DocumentDecoration = {
  start: number;
  end: number;
  kind: "box" | "rule";
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  x?: number;
  width?: number;
  outsetX?: number;
  outsetTop?: number;
  outsetBottom?: number;
};

/** A verse's region by number. */
export function verseRegion(doc: ScriptureDocument, verse: number): VerseRegion | undefined {
  return doc.verses.find((region) => region.verse === verse);
}
