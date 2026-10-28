// A study guide's prose as the native app shows and annotates it. Pure: no React, no native views.
//
// The website anchors a guide highlight in a "part" of the guide (the introduction, or the reader: every section
// heading and context block, then the closing sections), whose text is its elements' DOM text, one element after
// another (useGuideHighlights' buildIndex). The generated guide carries each element's text exactly (GuideRoot) and
// where each run's characters are in it (Run.at / Run.src). Here those become:
//  - the part's TextIndex, in the website's element order, which guideAnchors.ts describes selections in and finds
//    saved spans again in, so a span saved on the website is found here and one saved here is found there;
//  - prose documents: the text a native selectable view shows (runs as they read, paragraphs joined by line breaks),
//    with each shown character's offset in its part, so a native selection becomes the exact part span and a saved
//    span becomes marks on exactly its words.

import type { Block, GuideRoot, GuideSection, NativeGuide, Run } from "../../cfm/guideTypes";
import type { GuidePart, TextIndex } from "@/features/comeFollowMe/guideAnchors";

// ---------------------------------------------------------------------------------------------------------------
// Parts and their roots

/** One element the website renders guide prose into: its key here, its part, and its text. */
export type ProseRoot = { key: string; part: GuidePart; root: GuideRoot };

export const rootKey = {
  introduction: "introduction",
  fallback: "fallback",
  closing: "closing",
  section: (id: string) => `section:${id}`,
  preview: (id: string) => `block:${id}`,
  more: (id: string) => `more:${id}`,
};

/**
 * The guide's sections that the lesson shows, as the website's scripture-first page does (StudyCompanion): for each
 * chapter of the week's reading, in reading order, its chapter section (by range key; the last one wins, as a Map
 * built over the sections does), then the sections without a chapter that follow it, up to the next chapter section.
 * Other sections are not on the page, so they are not in its text either.
 */
export function shownSections(guide: Pick<NativeGuide, "sections" | "range">): Set<GuideSection> {
  const byChapter = new Map(guide.sections.filter((section) => section.chapter != null).map((section) => [section.chapter!, section]));
  const shown = new Set<GuideSection>();
  for (const entry of guide.range.entries) {
    const section = byChapter.get(entry.key);
    if (!section) continue;
    shown.add(section);
    for (let index = guide.sections.indexOf(section) + 1; index < guide.sections.length; index++) {
      if (guide.sections[index].chapter != null) break;
      shown.add(guide.sections[index]);
    }
  }
  return shown;
}

/**
 * Each part's elements in the website's index order: the introduction alone; for the reader, every shown section's
 * heading then its context blocks (preview, then full commentary), in the guide's section order (the order the
 * website registers them in, not where each is drawn), then the fallback (a guide without chapter sections), then
 * the closing sections.
 */
export function guideRoots(guide: NativeGuide): Record<GuidePart, ProseRoot[]> {
  const introduction: ProseRoot[] = guide.introductionRoot.text ? [{ key: rootKey.introduction, part: "introduction", root: guide.introductionRoot }] : [];
  const reader: ProseRoot[] = [];
  const shown = shownSections(guide);
  for (const section of guide.sections) {
    if (!shown.has(section)) continue;
    reader.push({ key: rootKey.section(section.id), part: "reader", root: section.headingRoot });
    for (const block of section.blocks) {
      reader.push({ key: rootKey.preview(block.id), part: "reader", root: block.previewRoot });
      if (block.moreRoot) reader.push({ key: rootKey.more(block.id), part: "reader", root: block.moreRoot });
    }
  }
  if (guide.sections.length === 0 && guide.fallbackRoot) reader.push({ key: rootKey.fallback, part: "reader", root: guide.fallbackRoot });
  if (guide.closingRoot.text) reader.push({ key: rootKey.closing, part: "reader", root: guide.closingRoot });
  return { introduction, reader };
}

/** A part's text and block anchors (guideAnchors' TextIndex), and where each of its elements starts and ends. */
export type PartIndex = TextIndex & { part: GuidePart; spans: Map<string, { start: number; end: number }> };

export function partIndex(part: GuidePart, roots: readonly ProseRoot[]): PartIndex {
  let text = "";
  const anchors: Array<{ id: string; start: number }> = [];
  const spans = new Map<string, { start: number; end: number }>();
  for (const { key, root } of roots) {
    const start = text.length;
    for (const [id, at] of root.anchors) anchors.push({ id, start: start + at });
    text += root.text;
    spans.set(key, { start, end: text.length });
  }
  return { part, text, anchors, spans };
}

/** The element a part offset is in (its key), or undefined. */
export function rootAt(index: PartIndex, offset: number): string | undefined {
  for (const [key, span] of index.spans) if (offset >= span.start && offset < span.end) return key;
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Run maps

/** Each character's offset in its root's text, or -1 (see Run.at / Run.src). */
export function runSources(run: Run): number[] {
  const out = new Array<number>(run.text.length).fill(-1);
  if (run.at != null) {
    for (let index = 0; index < out.length; index++) out[index] = run.at + index;
    return out;
  }
  const pairs = run.src;
  if (!pairs) return out;
  for (let pair = 0; pair < pairs.length; pair += 2) {
    const from = pairs[pair];
    const to = pair + 2 < pairs.length ? pairs[pair + 2] : run.text.length;
    const source = pairs[pair + 1];
    if (source < 0) continue;
    for (let index = from; index < to && index < out.length; index++) out[index] = source + (index - from);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Prose documents

export type ProseRunStyle = { font: string; size: number; color: string; letterSpacing?: number; style?: "bold" | "italic" | "boldItalic" };
export type ProseParagraphLook = ProseRunStyle & { lineHeight: number; spacingAfter: number };

/** One paragraph of a prose document: its runs, the element they're in, and how it reads. */
export type ProseParagraph = { runs: readonly Run[]; root: string; look: ProseParagraphLook };

export type ProseLink = { start: number; end: number; run: Run };

/** The text a native view shows, its styles, and each shown character's offset in its part (-1: none). */
export type ProseDocument = {
  text: string;
  runs: Array<ProseRunStyle & { start: number; end: number }>;
  paragraphs: Array<{ start: number; end: number; lineHeight: number; spacingAfter: number }>;
  sources: number[];
  links: ProseLink[];
};

export const isLinkRun = (run: Run) => !!(run.ref || run.url || run.anchor);

/**
 * Builds a prose document. `styleOf` gives a run's style within its paragraph (emphasis, code, links); `rootStart`
 * where the paragraph's element starts in its part (undefined: the element isn't in the part's text, so its words
 * can be read and copied but not annotated).
 */
export function buildProseDocument(
  paragraphs: readonly ProseParagraph[],
  styleOf: (run: Run, look: ProseParagraphLook) => ProseRunStyle,
  rootStart: (root: string) => number | undefined
): ProseDocument {
  let text = "";
  const runs: ProseDocument["runs"] = [];
  const out: ProseDocument["paragraphs"] = [];
  const sources: number[] = [];
  const links: ProseLink[] = [];
  paragraphs.forEach((paragraph, index) => {
    const start = text.length;
    const base = rootStart(paragraph.root);
    const { lineHeight, spacingAfter, ...look } = paragraph.look;
    for (const run of paragraph.runs) {
      if (!run.text) continue;
      const from = text.length;
      text += run.text;
      runs.push({ ...styleOf(run, paragraph.look), start: from, end: text.length });
      for (const source of runSources(run)) sources.push(base == null || source < 0 ? -1 : base + source);
      if (isLinkRun(run)) links.push({ start: from, end: text.length, run });
    }
    if (text.length === start) {
      // An empty paragraph still takes its place (its line), so its look applies.
      runs.push({ ...look, start, end: start });
    }
    if (index < paragraphs.length - 1) {
      text += "\n";
      sources.push(-1);
    }
    out.push({ start, end: text.length, lineHeight, spacingAfter: index < paragraphs.length - 1 ? spacingAfter : 0 });
  });
  return { text, runs: runs.filter((run) => run.end > run.start), paragraphs: out, sources, links };
}

/**
 * A native selection (shown offsets, either order) as a span of its part: from the first selected character that is
 * the part's to just after the last one. Null when none is. guideAnchors.describeSpan then trims and anchors it.
 */
export function partSpan(doc: ProseDocument, selectionStart: number, selectionEnd: number): { start: number; end: number } | null {
  const from = Math.max(0, Math.min(selectionStart, selectionEnd));
  const to = Math.min(doc.sources.length, Math.max(selectionStart, selectionEnd));
  let first = -1;
  let last = -1;
  for (let index = from; index < to; index++) {
    if (doc.sources[index] < 0) continue;
    if (first < 0) first = index;
    last = index;
  }
  if (first < 0) return null;
  return { start: doc.sources[first], end: doc.sources[last] + 1 };
}

/**
 * Where a part span is shown: the stretches of shown characters inside it, joined across characters the part
 * doesn't have (a line break between paragraphs) when the span goes on after them.
 */
export function shownRanges(doc: ProseDocument, start: number, end: number): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let open = -1;
  let lastInside = -1;
  for (let index = 0; index <= doc.sources.length; index++) {
    const source = index < doc.sources.length ? doc.sources[index] : -2;
    if (source === -1) continue;
    const inside = source >= start && source < end;
    if (inside) {
      if (open < 0) open = index;
      lastInside = index;
    } else if (open >= 0) {
      out.push({ start: open, end: lastInside + 1 });
      open = -1;
    }
  }
  return out;
}

/** The whole shown stretch of a part span (to select it again), or null when none of it is shown here. */
export function shownSpan(doc: ProseDocument, start: number, end: number): { start: number; end: number } | null {
  const ranges = shownRanges(doc, start, end);
  return ranges.length ? { start: ranges[0].start, end: ranges[ranges.length - 1].end } : null;
}

/** The link under a shown offset, if any. */
export function linkAt(doc: ProseDocument, offset: number): Run | undefined {
  return doc.links.find((link) => offset >= link.start && offset < link.end)?.run;
}

/** The shown words of a native selection, whitespace collapsed (what Copy and Explore take). */
export function shownWords(doc: ProseDocument, selectionStart: number, selectionEnd: number): string {
  return doc.text.slice(Math.min(selectionStart, selectionEnd), Math.max(selectionStart, selectionEnd)).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------------------------------------------
// Marks

/** A saved span where it is in its part now (guideAnchors' PlacedGuideHighlight, any row shape). */
export type PlacedSpan = {
  start: number;
  end: number;
  row: { highlightColor: string | null; underlineColor: string | null; body: string };
};

export type ProseMark = { start: number; end: number; kind: "highlight" | "underline"; color: string; note?: boolean };

/**
 * The marks a document shows for the spans placed in its part: each highlight behind its words, each underline under
 * them, and a span with a note but no underline of its own gets a quiet underline (`note`), so the note can be found
 * again, as on the website.
 */
export function proseMarks(doc: ProseDocument, placed: readonly PlacedSpan[]): ProseMark[] {
  const highlights: ProseMark[] = [];
  const underlines: ProseMark[] = [];
  // The stretch of the part this text shows: spans wholly outside it are skipped without a scan.
  let low = Infinity;
  let high = -Infinity;
  for (const source of doc.sources) {
    if (source < 0) continue;
    if (source < low) low = source;
    if (source > high) high = source;
  }
  for (const { start, end, row } of placed) {
    if (end <= low || start > high) continue;
    const ranges = shownRanges(doc, start, end);
    if (!ranges.length) continue;
    if (row.highlightColor) for (const range of ranges) highlights.push({ ...range, kind: "highlight", color: row.highlightColor });
    if (row.underlineColor) for (const range of ranges) underlines.push({ ...range, kind: "underline", color: row.underlineColor });
    else if (row.body.trim()) for (const range of ranges) underlines.push({ ...range, kind: "underline", color: "note", note: true });
  }
  return [...highlights, ...underlines];
}

// ---------------------------------------------------------------------------------------------------------------
// The selection's reference: "Study guide · <the heading it is under>"

export type PartHeading = { root: string; start: number; end: number };

/** Each heading of some blocks (any depth), as the stretch of its part's text its runs cover. */
export function blockHeadings(blocks: readonly Block[], root: string, rootStart: number | undefined, out: PartHeading[] = []): PartHeading[] {
  if (rootStart == null) return out;
  for (const block of blocks) {
    if (block.kind === "heading") {
      let first = Infinity;
      let last = -Infinity;
      for (const source of block.runs.flatMap(runSources)) {
        if (source < 0) continue;
        if (source < first) first = source;
        if (source > last) last = source;
      }
      if (last >= 0) out.push({ root, start: rootStart + first, end: rootStart + last + 1 });
    } else if (block.kind === "list") {
      for (const item of block.items) blockHeadings(item, root, rootStart, out);
    } else if (block.kind === "quote") {
      blockHeadings(block.blocks, root, rootStart, out);
    }
  }
  return out;
}

const REFERENCE_MAX = 64;

/**
 * "Study guide · <title>" for a selection starting at a part offset: the last heading in the same element that
 * contains or comes before it (the website's guideReference), its text whitespace-collapsed and shortened.
 */
export function guideReference(index: PartIndex, headings: readonly PartHeading[], at: number): string {
  const root = rootAt(index, at);
  let found: PartHeading | null = null;
  for (const heading of headings) {
    if (heading.root !== root || heading.start > at) continue;
    if (!found || heading.start >= found.start) found = heading;
  }
  const title = found ? index.text.slice(found.start, found.end).replace(/\s+/g, " ").trim() : "";
  if (!title) return "Study guide";
  return `Study guide · ${title.length > REFERENCE_MAX ? `${title.slice(0, REFERENCE_MAX - 1).trimEnd()}…` : title}`;
}
