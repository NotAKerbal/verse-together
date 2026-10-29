// The chapter as one native text with what the web reader shows in its verses beyond the scripture itself: the
// Joseph Smith Translation's reading in place of the KJV verses it revises (JstVerseText.tsx) and comparison
// translations, either inline in the verse (renderInlineDiff in ChapterReader.tsx) or side by side, one card per
// translation holding the main text and the translation's wording (ChapterReader.tsx's sideBySide branch).
//
// Each verse is set by buildScriptureDocument (scriptureDocument.ts) exactly as without these, and only then
// combined: a chapter with no JST passage and no differing comparison is that function's own document, and a plain
// verse is laid out identically either way. What is added never counts as scripture: a selection maps back to each
// verse's main text only (VerseRegion offsets), which is the chapter's primary text, the bundled KJV or the reader's
// default Bible, exactly as the web's verses are. Marks, notes, quotes and shares are saved against those words, and
// a mark saved on other words (another translation's) is never drawn (documentMarks). A JST verse has no selectable
// scripture words at all (the web's "Turn off the JST to highlight or note those verses").
//
// The side-by-side cards are set in the same text, cell beneath cell, as the web's grid lays them out below its md
// breakpoint: one native text can't hold two columns on Android, and splitting the chapter into several texts would
// lose selecting across verses. Their boxes are decorations drawn behind the lines.
//
// At the md breakpoint and wider (`columns`), the web's grid puts the cells side by side. The chapter stays one text,
// now the left column: a side-by-side verse is its number and one cell of its main text (then its note), followed by
// an invisible end line. The translations' cells are drawn by the screen in a column beside it (ComparisonColumns.tsx),
// each verse's beside its cell, and `rows` says where: the top of the verse's cell, and its end line, whose top is
// where the verse's own content ends however much space follows it. Where the translations run taller than the
// verse, padRows adds the difference after its end line, so the next verse starts below them; the text itself never
// changes, so neither do selections or marks.

import type { JstPiece, JstRow } from "@/lib/jst";
import { typesetDashes } from "../../data/scripture";
import { highlightOf, scriptureSourceOffsets, underlineColorOf, type MarkColor, type VerseAnnotation } from "../../shared/web";
import {
  buildScriptureDocument,
  type DocumentDecoration,
  type DocumentMark,
  type DocumentParagraph,
  type DocumentRun,
  type DocumentVerse,
  type ParagraphStyle,
  type RunStyle,
  type ScriptureDocument,
  type ScriptureStyle,
  type VerseRegion,
  NOTE_CARD_PADDING,
} from "./scriptureDocument";

// ---- The web's inline comparison (ChapterReader.tsx computeInlineDiffSegments), unchanged ----

export type DiffSegment = { kind: "equal" | "change"; primary: string[]; compare: string[] };

/** Whether two wordings differ in more than case and punctuation (the web shows only those that do). */
export function normalizeCompareText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenizeWords(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "").replace(/[^a-z0-9]/g, "");
}

function buildLcsTable(source: string[], target: string[]): number[][] {
  const table: number[][] = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(0));
  for (let i = source.length - 1; i >= 0; i -= 1) {
    for (let j = target.length - 1; j >= 0; j -= 1) {
      table[i][j] = source[i] === target[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

export function computeInlineDiffSegments(primaryText: string, compareText: string): DiffSegment[] {
  const primaryWords = tokenizeWords(primaryText);
  const compareWords = tokenizeWords(compareText);
  const primaryKeys = primaryWords.map(normalizeWord);
  const compareKeys = compareWords.map(normalizeWord);
  const table = buildLcsTable(primaryKeys, compareKeys);
  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  let pendingPrimary: string[] = [];
  let pendingCompare: string[] = [];
  const flush = () => {
    if (pendingPrimary.length === 0 && pendingCompare.length === 0) return;
    segments.push({ kind: "change", primary: pendingPrimary, compare: pendingCompare });
    pendingPrimary = [];
    pendingCompare = [];
  };
  while (i < primaryWords.length || j < compareWords.length) {
    if (i < primaryWords.length && j < compareWords.length && primaryKeys[i] === compareKeys[j]) {
      flush();
      const last = segments[segments.length - 1];
      if (last?.kind === "equal") last.primary.push(primaryWords[i]);
      else segments.push({ kind: "equal", primary: [primaryWords[i]], compare: [primaryWords[i]] });
      i += 1;
      j += 1;
      continue;
    }
    if (i < primaryWords.length && (j >= compareWords.length || table[i + 1][j] >= table[i][j + 1])) {
      pendingPrimary.push(primaryWords[i]);
      i += 1;
    } else if (j < compareWords.length) {
      pendingCompare.push(compareWords[j]);
      j += 1;
    }
  }
  flush();
  return segments;
}

/**
 * The inline comparison as pieces of the primary verse's own text (whitespace kept exactly, as the web keeps it)
 * and the comparison's alternatives. Joined, the `primary` pieces are the verse's text, so its offsets hold.
 */
export function inlineDiffPieces(primaryText: string, compareText: string): Array<{ primary: string; changed: boolean; alternative?: string }> {
  const segments = computeInlineDiffSegments(primaryText, compareText);
  const tokens = [...primaryText.matchAll(/\S+/g)];
  let tokenIndex = 0;
  let sourceOffset = 0;
  const out: Array<{ primary: string; changed: boolean; alternative?: string }> = [];
  segments.forEach((segment) => {
    tokenIndex += segment.primary.length;
    const lastToken = tokens[tokenIndex - 1];
    const end = tokenIndex === tokens.length ? primaryText.length : segment.primary.length ? lastToken.index! + lastToken[0].length : sourceOffset;
    const primary = primaryText.slice(sourceOffset, end);
    sourceOffset = end;
    if (segment.kind === "equal") out.push({ primary, changed: false });
    else out.push({ primary, changed: true, alternative: segment.compare.join(" ") });
  });
  if (sourceOffset < primaryText.length) out.push({ primary: primaryText.slice(sourceOffset), changed: false });
  return out;
}

// ---- What a verse shows besides its own text ----

export type Comparison = {
  id: string;
  /** "BSB", "NET", or the translation id in capitals. */
  label: string;
  /** This translation's color (the web's per-translation legend color). */
  color: string;
  byVerse: ReadonlyMap<number, string>;
};

export type ReaderExtrasStyle = {
  /** A changed word of the primary text, inline (the web's amber). */
  primaryChange: string;
  /** The "/" between the primary wording and the alternative, and "–" for nothing. */
  muted: string;
  /** A comparison's line beneath the verse, and its label. */
  line: ParagraphStyle;
  lineLabel: RunStyle;
  /** The JST passage label ("JST 9:40–48"), and a JST verse number where it differs from the KJV's. */
  jstLabel: RunStyle;
  jstNumber: RunStyle;
  /** KJV wording the JST leaves out, when shown: muted and struck through (.jst-omitted). */
  jstOmitted: RunStyle;
  /** The JST's own wording is underlined (a dotted underline on the web) in this color. */
  jstAddedUnderline: string;
  /** Short explanations set in a verse ("The JST passage has no wording for this KJV verse."). */
  aside: RunStyle & { lineHeight: number };
  /** Space between a verse and a line beneath it. */
  lineGap: number;
  /** A side-by-side card's border, and the fill of each of its cells (the web's black/3%, white/5% in the dark). */
  card: { border: string; cellFill: string };
};

export type ReaderExtras = {
  jstRows?: ReadonlyMap<number, JstRow>;
  showJstOmitted?: boolean;
  comparisons?: readonly Comparison[];
  comparisonView?: "inline" | "sideBySide";
  /** Side by side in two columns (the md breakpoint and wider): this text is the left column (see `rows`). */
  columns?: boolean;
  /** The main text's short label in a side-by-side card ("KJV", "LDS", "BSB"). */
  primaryLabel?: string;
  /** The verse's saved marks are on its KJV words; a JST verse says so (the web's .jst-hidden-marks). */
  hasMarks?: (verse: number) => boolean;
  style: ReaderExtrasStyle;
};

/**
 * The text, the marks it draws itself (the JST's underlined wording), the side-by-side cards' boxes, and `mirrors`:
 * the main text repeated in a verse's second and later cards, where the verse's own marks are drawn too but which
 * never select (a selection is the verse's words once).
 */
export type ReaderDocument = {
  document: ScriptureDocument;
  marks: DocumentMark[];
  decorations: DocumentDecoration[];
  mirrors: VerseRegion[];
  /** In two columns, each side-by-side verse's row (empty otherwise). */
  rows: ComparisonRow[];
};

/** A side-by-side verse in two columns: where its row is in the text, and the translations' cells beside it. */
export type ComparisonRow = {
  verse: number;
  /** The first offset of the main text's cell (its label): the row's top is this line's top less CELL_PAD. */
  cellStart: number;
  /** The verse's invisible end line: its top is where the verse's last line (the cell's, or its note's) ends. */
  endStart: number;
  /** How far the verse's last box (its cell, or its note card) reaches below that. */
  endOutset: number;
  cells: ReadonlyArray<{ comparison: Comparison; text: string }>;
};

// The side-by-side card's spacing (dp): the web's p-2 card, px-2 py-1.5 cells with gap-2, mt-0.5 under a label,
// space-y-2 between cards and mt-1 above the first. Across, the card and cell stay inside the text's 12dp inset.
export const CARD_PAD = 8;
const CARD_GAP = 8;
const CARD_TOP = 4;
export const CELL_PAD = 6;
export const CELL_GAP = 8;
export const LABEL_GAP = 2;
export const CARD_OUTSET_X = 10;
export const CELL_OUTSET_X = 5;
/** The end line of a verse in two columns: nothing visible, on a line as short as the text allows. */
const END_LINE = "\u200b";
const END_LINE_HEIGHT = 1;

/** A label's line height in a side-by-side cell (the web's 10px label). */
export function cellLabelLineHeight(style: ReaderExtrasStyle): number {
  return Math.round(style.lineLabel.size * 1.5);
}

type Piece = { text: string; style: RunStyle; underline?: string };
type Line = { pieces: Piece[]; lineHeight: number };

/** A verse's marks are on its KJV words: a highlight, an underline or a marked phrase. */
export function annotationHasMarks(annotation: VerseAnnotation | null | undefined): boolean {
  return !!annotation && (highlightOf(annotation) !== "none" || underlineColorOf(annotation) !== "none" || !!annotation.text_marks?.length);
}

/** "JST, Mark 9:40–48" → "JST 9:40–48", as the web's passage label shows it. */
export function jstPassageLabel(label: string): string {
  const short = label.replace(/^JST,\s*/, "");
  return `JST ${short.replace(/^.*?(\d+:[\d–,\s]+)$/, "$1")}`;
}

/** The JST's reading of one KJV verse as pieces in reading order (JstVerseText.tsx). */
export function jstPieces(row: JstRow, showOmitted: boolean, style: ReaderExtrasStyle, body: RunStyle): Piece[] {
  const out: Piece[] = [];
  let wrote = false;
  let spaced = false;
  if (row.first) out.push({ text: `${jstPassageLabel(row.label)}  `, style: style.jstLabel });
  row.pieces.forEach((piece: JstPiece) => {
    if (piece.kind === "verse") {
      if (!wrote && (row.first || piece.number === String(row.verse))) return;
      out.push({ text: `${spaced ? " " : ""}${piece.number}`, style: style.jstNumber });
      spaced = true;
      return;
    }
    if (piece.kind === "omitted") {
      if (!showOmitted) return;
      out.push({ text: `${spaced ? " " : ""}${piece.text}`, style: style.jstOmitted });
      spaced = true;
      return;
    }
    if (spaced) out.push({ text: " ", style: body });
    wrote = true;
    spaced = true;
    out.push({ text: piece.text, style: body, underline: piece.kind === "added" ? style.jstAddedUnderline : undefined });
  });
  if (!wrote) out.push({ text: `${spaced ? " " : ""}The JST passage has no wording for this KJV verse.`, style: style.aside });
  return out;
}

function comparisonLine(comparison: Comparison, text: string, style: ReaderExtrasStyle): Line {
  const { lineHeight, ...run } = style.line;
  return { pieces: [{ text: `${comparison.label}  `, style: { ...style.lineLabel, color: comparison.color } }, { text, style: run }], lineHeight };
}

/** An inline comparison of the verse with one translation, as a line of its own (a second or later translation). */
function diffLine(comparison: Comparison, verseText: string, compareText: string, style: ReaderExtrasStyle): Line {
  const { lineHeight, ...run } = style.line;
  const pieces: Piece[] = [{ text: `${comparison.label}  `, style: { ...style.lineLabel, color: comparison.color } }];
  for (const part of inlineDiffPieces(verseText, compareText)) {
    if (!part.changed) {
      pieces.push({ text: typesetDashes(part.primary), style: run });
      continue;
    }
    if (part.primary) pieces.push({ text: typesetDashes(part.primary), style: { ...run, color: style.primaryChange } });
    pieces.push({ text: part.primary ? " / " : " – / ", style: { ...run, color: style.muted } });
    pieces.push({ text: part.alternative || "–", style: { ...run, color: comparison.color } });
  }
  return { pieces, lineHeight };
}

class Builder {
  text = "";
  runs: DocumentRun[] = [];
  paragraphs: DocumentParagraph[] = [];
  verses: VerseRegion[] = [];
  marks: DocumentMark[] = [];
  decorations: DocumentDecoration[] = [];
  mirrors: VerseRegion[] = [];

  run(text: string, style: Piece["style"]) {
    if (!text) return;
    this.runs.push({ ...style, start: this.text.length, end: this.text.length + text.length });
    this.text += text;
  }

  piece(piece: Piece) {
    const start = this.text.length;
    this.run(piece.text, piece.style);
    // A custom color is drawn as given (markColors.ts); this one is never saved as a mark.
    if (piece.underline) this.marks.push({ start, end: this.text.length, kind: "underline", color: piece.underline as MarkColor });
  }

  /** Copies [from, to) of a document: its text, the runs over it, and the paragraphs inside it. */
  copy(doc: ScriptureDocument, from: number, to: number) {
    const shift = this.text.length - from;
    for (const run of doc.runs) {
      const start = Math.max(run.start, from);
      const end = Math.min(run.end, to);
      if (end > start) this.runs.push({ ...run, start: start + shift, end: end + shift });
    }
    for (const paragraph of doc.paragraphs) {
      if (paragraph.start >= from && paragraph.end <= to) this.paragraphs.push({ ...paragraph, start: paragraph.start + shift, end: paragraph.end + shift });
    }
    this.text += doc.text.slice(from, to);
    return shift;
  }

  /** Ends the verse before the next: its last line break and the space after it, as buildScriptureDocument does. */
  separate(verseSpacing: number) {
    this.text += "\n";
    const lastRun = this.runs[this.runs.length - 1];
    if (lastRun) lastRun.end += 1;
    const lastParagraph = this.paragraphs[this.paragraphs.length - 1];
    if (lastParagraph) {
      lastParagraph.end += 1;
      lastParagraph.spacingAfter += verseSpacing;
    }
  }
}

/** The chapter's text with its JST readings and comparisons; plain verses are set exactly as buildScriptureDocument sets them. */
export function buildReaderDocument(verses: readonly DocumentVerse[], style: ScriptureStyle, extras: ReaderExtras): ReaderDocument {
  const { jstRows, comparisons = [], comparisonView = "inline", showJstOmitted = false, hasMarks } = extras;
  const differing = (verse: DocumentVerse) =>
    comparisons.flatMap((comparison) => {
      const text = comparison.byVerse.get(verse.verse);
      return typeof text === "string" && normalizeCompareText(text) !== normalizeCompareText(verse.text) ? [{ comparison, text }] : [];
    });
  if (!jstRows?.size && !verses.some((verse) => differing(verse).length > 0)) return { document: buildScriptureDocument(verses, style), marks: [], decorations: [], mirrors: [], rows: [] };

  const { lineHeight: bodyLineHeight, ...body } = style.body;
  const out = new Builder();
  const rows: ComparisonRow[] = [];
  verses.forEach((verse, index) => {
    const single = buildScriptureDocument([verse], style);
    const region = single.verses[0];
    const verseParagraph = single.paragraphs[0];
    const jstRow = jstRows?.get(verse.verse);
    const diffs = differing(verse);
    const inline = !jstRow && comparisonView === "inline" ? diffs[0] : undefined;
    if (!jstRow && comparisonView === "sideBySide" && diffs.length) {
      if (extras.columns) rows.push(sideBySideRow(out, single, verse, diffs, style, extras));
      else sideBySide(out, single, verse, diffs, style, extras);
      if (index < verses.length - 1) out.separate(style.verseSpacing);
      return;
    }
    const lines: Line[] = [];
    if (jstRow) {
      // Comparisons are with the KJV; beside a JST reading they are shown whole, and the KJV isn't repeated.
      for (const { comparison, text } of diffs) lines.push(comparisonLine(comparison, text, extras.style));
      if (hasMarks?.(verse.verse)) {
        const { lineHeight, ...aside } = extras.style.aside;
        lines.push({ pieces: [{ text: "Your marks on this verse are on its KJV wording. Turn off the JST to see them.", style: aside }], lineHeight });
      }
    } else {
      for (const { comparison, text } of diffs.slice(1)) lines.push(diffLine(comparison, verse.text, text, extras.style));
    }

    if (!jstRow && !inline && lines.length === 0) {
      const shift = out.copy(single, 0, single.text.length);
      out.verses.push({
        ...region,
        start: region.start + shift,
        end: region.end + shift,
        blockStart: region.blockStart + shift,
        blockEnd: region.blockEnd + shift,
        note: region.note ? { start: region.note.start + shift, end: region.note.end + shift } : undefined,
      });
    } else {
      const blockStart = out.text.length;
      out.copy(single, region.blockStart, region.start);
      let start = out.text.length;
      let end = start;
      let offsets: number[];
      if (jstRow) {
        for (const piece of jstPieces(jstRow, showJstOmitted, extras.style, body)) out.piece(piece);
        // No scripture words to select here: the reading isn't the KJV text marks are saved on.
        start = end = out.text.length;
        offsets = [0];
      } else if (inline) {
        offsets = [];
        let source = 0;
        for (const part of inlineDiffPieces(verse.text, inline.text)) {
          const displayed = typesetDashes(part.primary);
          const map = scriptureSourceOffsets(part.primary, displayed) ?? Array.from({ length: part.primary.length + 1 }, (_, i) => i);
          const shown = map.length === displayed.length + 1 ? displayed : part.primary;
          out.run(shown, part.changed ? { ...body, color: extras.style.primaryChange } : body);
          for (let i = 0; i < shown.length; i++) offsets.push(source + map[i]);
          source += part.primary.length;
          if (part.changed) {
            // The alternative isn't the verse's text: every offset in it is the verse's offset where it stands.
            const alternative = [
              { text: part.primary ? " / " : " – / ", color: extras.style.muted },
              { text: part.alternative || "–", color: inline.comparison.color },
            ];
            for (const item of alternative) {
              out.run(item.text, { ...body, color: item.color });
              for (let i = 0; i < item.text.length; i++) offsets.push(source);
            }
          }
        }
        offsets.push(source);
        end = out.text.length;
      } else {
        const shift = out.copy(single, region.start, region.end);
        start = region.start + shift;
        end = region.end + shift;
        offsets = region.offsets;
      }
      const hasNote = !!region.note;
      const afterVerse = verseParagraph.spacingAfter;
      if (lines.length || hasNote) out.run("\n", body);
      out.paragraphs.push({ start: blockStart, end: out.text.length, lineHeight: bodyLineHeight, spacingAfter: lines.length ? extras.style.lineGap : afterVerse });
      let blockEnd = end;
      lines.forEach((line, lineIndex) => {
        const lineStart = out.text.length;
        line.pieces.forEach((piece) => out.piece(piece));
        blockEnd = out.text.length;
        const lastLine = lineIndex === lines.length - 1;
        if (!lastLine || hasNote) out.run("\n", line.pieces[line.pieces.length - 1]?.style ?? body);
        out.paragraphs.push({ start: lineStart, end: out.text.length, lineHeight: line.lineHeight, spacingAfter: lastLine ? afterVerse : extras.style.lineGap });
      });
      let note: VerseRegion["note"];
      if (region.note) {
        const shift = out.copy(single, verseParagraph.end, single.text.length);
        note = { start: region.note.start + shift, end: region.note.end + shift };
        blockEnd = note.end;
      }
      out.verses.push({ verse: verse.verse, source: verse.text, start, end, offsets, blockStart, blockEnd, note });
    }
    if (index < verses.length - 1) out.separate(style.verseSpacing);
  });
  return {
    document: { text: out.text, runs: out.runs, paragraphs: out.paragraphs, verses: out.verses },
    marks: out.marks,
    decorations: out.decorations,
    mirrors: out.mirrors,
    rows,
  };
}

/**
 * A side-by-side verse as the left column of two: its number, then a cell of its main text (labelled in amber, its
 * selectable words), then its note card, then its end line. The translations' cells go beside it (`rows`).
 */
function sideBySideRow(
  out: Builder,
  single: ScriptureDocument,
  verse: DocumentVerse,
  cells: ReadonlyArray<{ comparison: Comparison; text: string }>,
  style: ScriptureStyle,
  extras: ReaderExtras
): ComparisonRow {
  const region = single.verses[0];
  const verseParagraph = single.paragraphs[0];
  const { lineHeight: cellLineHeight, ...cellRun } = extras.style.line;
  const blockStart = out.text.length;
  out.copy(single, region.blockStart, region.start);
  out.run("\n", single.runs[0] ?? cellRun);
  out.paragraphs.push({ start: blockStart, end: out.text.length, lineHeight: style.body.lineHeight, spacingAfter: CARD_TOP + CARD_PAD + CELL_PAD });

  const cellStart = out.text.length;
  out.run(`${(extras.primaryLabel ?? "").toUpperCase()}\n`, { ...extras.style.lineLabel, color: extras.style.primaryChange });
  out.paragraphs.push({ start: cellStart, end: out.text.length, lineHeight: cellLabelLineHeight(extras.style), spacingAfter: LABEL_GAP });
  const start = out.text.length;
  out.run(single.text.slice(region.start, region.end), cellRun);
  const end = out.text.length;
  out.run("\n", cellRun);
  // With a note, the space between the cell and the note's card; without one, the end line follows the cell directly.
  out.paragraphs.push({ start, end: out.text.length, lineHeight: cellLineHeight, spacingAfter: region.note ? CELL_PAD + verseParagraph.spacingAfter : 0 });
  out.decorations.push({ start: cellStart, end, kind: "box", fill: extras.style.card.cellFill, radius: 4, outsetX: CELL_OUTSET_X, outsetTop: CELL_PAD, outsetBottom: CELL_PAD });

  let note: VerseRegion["note"];
  let endOutset = CELL_PAD;
  if (region.note) {
    const shift = out.copy(single, verseParagraph.end, single.text.length);
    note = { start: region.note.start + shift, end: region.note.end + shift };
    // The note's card closes the verse: the end line follows its last line directly.
    out.separate(0);
    out.paragraphs[out.paragraphs.length - 1].spacingAfter = 0;
    endOutset = NOTE_CARD_PADDING;
  }
  const endStart = out.text.length;
  out.run(END_LINE, cellRun);
  // What follows the verse's last box: its padding past the line, the card's, and (separate) the space between verses.
  out.paragraphs.push({ start: endStart, end: out.text.length, lineHeight: END_LINE_HEIGHT, spacingAfter: endOutset + CARD_PAD });
  out.verses.push({ verse: verse.verse, source: verse.text, start, end, offsets: region.offsets, blockStart, blockEnd: note?.end ?? end, note });
  return { verse: verse.verse, cellStart, endStart, endOutset, cells };
}

/**
 * The text with `padding` (dp) added after each row's end line, so the verse after a row starts below its
 * translations' cells. The text, runs and offsets are unchanged: only the space after those lines.
 */
export function padRows(doc: ScriptureDocument, rows: readonly ComparisonRow[], padding: ReadonlyMap<number, number>): ScriptureDocument {
  if (!padding.size) return doc;
  const extra = new Map<number, number>();
  for (const row of rows) {
    const value = padding.get(row.verse);
    if (value && value > 0) extra.set(row.endStart, value);
  }
  if (!extra.size) return doc;
  return { ...doc, paragraphs: doc.paragraphs.map((paragraph) => (extra.has(paragraph.start) ? { ...paragraph, spacingAfter: paragraph.spacingAfter + extra.get(paragraph.start)! } : paragraph)) };
}

/**
 * A verse with differing comparisons, side by side: its number, then a card per translation holding a cell of the
 * main text (labelled in amber) and a cell of the translation's wording (in its own color), then its note card. The
 * first card's main text is the verse's selectable words; later cards repeat them as mirrors.
 */
function sideBySide(
  out: Builder,
  single: ScriptureDocument,
  verse: DocumentVerse,
  cards: ReadonlyArray<{ comparison: Comparison; text: string }>,
  style: ScriptureStyle,
  extras: ReaderExtras
) {
  const region = single.verses[0];
  const verseParagraph = single.paragraphs[0];
  const { lineHeight: bodyLineHeight } = style.body;
  const { lineHeight: cellLineHeight, ...cellRun } = extras.style.line;
  const labelLineHeight = Math.round(extras.style.lineLabel.size * 1.5);
  const hasNote = !!region.note;
  const blockStart = out.text.length;
  out.copy(single, region.blockStart, region.start);
  out.run("\n", single.runs[0] ?? cellRun);
  out.paragraphs.push({ start: blockStart, end: out.text.length, lineHeight: bodyLineHeight, spacingAfter: CARD_TOP + CARD_PAD + CELL_PAD });
  const shown = single.text.slice(region.start, region.end);

  const cell = (label: string, color: string, body: string, spacingAfter: number, newline: boolean) => {
    const cellStart = out.text.length;
    out.run(`${label.toUpperCase()}\n`, { ...extras.style.lineLabel, color });
    out.paragraphs.push({ start: cellStart, end: out.text.length, lineHeight: labelLineHeight, spacingAfter: LABEL_GAP });
    const start = out.text.length;
    out.run(body, cellRun);
    const end = out.text.length;
    if (newline) out.run("\n", cellRun);
    out.paragraphs.push({ start, end: out.text.length, lineHeight: cellLineHeight, spacingAfter });
    out.decorations.push({ start: cellStart, end, kind: "box", fill: extras.style.card.cellFill, radius: 4, outsetX: CELL_OUTSET_X, outsetTop: CELL_PAD, outsetBottom: CELL_PAD });
    return { start, end };
  };

  let primary: { start: number; end: number } | undefined;
  let blockEnd = blockStart;
  cards.forEach(({ comparison, text }, index) => {
    const last = index === cards.length - 1;
    const cardStart = out.text.length;
    // The card's border goes first, so its cells are drawn over it.
    const card: DocumentDecoration = { start: cardStart, end: cardStart, kind: "box", fill: "transparent", stroke: extras.style.card.border, strokeWidth: 1, radius: 6, outsetX: CARD_OUTSET_X, outsetTop: CELL_PAD + CARD_PAD, outsetBottom: CELL_PAD + CARD_PAD };
    out.decorations.push(card);
    const main = cell(extras.primaryLabel ?? "", extras.style.primaryChange, shown, CELL_PAD + CELL_GAP + CELL_PAD, true);
    if (primary) out.mirrors.push({ ...region, start: main.start, end: main.end, blockStart: main.start, blockEnd: main.end, note: undefined });
    else primary = main;
    const after = last ? CELL_PAD + CARD_PAD + verseParagraph.spacingAfter : CELL_PAD + CARD_PAD + CARD_GAP + CARD_PAD + CELL_PAD;
    const other = cell(comparison.label, comparison.color, text, after, !last || hasNote);
    card.end = other.end;
    blockEnd = other.end;
  });

  let note: VerseRegion["note"];
  if (region.note) {
    const shift = out.copy(single, verseParagraph.end, single.text.length);
    note = { start: region.note.start + shift, end: region.note.end + shift };
    blockEnd = note.end;
  }
  out.verses.push({ verse: verse.verse, source: verse.text, start: primary!.start, end: primary!.end, offsets: region.offsets, blockStart, blockEnd, note });
}
