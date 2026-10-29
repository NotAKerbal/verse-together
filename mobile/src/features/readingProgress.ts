// Which chapters have logged reading, from the journal's own entries (an entry whose reading is logged for a
// scripture source, or, signed in, a reading in the account's log). Nothing is inferred from merely opening a chapter.

import { normalizeScriptureVolume, type DeviceStudy, type JournalEntry } from "../shared/web";

export type ReadPassage = { chapter: number; start?: number; end?: number; readAt: string; entryId: string };

export function readPassages(data: DeviceStudy, volume: string, book: string): ReadPassage[] {
  const canonical = normalizeScriptureVolume(volume);
  const out: ReadPassage[] = [];
  for (const note of data.notes) {
    const source = note.source;
    if (note.owner !== null || !note.reading_at || source?.kind !== "scripture") continue;
    if (!source.volume || !source.book || !source.chapter) continue;
    if (normalizeScriptureVolume(source.volume) !== canonical || source.book !== book) continue;
    out.push({ chapter: source.chapter, start: source.verseStart, end: source.verseEnd, readAt: note.reading_at, entryId: note.id });
  }
  return out;
}

/** The same, from journal entries (this device's or the signed-in account's, as the Journal shows them). */
export function readPassagesFromEntries(entries: readonly JournalEntry[], volume: string, book: string): ReadPassage[] {
  const canonical = normalizeScriptureVolume(volume);
  const out: ReadPassage[] = [];
  for (const entry of entries) {
    const readAt = entry.kind === "note" ? entry.reading_at : entry.kind === "reading" ? entry.read_at : null;
    const source = entry.source;
    if (!readAt || source?.kind !== "scripture" || !source.volume || !source.book || !source.chapter) continue;
    if (normalizeScriptureVolume(source.volume) !== canonical || source.book !== book) continue;
    out.push({ chapter: source.chapter, start: source.verseStart, end: source.verseEnd, readAt, entryId: entry.id });
  }
  return out;
}

export function readChapterSet(data: DeviceStudy, volume: string, book: string): Set<number> {
  return new Set(readPassages(data, volume, book).map((passage) => passage.chapter));
}

/** Per verse, the logged passage it belongs to (for the reader's margin line), first logged wins. */
export function readVerseMap(passages: ReadPassage[], chapter: number, verseCount: number): Map<number, { start: number; end: number }> {
  const map = new Map<number, { start: number; end: number }>();
  for (const passage of passages) {
    if (passage.chapter !== chapter) continue;
    const start = passage.start ?? 1;
    const end = passage.end ?? (passage.start ?? verseCount);
    for (let verse = start; verse <= end; verse++) if (!map.has(verse)) map.set(verse, { start, end });
  }
  return map;
}
