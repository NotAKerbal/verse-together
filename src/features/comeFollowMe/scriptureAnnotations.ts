// Which stored verse a gesture in the scripture pane means, and the viewer's annotations per verse. Pure, so
// the identity rules are testable without a DOM.

import { parseScriptureAnchor } from "../../lib/cfm/cfmAnchors.ts";
import { formatPassageReference } from "../../lib/passageShare.ts";
import {
  annotationChapter,
  type AnnotationChapter,
  type ChapterAnnotations,
  type VerseAnnotation,
} from "../annotations/verseAnnotations.ts";

export type VerseKey = { chapter: number; verse: number };

export function verseKey(chapter: number, verse: number): string {
  return `${chapter}:${verse}`;
}

/** A single verse's identity from its element id in the scripture pane; null for headings, ranges, or anything else. */
export function verseFromScriptureId(id: string, slug: string): VerseKey | null {
  const target = parseScriptureAnchor(id, slug);
  if (!target || target.first == null || target.last !== target.first) return null;
  return { chapter: target.chapter, verse: target.first };
}

/**
 * The verses a text selection in the scripture pane covers, in reading order, from the ids of the verse
 * elements it selects text in (as the pane lists them). Each verse's identity is read from its own element, so
 * a selection running across a chapter boundary keeps each verse in its own chapter; chapter headings, ranges,
 * other books, and repeats are left out. The first is the verse the selection starts in, where the full note
 * editor opens (the standard reader likewise opens it on the first selected verse).
 */
export function selectedScriptureVerses(ids: Iterable<string>, slug: string): VerseKey[] {
  const verses: VerseKey[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const verse = verseFromScriptureId(id, slug);
    if (!verse || seen.has(verseKey(verse.chapter, verse.verse))) continue;
    seen.add(verseKey(verse.chapter, verse.verse));
    verses.push(verse);
  }
  return verses;
}

/** Selected verses per chapter, in order: a chapter's marks are written together (setVerseMarks takes one chapter). */
export function versesByChapter(verses: readonly VerseKey[]): Array<{ chapter: number; verses: number[] }> {
  const out: Array<{ chapter: number; verses: number[] }> = [];
  for (const { chapter, verse } of verses) {
    const group = out.find((entry) => entry.chapter === chapter);
    if (!group) out.push({ chapter, verses: [verse] });
    else if (!group.verses.includes(verse)) group.verses.push(verse);
  }
  return out;
}

/**
 * What a quick mark writes for a selection: each chapter's selected verses under that chapter's stored identity
 * (annotationChapter: the rows the standard reader reads too), so a selection across a chapter break marks each
 * verse in its own chapter.
 */
export function selectionMarkWrites(
  book: { volume: string; slug: string },
  verses: readonly VerseKey[]
): Array<{ target: AnnotationChapter; verses: number[] }> {
  return versesByChapter(verses).map((group) => ({
    target: annotationChapter(book.volume, book.slug, group.chapter),
    verses: group.verses,
  }));
}

/** A selection's reference: "Isaiah 53:4–6", or across a chapter break "Isaiah 52:13–15; 53:1–2". */
export function formatScriptureSelection(bookLabel: string, verses: readonly VerseKey[]): string {
  return versesByChapter(verses)
    .map((group, index) => {
      const reference = formatPassageReference(bookLabel, group.chapter, group.verses);
      return index === 0 ? reference : reference.slice(bookLabel.length + 1);
    })
    .join("; ");
}

/**
 * Per-chapter annotation query results (keyed by chapter number, as passed to useQueries: undefined while
 * loading, an Error if it failed) merged into rows per verse key. A chapter counts as loaded only once its
 * own result has arrived; rows never cross from one chapter to another.
 */
export function collectChapterAnnotations(
  chapters: readonly number[],
  results: Record<string, unknown>
): { rows: Map<string, VerseAnnotation[]>; loaded: Set<number> } {
  const rows = new Map<string, VerseAnnotation[]>();
  const loaded = new Set<number>();
  for (const chapter of chapters) {
    const result = results[String(chapter)];
    if (!result || result instanceof Error || typeof result !== "object") continue;
    loaded.add(chapter);
    for (const [key, verseRows] of Object.entries((result as ChapterAnnotations).by_verse ?? {})) {
      const verse = Number(key);
      if (Number.isInteger(verse) && verse > 0 && verseRows?.length) rows.set(verseKey(chapter, verse), verseRows);
    }
  }
  return { rows, loaded };
}
