// Scripture search over the bundled dataset, with the web's rules (src/lib/localScriptureSearch.ts and
// browserScriptureStorage.ts's bundle search): a query with a digit also offers references ("alma 32",
// "1 ne 3:7"); verse matches are phrase matches on normalized text, in canonical volume order, at most 40
// verses, grouped by chapter and ranked by how often the words appear.

import { getQuickNavSuggestions, getScriptureVolumeLabel, toScriptureVolumeUrlSlug } from "../shared/web";
import { loadVolume, VOLUME_IDS, type VolumeId } from "./scripture";

export const MAX_REFERENCE_RESULTS = 8;
export const MAX_VERSE_RESULTS = 40;

export type ReferenceResult = {
  id: string;
  label: string;
  volume: string;
  book: string;
  chapter: number;
  verse?: number;
  volumeTitle: string;
};

export type VerseResultGroup = {
  id: string;
  reference: string;
  volume: string;
  book: string;
  chapter: number;
  volumeTitle: string;
  matchCount: number;
  matchedVerses: number[];
  verseLabel: string;
  snippets: Array<{ verseNumber: number; snippet: string }>;
};

export type SearchResults = { references: ReferenceResult[]; verses: VerseResultGroup[]; truncated: boolean };

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** A snippet around the first match, cut at word boundaries, with "..." where text was dropped. */
export function createSnippet(text: string, query: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  const lower = compact.toLowerCase();
  const terms = normalizeText(query).split(" ").filter(Boolean);
  let matchIndex = lower.indexOf(query.trim().toLowerCase());
  for (const term of terms) {
    if (matchIndex >= 0) break;
    matchIndex = lower.indexOf(term);
  }
  if (matchIndex < 0) return compact.length > 180 ? `${compact.slice(0, 177).trimEnd()}...` : compact;
  const roughStart = Math.max(0, matchIndex - 52);
  const roughEnd = Math.min(compact.length, matchIndex + Math.max(query.length, 24) + 76);
  const start = roughStart > 0 ? compact.indexOf(" ", roughStart) + 1 : 0;
  const endSpace = compact.lastIndexOf(" ", roughEnd);
  const end = endSpace > start ? endSpace : roughEnd;
  return `${start > 0 ? "..." : ""}${compact.slice(start, end).trim()}${end < compact.length ? "..." : ""}`;
}

function verseLabel(verses: number[]): string {
  const parts: string[] = [];
  let start = verses[0];
  let end = verses[0];
  for (const verse of verses.slice(1)) {
    if (verse === end + 1) {
      end = verse;
      continue;
    }
    parts.push(start === end ? `${start}` : `${start}-${end}`);
    start = end = verse;
  }
  if (start !== undefined) parts.push(start === end ? `${start}` : `${start}-${end}`);
  return parts.join(", ");
}

export function searchScriptures(query: string, options: { volume?: VolumeId } = {}): SearchResults {
  const trimmed = query.trim();
  const normalized = normalizeText(trimmed);
  if (!normalized) return { references: [], verses: [], truncated: false };

  const references: ReferenceResult[] = /\d/.test(trimmed)
    ? getQuickNavSuggestions(trimmed, MAX_REFERENCE_RESULTS)
        .filter((item) => !options.volume || item.volume === options.volume)
        .map((item) => ({
          id: item.key,
          label: item.label,
          volume: item.volume,
          book: item.book,
          chapter: item.chapter,
          verse: item.verse,
          volumeTitle: getScriptureVolumeLabel(item.volume),
        }))
    : [];

  const groups = new Map<string, VerseResultGroup>();
  let found = 0;
  let truncated = false;
  outer: for (const id of options.volume ? [options.volume] : VOLUME_IDS) {
    const volume = loadVolume(id);
    if (!volume) continue;
    const volumeTitle = volume.bundle.volume.title;
    for (const book of volume.bundle.books) {
      for (const chapter of book.chapters) {
        const reference = `${book.title} ${chapter.chapter}`;
        for (const verse of chapter.verses) {
          const searchText = normalizeText(`${volumeTitle} ${book.title} ${reference} ${verse.verse} ${verse.text}`);
          if (!searchText.includes(normalized)) continue;
          if (found >= MAX_VERSE_RESULTS) {
            truncated = true;
            break outer;
          }
          found += 1;
          const key = `${id}:${book.book}:${chapter.chapter}`;
          const score = Math.max(1, countOccurrences(normalizeText(verse.text), normalized));
          const group = groups.get(key);
          if (group) {
            group.matchedVerses.push(verse.verse);
            group.matchCount += score;
            if (group.snippets.length < 3) group.snippets.push({ verseNumber: verse.verse, snippet: createSnippet(verse.text, trimmed) });
          } else {
            groups.set(key, {
              id: key,
              reference,
              volume: toScriptureVolumeUrlSlug(id),
              book: book.book,
              chapter: chapter.chapter,
              volumeTitle,
              matchCount: score,
              matchedVerses: [verse.verse],
              verseLabel: "",
              snippets: [{ verseNumber: verse.verse, snippet: createSnippet(verse.text, trimmed) }],
            });
          }
        }
      }
    }
  }

  const verses = Array.from(groups.values())
    .map((group) => ({ ...group, verseLabel: verseLabel(group.matchedVerses) }))
    .sort(
      (a, b) =>
        b.matchCount - a.matchCount || b.matchedVerses.length - a.matchedVerses.length || a.reference.localeCompare(b.reference)
    );
  return { references, verses, truncated };
}
