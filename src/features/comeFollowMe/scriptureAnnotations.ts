// Which stored verse a gesture in the scripture pane means, and the viewer's annotations per verse. Pure, so
// the identity rules are testable without a DOM.

import { parseScriptureAnchor } from "../../lib/cfm/cfmAnchors.ts";
import type { ChapterAnnotations, VerseAnnotation } from "../annotations/verseAnnotations.ts";

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
 * The verse a text selection annotates: the verse it starts in (the standard reader likewise annotates the
 * first selected verse), else the first verse it touches (a selection starting in a chapter heading). Each
 * verse's identity is read from its own element, so a selection running across a chapter boundary
 * annotates the verse where it starts, in that verse's own chapter. `touchedIds` is read lazily, in order.
 */
export function selectionVerse(startId: string | null, touchedIds: Iterable<string>, slug: string): VerseKey | null {
  const start = startId ? verseFromScriptureId(startId, slug) : null;
  if (start) return start;
  for (const id of touchedIds) {
    const verse = verseFromScriptureId(id, slug);
    if (verse) return verse;
  }
  return null;
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
