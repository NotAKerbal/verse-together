// The reader's verse annotations for each chapter of a lesson's reading, keyed by the chapter's range key (see
// RangeEntry), so a verse of Lamentations 1 is never read as Jeremiah 1's. The lesson screen's only read of verse
// annotations: the study's source (this device, or the account) is chosen here, never in the screen.

import { useMemo } from "react";
import type { RangeEntry } from "../../cfm/guideTypes";
import { annotationChapter, type VerseAnnotation } from "../../shared/web";
import { useVerseAnnotations } from "../../storage/verseAnnotations";

export function useLessonVerseAnnotations(entries: readonly RangeEntry[]): ReadonlyMap<number, ReadonlyMap<number, VerseAnnotation>> {
  const chapters = useMemo(() => entries.map((entry) => annotationChapter(entry.volume, entry.slug, entry.chapter)), [entries]);
  const maps = useVerseAnnotations(chapters);
  return useMemo(() => new Map(entries.map((entry, index) => [entry.key, maps[index]])), [entries, maps]);
}
