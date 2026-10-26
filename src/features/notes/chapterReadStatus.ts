import type { InsightDraftSummary } from "../../lib/appData";
import { normalizeScriptureVolume } from "../../lib/scriptureVolumes";
import type { NoteSource, ReadingLogRow } from "./journal";

type Chapter = { volume: string; book: string; chapter: number };
export type ReadPassage = { start: number; end: number; readings: ReadingLogRow[] };

export function sourceMatchesChapter(source: NoteSource | null | undefined, chapter: Chapter): boolean {
  return source?.kind === "scripture" && !!source.volume && !!source.book &&
    normalizeScriptureVolume(source.volume) === normalizeScriptureVolume(chapter.volume) &&
    source.book.toLowerCase().replace(/[^a-z0-9]/g, "") === chapter.book.toLowerCase().replace(/[^a-z0-9]/g, "") &&
    source.chapter === chapter.chapter;
}

/** Reading-only entries have a title but no note text. Older block-based insights keep their markers. */
export function hasReaderNote(draft: InsightDraftSummary & { has_reflection?: boolean }): boolean {
  if (draft.has_reflection !== undefined) return draft.has_reflection;
  if (draft.markdown_body !== undefined) return !!draft.markdown_body.trim();
  if (draft.markdown_canonical) return !!draft.excerpt?.trim();
  return true;
}

/** Merge overlapping and adjoining logs against the verses actually present in this chapter. */
export function chapterReadPassages(readings: readonly ReadingLogRow[], chapter: Chapter, verses: readonly number[]) {
  const byVerse = new Map<number, ReadingLogRow[]>();
  for (const reading of readings) {
    if (!sourceMatchesChapter(reading.source, chapter)) continue;
    const { verseStart, verseEnd } = reading.source;
    const start = verseStart === undefined ? -Infinity : Math.min(verseStart, verseEnd ?? verseStart);
    const end = verseStart === undefined ? Infinity : Math.max(verseStart, verseEnd ?? verseStart);
    for (const verse of verses) {
      if (verse < start || verse > end) continue;
      const rows = byVerse.get(verse) ?? [];
      if (!rows.some(row => row.id === reading.id)) rows.push(reading);
      byVerse.set(verse, rows);
    }
  }
  const passages = new Map<number, ReadPassage>();
  let passage: ReadPassage | undefined;
  for (const verse of [...byVerse.keys()].sort((a, b) => a - b)) {
    if (!passage || verse !== passage.end + 1) passage = { start: verse, end: verse, readings: [] };
    passage.end = verse;
    for (const reading of byVerse.get(verse)!) {
      if (!passage.readings.some(row => row.id === reading.id)) passage.readings.push(reading);
    }
    passages.set(verse, passage);
  }
  return passages;
}
