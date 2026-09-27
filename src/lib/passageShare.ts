import { toScriptureVolumeUrlSlug } from "./scriptureVolumes.ts";

/*
  Share links point at a single passage: /share/<volume>/<book>/<chapter>/<verses>.
  The verses segment is a compact spec: "27", "21-28", "21,23,27" or "3,21-28".
  Parsing is forgiving (spaces, en dashes, duplicates, reversed ranges) and
  clamps to the chapter; serializing always yields the shortest canonical form.
*/

const VERSE_SPEC_SEPARATOR = /\s*[,;]\s*/;
const VERSE_RANGE_DASH = /\s*[-–—]\s*/;

export function parseVerseSpec(spec: string | null | undefined, maxVerse: number): number[] | null {
  if (typeof spec !== "string") return null;
  const trimmed = spec.trim();
  if (!trimmed) return null;
  const limit = Number.isFinite(maxVerse) ? Math.floor(maxVerse) : 0;
  if (limit < 1) return null;

  const verses = new Set<number>();
  for (const part of trimmed.split(VERSE_SPEC_SEPARATOR)) {
    if (!part) continue;
    const ends = part.split(VERSE_RANGE_DASH);
    if (ends.length > 2) return null;
    if (!ends.every((end) => /^\d+$/.test(end))) return null;
    const start = Number(ends[0]);
    const end = ends.length === 2 ? Number(ends[1]) : start;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    const low = Math.max(1, Math.min(start, end));
    const high = Math.min(limit, Math.max(start, end));
    for (let verse = low; verse <= high; verse += 1) verses.add(verse);
  }

  if (verses.size === 0) return null;
  return Array.from(verses).sort((a, b) => a - b);
}

export type VerseRun = { start: number; end: number };

/** Groups sorted, deduped verse numbers into contiguous runs. */
export function groupVerseRuns(verses: readonly number[]): VerseRun[] {
  const sorted = Array.from(new Set(verses.filter((verse) => Number.isSafeInteger(verse) && verse > 0))).sort(
    (a, b) => a - b
  );
  const runs: VerseRun[] = [];
  for (const verse of sorted) {
    const last = runs[runs.length - 1];
    if (last && verse === last.end + 1) {
      last.end = verse;
    } else {
      runs.push({ start: verse, end: verse });
    }
  }
  return runs;
}

export function serializeVerseSpec(verses: readonly number[]): string {
  return groupVerseRuns(verses)
    .map((run) => (run.start === run.end ? String(run.start) : `${run.start}-${run.end}`))
    .join(",");
}

export type PassageRef = {
  volume: string;
  book: string;
  chapter: number;
  verses: readonly number[];
};

export function buildShareUrl({ volume, book, chapter, verses }: PassageRef): string {
  const spec = serializeVerseSpec(verses);
  return `/share/${toScriptureVolumeUrlSlug(volume)}/${encodeURIComponent(book)}/${chapter}/${spec}`;
}

/** "Alma 32:21–28", "Alma 32:3, 21–28", "Alma 32:27". Uses an en dash for ranges. */
export function formatPassageReference(bookLabel: string, chapter: number, verses: readonly number[]): string {
  const runs = groupVerseRuns(verses);
  if (runs.length === 0) return `${bookLabel} ${chapter}`;
  const spec = runs.map((run) => (run.start === run.end ? String(run.start) : `${run.start}–${run.end}`)).join(", ");
  return `${bookLabel} ${chapter}:${spec}`;
}
